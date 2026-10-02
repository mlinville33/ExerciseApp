import type {
  SessionDetail, SessionSummary, SetLog, SetLogInput, TrainingSession, WeightUnit,
} from '../types';
import { all, db, one, run } from './db';
import { ensureExercise } from './seed';
import {
  DEFAULT_UNIT, bandLevel, fromKg, normaliseUnit, toKg, utcNowIso, volumeKgSql,
} from './units';

/** Ports routers/sessions.py. */

function sessionRow(row: TrainingSession): TrainingSession {
  return {
    id: row.id,
    workout_id: row.workout_id,
    workout_name: row.workout_name,
    started_at: row.started_at,
    completed_at: row.completed_at,
    notes: row.notes,
  };
}

export async function loadSession(
  sessionId: number,
  unit: WeightUnit = DEFAULT_UNIT
): Promise<SessionDetail> {
  const training = await one<TrainingSession>(
    'SELECT * FROM sessions WHERE id = ?;', [sessionId]
  );
  if (!training) throw new Error('Session not found');

  const resolvedUnit = normaliseUnit(unit);

  const logs = await all<SetLog>(
    `SELECT l.*, e.name AS exercise_name, e.category, e.kind
       FROM set_logs l
       JOIN exercises e ON e.id = l.exercise_id
      WHERE l.session_id = ?
      ORDER BY l.logged_at, l.id;`,
    [sessionId]
  );

  // Sets may have been logged in either unit, so total in kg then convert once.
  const volumeKg = logs.reduce(
    (total, log) => total + (log.reps || 0) * (toKg(log.weight, log.weight_unit) || 0),
    0
  );

  return {
    ...sessionRow(training),
    logs,
    unit: resolvedUnit,
    total_volume: fromKg(volumeKg, resolvedUnit) ?? 0,
    band_sets: logs.filter((log) => log.band).length,
  };
}

export async function listSessions(
  limit = 50,
  unit: WeightUnit = DEFAULT_UNIT
): Promise<SessionSummary[]> {
  const resolvedUnit = normaliseUnit(unit);

  const rows = await all<
    TrainingSession & { set_count: number; band_sets: number; volume_kg: number }
  >(
    `SELECT s.*,
            (SELECT COUNT(*) FROM set_logs l WHERE l.session_id = s.id) AS set_count,
            (SELECT COUNT(*) FROM set_logs l
              WHERE l.session_id = s.id AND l.band IS NOT NULL) AS band_sets,
            (SELECT COALESCE(SUM(${volumeKgSql()}), 0.0) FROM set_logs
              WHERE set_logs.session_id = s.id) AS volume_kg
       FROM sessions s
      ORDER BY s.started_at DESC
      LIMIT ?;`,
    [limit]
  );

  return rows.map((row) => ({
    ...sessionRow(row),
    set_count: row.set_count,
    band_sets: row.band_sets,
    total_volume: fromKg(row.volume_kg, resolvedUnit) ?? 0,
    unit: resolvedUnit,
  }));
}

export async function startSession(
  payload: { workout_id?: number | null; notes?: string },
  unit: WeightUnit = DEFAULT_UNIT
): Promise<SessionDetail> {
  let workoutName = '';
  if (payload.workout_id !== null && payload.workout_id !== undefined) {
    const workout = await one<{ name: string }>(
      'SELECT name FROM workouts WHERE id = ?;', [payload.workout_id]
    );
    if (!workout) throw new Error('Workout not found');
    workoutName = workout.name;
  }

  const sessionId = await run(
    'INSERT INTO sessions (workout_id, workout_name, started_at, completed_at, notes) VALUES (?,?,?,NULL,?);',
    [payload.workout_id ?? null, workoutName, utcNowIso(), payload.notes ?? '']
  );

  return loadSession(sessionId!, unit);
}

/** The most recent session that has not been finished yet, if there is one. */
export async function activeSession(
  unit: WeightUnit = DEFAULT_UNIT
): Promise<SessionDetail | null> {
  const row = await one<{ id: number }>(
    'SELECT id FROM sessions WHERE completed_at IS NULL ORDER BY started_at DESC LIMIT 1;'
  );
  if (!row) return null;
  return loadSession(row.id, unit);
}

export async function getSession(sessionId: number, unit: WeightUnit = DEFAULT_UNIT) {
  return loadSession(sessionId, unit);
}

export async function updateSession(
  sessionId: number,
  payload: { notes?: string; completed?: boolean },
  unit: WeightUnit = DEFAULT_UNIT
): Promise<SessionDetail> {
  const existing = await one<{ id: number }>(
    'SELECT id FROM sessions WHERE id = ?;', [sessionId]
  );
  if (!existing) throw new Error('Session not found');

  const assignments: string[] = [];
  const params: unknown[] = [];

  if (payload.notes !== undefined && payload.notes !== null) {
    assignments.push('notes = ?');
    params.push(payload.notes);
  }
  if (payload.completed !== undefined && payload.completed !== null) {
    assignments.push('completed_at = ?');
    params.push(payload.completed ? utcNowIso() : null);
  }
  if (assignments.length) {
    params.push(sessionId);
    await run(`UPDATE sessions SET ${assignments.join(', ')} WHERE id = ?;`, params);
  }

  return loadSession(sessionId, unit);
}

export async function deleteSession(sessionId: number) {
  const existing = await one<{ id: number }>(
    'SELECT id FROM sessions WHERE id = ?;', [sessionId]
  );
  if (!existing) throw new Error('Session not found');
  await run('DELETE FROM set_logs WHERE session_id = ?;', [sessionId]);
  await run('DELETE FROM sessions WHERE id = ?;', [sessionId]);
  return null;
}

export async function logSet(
  sessionId: number,
  payload: SetLogInput,
  unit: WeightUnit = DEFAULT_UNIT
): Promise<SessionDetail> {
  const training = await one<{ id: number }>(
    'SELECT id FROM sessions WHERE id = ?;', [sessionId]
  );
  if (!training) throw new Error('Session not found');

  let exerciseId = payload.exercise_id;
  if (exerciseId === null || exerciseId === undefined) {
    if (!payload.exercise_name) {
      throw new Error('A log needs an exercise_id or an exercise_name');
    }
    exerciseId = await ensureExercise(await db(), payload.exercise_name);
  }

  // Record the unit the set was actually entered in, falling back to the unit
  // the client is currently working in.
  const hasWeight = payload.weight !== null && payload.weight !== undefined;
  const storedUnit = hasWeight ? normaliseUnit(payload.weight_unit || unit) : null;

  await run(
    `INSERT INTO set_logs
       (session_id, exercise_id, set_number, reps, weight, weight_unit, band, band_level,
        duration_seconds, rpe, pain, logged_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?);`,
    [
      sessionId,
      exerciseId,
      payload.set_number ?? 1,
      payload.reps ?? null,
      hasWeight ? payload.weight : null,
      storedUnit,
      payload.band ?? null,
      bandLevel(payload.band),
      payload.duration_seconds ?? null,
      payload.rpe ?? null,
      payload.pain ?? null,
      utcNowIso(),
    ]
  );

  return loadSession(sessionId, unit);
}

export async function deleteLog(
  sessionId: number,
  logId: number,
  unit: WeightUnit = DEFAULT_UNIT
): Promise<SessionDetail> {
  const log = await one<{ id: number }>(
    'SELECT id FROM set_logs WHERE id = ? AND session_id = ?;', [logId, sessionId]
  );
  if (!log) throw new Error('Set log not found');
  await run('DELETE FROM set_logs WHERE id = ?;', [logId]);
  return loadSession(sessionId, unit);
}
