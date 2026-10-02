import type {
  DailyVolume, Exercise, ExerciseHistoryPoint, ExerciseProgress, PersonalBest, PersonalBests,
  ProgressSummary, SetLog, TrackedExercise, WeightUnit,
} from '../types';
import { all, one, scalar } from './db';
import {
  DEFAULT_UNIT, estimateOneRepMax, fromKg, normaliseUnit, toKg, volumeKgSql,
} from './units';

/** Ports routers/progress.py. */

/** Parse a stored ISO timestamp, tolerating the ones without a zone. */
function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The calendar date of a timestamp, as YYYY-MM-DD in UTC. */
function isoDate(value: string | null | undefined): string | null {
  const parsed = parseIso(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/** Headline numbers for the dashboard. */
export async function summary(
  days = 30,
  unit: WeightUnit = DEFAULT_UNIT
): Promise<ProgressSummary> {
  const resolvedUnit = normaliseUnit(unit);
  const since = daysAgoIso(days);

  const totals = await one<{
    sessions: number; sets: number; reps: number; volume_kg: number; band_sets: number;
  }>(
    `SELECT COUNT(DISTINCT s.id)                          AS sessions,
            COUNT(l.id)                                   AS sets,
            COALESCE(SUM(COALESCE(l.reps, 0)), 0)         AS reps,
            COALESCE(SUM(${volumeKgSql('l')}), 0.0)       AS volume_kg,
            COALESCE(SUM(CASE WHEN l.band IS NOT NULL THEN 1 ELSE 0 END), 0) AS band_sets
       FROM sessions s
       LEFT JOIN set_logs l ON l.session_id = s.id
      WHERE s.started_at >= ?;`,
    [since]
  );

  const allTime = await scalar<number>('SELECT COUNT(*) AS n FROM sessions;');

  const rehabSets = await scalar<number>(
    `SELECT COUNT(*) AS n
       FROM set_logs l
       JOIN exercises e ON e.id = l.exercise_id
       JOIN sessions s  ON s.id = l.session_id
      WHERE e.kind = 'rehab' AND s.started_at >= ?;`,
    [since]
  );

  const startedRows = await all<{ started_at: string }>('SELECT started_at FROM sessions;');
  const trainedDays = new Set<string>();
  for (const row of startedRows) {
    const day = isoDate(row.started_at);
    if (day) trainedDays.add(day);
  }

  // A streak counts consecutive days back from today, tolerating a start
  // yesterday - training this morning and last night is still a streak.
  const today = new Date().toISOString().slice(0, 10);
  let cursor = new Date(trainedDays.has(today) ? today : new Date(Date.now() - 86400000));
  let streak = 0;
  while (trainedDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }

  return {
    window_days: days,
    unit: resolvedUnit,
    sessions: totals?.sessions ?? 0,
    sets: totals?.sets ?? 0,
    reps: totals?.reps ?? 0,
    volume: fromKg(totals?.volume_kg ?? 0, resolvedUnit) ?? 0,
    band_sets: totals?.band_sets ?? 0,
    rehab_sets: rehabSets ?? 0,
    total_sessions_all_time: allTime ?? 0,
    active_days: trainedDays.size,
    current_streak_days: streak,
  };
}

/** Training volume per calendar day, with empty days filled in as zero. */
export async function volumeByDay(
  days = 30,
  unit: WeightUnit = DEFAULT_UNIT
): Promise<DailyVolume[]> {
  const resolvedUnit = normaliseUnit(unit);

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const sinceDate = new Date(startOfToday.getTime() - (days - 1) * 86400000);

  const rows = await all<{ id: number; started_at: string; volume_kg: number; sets: number }>(
    `SELECT s.id, s.started_at,
            COALESCE(SUM(${volumeKgSql('l')}), 0.0) AS volume_kg,
            COUNT(l.id) AS sets
       FROM sessions s
       LEFT JOIN set_logs l ON l.session_id = s.id
      WHERE s.started_at >= ?
      GROUP BY s.id;`,
    [sinceDate.toISOString()]
  );

  const buckets = new Map<string, DailyVolume>();
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(sinceDate.getTime() + offset * 86400000).toISOString().slice(0, 10);
    buckets.set(day, { date: day, volume: 0, sets: 0, sessions: 0, unit: resolvedUnit });
  }

  for (const row of rows) {
    const key = isoDate(row.started_at);
    const bucket = key ? buckets.get(key) : undefined;
    if (!bucket) continue;
    bucket.volume += row.volume_kg;
    bucket.sets += row.sets;
    bucket.sessions += 1;
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    volume: fromKg(bucket.volume, resolvedUnit) ?? 0,
  }));
}

/** Every exercise with at least one logged set, most recently trained first. */
export async function trackedExercises(): Promise<TrackedExercise[]> {
  return all<TrackedExercise>(
    `SELECT e.id, e.name, e.category, e.kind,
            COUNT(l.id) AS set_count,
            COALESCE(SUM(CASE WHEN l.band IS NOT NULL THEN 1 ELSE 0 END), 0) AS band_sets,
            MAX(l.logged_at) AS last_logged
       FROM exercises e
       JOIN set_logs l ON l.exercise_id = e.id
      GROUP BY e.id
      ORDER BY MAX(l.logged_at) DESC;`
  );
}

/** A history bucket while it is still accumulating, before pain is averaged. */
type HistoryBucket = ExerciseHistoryPoint & { painScores: Array<number | null> };

/**
 * Per-session history for one exercise, plus personal bests.
 *
 * Weighted and band work are tracked separately: a band has no weight, so it
 * contributes reps and its own strength ladder rather than volume.
 */
export async function exerciseProgress(
  exerciseId: number,
  unit: WeightUnit = DEFAULT_UNIT
): Promise<ExerciseProgress> {
  const resolvedUnit = normaliseUnit(unit);

  const exercise = await one<Exercise>('SELECT * FROM exercises WHERE id = ?;', [exerciseId]);
  if (!exercise) throw new Error('Exercise not found');

  const logs = await all<SetLog & { started_at: string }>(
    `SELECT l.*, s.started_at
       FROM set_logs l
       JOIN sessions s ON s.id = l.session_id
      WHERE l.exercise_id = ?
      ORDER BY l.logged_at;`,
    [exerciseId]
  );

  const history = new Map<string, HistoryBucket>();
  let bestWeightKg: number | null = null;
  let bestReps: number | null = null;
  let bestOneRepMaxKg: number | null = null;
  let bestBand: string | null = null;
  let bestBandLevel: number | null = null;

  for (const log of logs) {
    const key = isoDate(log.started_at) || 'unknown';
    if (!history.has(key)) {
      history.set(key, {
        date: key, sets: 0, reps: 0, volume: 0,
        top_weight: null, top_band: null, top_band_level: null,
        avg_pain: null, unit: resolvedUnit, painScores: [],
      });
    }
    const bucket = history.get(key)!;

    const reps = log.reps || 0;
    const weightKg = toKg(log.weight, log.weight_unit);
    bucket.sets += 1;
    bucket.reps += reps;
    bucket.volume += reps * (weightKg || 0);

    if (weightKg !== null) {
      if (bucket.top_weight === null || weightKg > bucket.top_weight) bucket.top_weight = weightKg;
      if (bestWeightKg === null || weightKg > bestWeightKg) bestWeightKg = weightKg;
    }

    if (log.band) {
      const level = log.band_level;
      // A custom band label has no level, so it never displaces a ranked one.
      if (bucket.top_band === null || (level !== null && (bucket.top_band_level || 0) < level)) {
        bucket.top_band = log.band;
        bucket.top_band_level = level;
      }
      if (bestBand === null || (level !== null && (bestBandLevel || 0) < level)) {
        bestBand = log.band;
        bestBandLevel = level;
      }
    }

    if (log.reps !== null && (bestReps === null || log.reps > bestReps)) bestReps = log.reps;

    const estimate = estimateOneRepMax(weightKg, log.reps);
    if (estimate !== null && (bestOneRepMaxKg === null || estimate > bestOneRepMaxKg)) {
      bestOneRepMaxKg = estimate;
    }

    bucket.painScores.push(log.pain);
  }

  const historyPoints: ExerciseHistoryPoint[] = [...history.values()].map((bucket) => {
    const { painScores, ...point } = bucket;
    const recorded = painScores.filter((value): value is number => value !== null);
    return {
      ...point,
      avg_pain: recorded.length
        ? Math.round((recorded.reduce((total, value) => total + value, 0) / recorded.length) * 10) / 10
        : null,
      volume: fromKg(bucket.volume, resolvedUnit) ?? 0,
      top_weight: fromKg(bucket.top_weight, resolvedUnit),
    };
  });

  return {
    exercise,
    unit: resolvedUnit,
    history: historyPoints,
    personal_best: {
      weight: fromKg(bestWeightKg, resolvedUnit),
      unit: resolvedUnit,
      reps: bestReps,
      estimated_one_rep_max: fromKg(bestOneRepMaxKg, resolvedUnit),
      band: bestBand,
      band_level: bestBandLevel,
    },
  };
}

/**
 * The best weight, reps, 1RM estimate and band for every trained exercise.
 *
 * `excludeSession` is what makes this usable from a running session: the caller
 * asks for the bests that stood before today, then decides live whether each
 * set beats them. Without the exclusion the first set logged would become its
 * own record and nothing could ever be a personal best.
 */
export async function personalBests(
  excludeSession: number | null = null,
  unit: WeightUnit = DEFAULT_UNIT
): Promise<PersonalBests> {
  const resolvedUnit = normaliseUnit(unit);

  const logs = await all<Pick<
    SetLog, 'exercise_id' | 'reps' | 'weight' | 'weight_unit' | 'band' | 'band_level'
  >>(
    `SELECT exercise_id, reps, weight, weight_unit, band, band_level
       FROM set_logs
      ${excludeSession ? 'WHERE session_id != ?' : ''};`,
    excludeSession ? [excludeSession] : []
  );

  // Accumulated in kilograms, then converted once at the end.
  const bests = new Map<number, PersonalBest>();

  for (const log of logs) {
    if (!bests.has(log.exercise_id)) {
      bests.set(log.exercise_id, {
        weight: null, reps: null, estimated_one_rep_max: null,
        band: null, band_level: null, unit: resolvedUnit,
      });
    }
    const best = bests.get(log.exercise_id)!;

    const weightKg = toKg(log.weight, log.weight_unit);
    if (weightKg !== null && (best.weight === null || weightKg > best.weight)) {
      best.weight = weightKg;
    }
    if (log.reps !== null && (best.reps === null || log.reps > best.reps)) best.reps = log.reps;

    const estimate = estimateOneRepMax(weightKg, log.reps);
    if (estimate !== null
      && (best.estimated_one_rep_max === null || estimate > best.estimated_one_rep_max)) {
      best.estimated_one_rep_max = estimate;
    }

    // A custom band label carries no level, so it never displaces a ranked one.
    if (log.band && log.band_level !== null
      && (best.band_level === null || log.band_level > best.band_level)) {
      best.band = log.band;
      best.band_level = log.band_level;
    }
  }

  // Keys are strings to match the API, which sent them as JSON object keys.
  const converted: PersonalBests = {};
  for (const [exerciseId, best] of bests) {
    converted[String(exerciseId)] = {
      ...best,
      weight: fromKg(best.weight, resolvedUnit),
      estimated_one_rep_max: fromKg(best.estimated_one_rep_max, resolvedUnit),
    };
  }
  return converted;
}
