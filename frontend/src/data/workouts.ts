import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type {
  CategoryMix, Workout, WorkoutDetail, WorkoutInput, WorkoutItem, WorkoutItemInput,
  WorkoutSummary, WorkoutUpdate,
} from '../types';
import { all, one, run, transaction } from './db';
import { ensureExercise } from './seed';
import { bandLevel, normaliseUnit, utcNowIso } from './units';

/** Ports routers/workouts.py. */

/**
 * The workouts table as SQLite returns it. It has no boolean type, so
 * `archived` comes back as 0 or 1 and is converted on the way out.
 */
type WorkoutRow = Omit<Workout, 'archived'> & { archived: number };

function workoutRow(row: WorkoutRow): Workout {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    joint: row.joint,
    created_at: row.created_at,
    archived: Boolean(row.archived),
  };
}

export async function loadWorkout(workoutId: number): Promise<WorkoutDetail> {
  const workout = await one<WorkoutRow>(
    'SELECT * FROM workouts WHERE id = ?;', [workoutId]
  );
  if (!workout) throw new Error('Workout not found');

  const items = await all<WorkoutItem>(
    `SELECT i.*, e.name AS exercise_name, e.category, e.equipment, e.description
       FROM workout_items i
       JOIN exercises e ON e.id = i.exercise_id
      WHERE i.workout_id = ?
      ORDER BY i.position;`,
    [workoutId]
  );

  return { ...workoutRow(workout), items };
}

export async function listWorkouts(
  { includeArchived = false }: { includeArchived?: boolean } = {}
): Promise<WorkoutSummary[]> {
  const workouts = await all<
    WorkoutRow & {
      item_count: number;
      session_count: number;
      last_performed: string | null;
    }
  >(
    `SELECT w.*,
            (SELECT COUNT(*) FROM workout_items i WHERE i.workout_id = w.id) AS item_count,
            (SELECT COUNT(*) FROM sessions s
              WHERE s.workout_id = w.id AND s.completed_at IS NOT NULL) AS session_count,
            (SELECT MAX(s.started_at) FROM sessions s WHERE s.workout_id = w.id) AS last_performed
       FROM workouts w
      ${includeArchived ? '' : 'WHERE w.archived = 0'}
      ORDER BY w.created_at DESC;`
  );

  // How many items each workout draws from each category, so the client can
  // show what a routine trains without loading every workout in full. One
  // grouped query for the whole list rather than one per workout.
  const mixRows = await all<{ workout_id: number; category: string; count: number }>(
    `SELECT i.workout_id, e.category, COUNT(*) AS count
       FROM workout_items i
       JOIN exercises e ON e.id = i.exercise_id
      GROUP BY i.workout_id, e.category;`
  );

  const mixByWorkout = new Map<number, CategoryMix>();
  for (const row of mixRows) {
    if (!mixByWorkout.has(row.workout_id)) mixByWorkout.set(row.workout_id, {});
    mixByWorkout.get(row.workout_id)![row.category] = row.count;
  }

  return workouts.map((row) => ({
    ...workoutRow(row),
    item_count: row.item_count,
    session_count: row.session_count,
    last_performed: row.last_performed,
    category_mix: mixByWorkout.get(row.id) || {},
  }));
}

/** Turn an incoming item into a concrete exercise id, creating one if needed. */
async function resolveExercise(
  connection: SQLiteDBConnection,
  item: WorkoutItemInput
): Promise<number> {
  if (item.exercise_id !== null && item.exercise_id !== undefined) {
    const found = ((await connection.query(
      'SELECT id FROM exercises WHERE id = ?;', [item.exercise_id]
    )).values ?? []) as Array<{ id: number }>;
    if (!found.length) throw new Error(`Exercise ${item.exercise_id} not found`);
    return item.exercise_id;
  }
  if (item.exercise_name) return ensureExercise(connection, item.exercise_name);
  throw new Error('Each item needs an exercise_id or an exercise_name');
}

async function writeItems(
  connection: SQLiteDBConnection,
  workoutId: number,
  items: WorkoutItemInput[]
) {
  for (let position = 0; position < items.length; position += 1) {
    const item = items[position];
    const exerciseId = await resolveExercise(connection, item);
    const hasWeight = item.target_weight !== null && item.target_weight !== undefined;

    await connection.run(
      `INSERT INTO workout_items
         (workout_id, exercise_id, position, target_sets, target_reps, target_weight,
          target_weight_unit, target_band, target_band_level, hold_seconds, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?);`,
      [
        workoutId,
        exerciseId,
        position,
        item.target_sets ?? 3,
        item.target_reps ?? 10,
        hasWeight ? item.target_weight : null,
        hasWeight ? normaliseUnit(item.target_weight_unit) : null,
        item.target_band ?? null,
        bandLevel(item.target_band),
        item.hold_seconds ?? null,
        item.notes ?? '',
      ],
      false
    );
  }
}

export async function createWorkout(payload: WorkoutInput): Promise<WorkoutDetail> {
  if (!payload.name || !payload.name.trim()) throw new Error('Workout name cannot be empty');

  const workoutId = await transaction(async (connection) => {
    const inserted = await connection.run(
      'INSERT INTO workouts (name, description, kind, joint, created_at, archived) VALUES (?,?,?,?,?,0);',
      [
        payload.name.trim(),
        payload.description ?? '',
        payload.kind ?? 'strength',
        payload.joint ?? null,
        utcNowIso(),
      ],
      false
    );
    const newId = inserted.changes!.lastId!;
    await writeItems(connection, newId, payload.items ?? []);
    return newId;
  });

  return loadWorkout(workoutId);
}

export async function updateWorkout(
  workoutId: number,
  payload: WorkoutUpdate
): Promise<WorkoutDetail> {
  const existing = await one<{ id: number }>(
    'SELECT id FROM workouts WHERE id = ?;', [workoutId]
  );
  if (!existing) throw new Error('Workout not found');

  await transaction(async (connection) => {
    const assignments: string[] = [];
    const params: unknown[] = [];

    if (payload.name !== undefined && payload.name !== null) {
      assignments.push('name = ?');
      params.push(payload.name.trim());
    }
    if (payload.description !== undefined && payload.description !== null) {
      assignments.push('description = ?');
      params.push(payload.description);
    }
    if (payload.archived !== undefined && payload.archived !== null) {
      assignments.push('archived = ?');
      params.push(payload.archived ? 1 : 0);
    }
    if (assignments.length) {
      params.push(workoutId);
      await connection.run(
        `UPDATE workouts SET ${assignments.join(', ')} WHERE id = ?;`, params, false
      );
    }

    // Replacing the list wholesale mirrors the server's delete-orphan
    // behaviour: items that drop out of the payload are removed.
    if (payload.items !== undefined && payload.items !== null) {
      await connection.run('DELETE FROM workout_items WHERE workout_id = ?;', [workoutId], false);
      await writeItems(connection, workoutId, payload.items);
    }
  });

  return loadWorkout(workoutId);
}

export async function deleteWorkout(workoutId: number) {
  const existing = await one<{ id: number }>(
    'SELECT id FROM workouts WHERE id = ?;', [workoutId]
  );
  if (!existing) throw new Error('Workout not found');

  // Past sessions outlive the workout; they keep the name they were run under.
  await run('UPDATE sessions SET workout_id = NULL WHERE workout_id = ?;', [workoutId]);
  await run('DELETE FROM workout_items WHERE workout_id = ?;', [workoutId]);
  await run('DELETE FROM workouts WHERE id = ?;', [workoutId]);
  return null;
}
