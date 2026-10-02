import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { ExerciseKind, RehabJoint } from '../types';
import rehabJson from './library/rehab.json';
import strengthJson from './library/workouts.json';

/** The bundled libraries, given their shapes once at the boundary. */
const rehabLibrary = rehabJson as unknown as {
  disclaimer: string;
  pain_rule: string;
  joints: Record<string, RehabJoint>;
};

const strengthLibrary = strengthJson as unknown as Record<
  string,
  Array<{ name: string; equipment?: string; description?: string }>
>;

/** One row of the exercises table as the libraries define it. */
interface LibraryExercise {
  category: string;
  equipment: string;
  description: string;
  kind: ExerciseKind;
  joints: string;
  phases: string;
}

/**
 * Loads the strength library and the rehab protocols into the exercises table.
 * A port of the server's seed.py.
 *
 * Safe to run on every launch: exercises are keyed by name, so this refreshes
 * metadata without duplicating rows or breaking workouts that reference them.
 */

/**
 * Flatten the protocol library into one record per exercise name.
 *
 * Exercises shared between protocols (an ankle pump serves both knees and
 * ankles) collect every joint and phase they appear in rather than the last one
 * seen, so a single row can track progress across both protocols.
 */
function collectRehab() {
  const collected = new Map<
    string,
    { equipment: string; description: string; joints: string[]; phases: string[] }
  >();

  for (const [joint, jointData] of Object.entries(rehabLibrary.joints || {})) {
    for (const phase of jointData.phases || []) {
      for (const entry of phase.exercises || []) {
        if (!collected.has(entry.name)) {
          collected.set(entry.name, {
            equipment: entry.equipment || 'none',
            description: entry.description || '',
            joints: [],
            phases: [],
          });
        }
        const record = collected.get(entry.name)!;
        if (!record.joints.includes(joint)) record.joints.push(joint);
        const tag = `${joint}:${phase.number}`;
        if (!record.phases.includes(tag)) record.phases.push(tag);
      }
    }
  }

  return collected;
}

/** Every exercise the libraries define, keyed by name. */
export function libraryExercises() {
  const wanted = new Map<string, LibraryExercise>();

  for (const [category, items] of Object.entries(strengthLibrary)) {
    for (const entry of items) {
      wanted.set(entry.name, {
        category,
        equipment: entry.equipment || 'none',
        description: entry.description || '',
        kind: 'strength',
        joints: '',
        phases: '',
      });
    }
  }

  // Rehab is applied second, so an exercise in both libraries is treated as
  // rehab work - matching the server's behaviour exactly.
  for (const [name, record] of collectRehab()) {
    wanted.set(name, {
      category: 'rehab',
      equipment: record.equipment,
      description: record.description,
      kind: 'rehab',
      joints: record.joints.join(','),
      phases: record.phases.join(','),
    });
  }

  return wanted;
}

export async function seedLibrary(
  connection: SQLiteDBConnection,
  { force = false }: { force?: boolean } = {}
) {
  const wanted = libraryExercises();

  const existing = new Map<string, number>();
  const rows = ((await connection.query('SELECT id, name FROM exercises;')).values ?? []) as
    Array<{ id: number; name: string }>;
  for (const row of rows) existing.set(row.name, row.id);

  // Nothing to do when the library is already in and unchanged. Re-running the
  // upsert on every launch is cheap but not free, and this is the common case.
  if (!force && existing.size >= wanted.size) return;

  const statements: Array<{ statement: string; values: unknown[] }> = [];
  for (const [name, fields] of wanted) {
    if (existing.has(name)) {
      statements.push({
        statement:
          'UPDATE exercises SET category=?, equipment=?, description=?, kind=?, joints=?, phases=? WHERE name=?;',
        values: [
          fields.category, fields.equipment, fields.description,
          fields.kind, fields.joints, fields.phases, name,
        ],
      });
    } else {
      statements.push({
        statement:
          'INSERT INTO exercises (name, category, equipment, description, kind, joints, phases) VALUES (?,?,?,?,?,?,?);',
        values: [
          name, fields.category, fields.equipment, fields.description,
          fields.kind, fields.joints, fields.phases,
        ],
      });
    }
  }

  // One transaction for all 150-odd rows, rather than one each.
  if (statements.length) await connection.executeSet(statements, true);
}

/** Return the exercise id for a name, creating a custom entry if it is new. */
export async function ensureExercise(
  connection: SQLiteDBConnection,
  name: string,
  {
    category = 'custom', equipment = 'none', description = '',
    kind = 'strength' as ExerciseKind,
  } = {}
): Promise<number> {
  const trimmed = String(name).trim();
  const found = ((await connection.query('SELECT id FROM exercises WHERE name = ?;', [trimmed]))
    .values ?? []) as Array<{ id: number }>;
  if (found.length) return found[0].id;

  const inserted = await connection.run(
    'INSERT INTO exercises (name, category, equipment, description, kind) VALUES (?,?,?,?,?);',
    [trimmed, category, equipment, description, kind],
    false
  );
  return inserted.changes!.lastId!;
}

export { rehabLibrary, strengthLibrary };
