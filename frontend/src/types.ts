/**
 * The shapes the data layer reads out of SQLite and hands to the UI.
 *
 * These mirror the column names in data/schema.ts exactly. That is the point:
 * a renamed column used to fail silently as `undefined` rendered into the page,
 * and now fails at the point of the rename.
 */

export type WeightUnit = 'kg' | 'lb';

/** Strength work from the library, or rehab work from a protocol. */
export type ExerciseKind = 'strength' | 'rehab';

export interface Exercise {
  id: number;
  name: string;
  category: string;
  equipment: string;
  description: string;
  kind: ExerciseKind;
  /** Comma separated; a rehab exercise can serve more than one joint. */
  joints: string;
  /** Comma separated "joint:phase" tags. */
  phases: string;
}

export interface Workout {
  id: number;
  name: string;
  description: string;
  kind: string;
  joint: string | null;
  created_at: string;
  archived: boolean;
}

export interface WorkoutItem {
  id: number;
  workout_id: number;
  exercise_id: number;
  position: number;
  target_sets: number;
  target_reps: number;
  target_weight: number | null;
  target_weight_unit: WeightUnit | null;
  target_band: string | null;
  target_band_level: number | null;
  hold_seconds: number | null;
  notes: string;
  /** Joined from the exercise, so a workout renders without a second query. */
  exercise_name: string;
  category: string;
  equipment: string;
  description: string;
}

export interface WorkoutDetail extends Workout {
  items: WorkoutItem[];
}

/** How many of a workout's exercises come from each category. */
export type CategoryMix = Record<string, number>;

export interface WorkoutSummary extends Workout {
  item_count: number;
  session_count: number;
  last_performed: string | null;
  category_mix: CategoryMix;
}

export interface SetLog {
  id: number;
  session_id: number;
  exercise_id: number;
  set_number: number;
  reps: number | null;
  weight: number | null;
  weight_unit: WeightUnit | null;
  band: string | null;
  band_level: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  pain: number | null;
  logged_at: string;
  exercise_name: string;
  category: string;
  kind: ExerciseKind;
}

export interface TrainingSession {
  id: number;
  workout_id: number | null;
  workout_name: string;
  started_at: string;
  completed_at: string | null;
  notes: string;
}

export interface SessionDetail extends TrainingSession {
  logs: SetLog[];
  unit: WeightUnit;
  total_volume: number;
  band_sets: number;
}

export interface SessionSummary extends TrainingSession {
  set_count: number;
  band_sets: number;
  total_volume: number;
  unit: WeightUnit;
}

export interface ProgressSummary {
  window_days: number;
  unit: WeightUnit;
  sessions: number;
  sets: number;
  reps: number;
  volume: number;
  band_sets: number;
  rehab_sets: number;
  total_sessions_all_time: number;
  active_days: number;
  current_streak_days: number;
}

export interface DailyVolume {
  date: string;
  volume: number;
  sets: number;
  sessions: number;
  unit: WeightUnit;
}

export interface TrackedExercise {
  id: number;
  name: string;
  category: string;
  kind: ExerciseKind;
  set_count: number;
  band_sets: number;
  last_logged: string;
}

export interface PersonalBest {
  weight: number | null;
  reps: number | null;
  estimated_one_rep_max: number | null;
  band: string | null;
  band_level: number | null;
  unit: WeightUnit;
}

/** Keyed by exercise id as a string, matching the old JSON object keys. */
export type PersonalBests = Record<string, PersonalBest>;

export interface ExerciseHistoryPoint {
  date: string;
  sets: number;
  reps: number;
  volume: number;
  top_weight: number | null;
  top_band: string | null;
  top_band_level: number | null;
  avg_pain: number | null;
  unit: WeightUnit;
}

export interface ExerciseProgress {
  exercise: Exercise;
  unit: WeightUnit;
  history: ExerciseHistoryPoint[];
  personal_best: PersonalBest;
}

/** One exercise as the random generator returns it, before it is saved. */
export interface GeneratedPick {
  name: string;
  category: string;
  equipment: string;
  target_sets: number;
  target_reps: number;
}

export interface Band {
  level: number;
  name: string;
  common_color: string;
}

/* ---------- rehab protocols (static library, not database rows) ---------- */

export interface RehabExercise {
  name: string;
  description: string;
  cues: string[];
  sets: number;
  reps: number;
  hold_seconds: number | null;
  frequency: string;
  equipment: string;
}

export interface RehabPhase {
  number: number;
  name: string;
  goal: string;
  typical_duration: string;
  advance_when: string;
  exercises: RehabExercise[];
}

export interface RehabJoint {
  name: string;
  summary: string;
  common_conditions: string[];
  precautions: string[];
  red_flags: string[];
  phases: RehabPhase[];
}

export interface RehabJointCard {
  joint: string;
  name: string;
  summary: string;
  common_conditions: string[];
  phase_count: number;
  exercise_count: number;
}

export interface RehabIndex {
  disclaimer: string;
  pain_rule: string;
  joints: RehabJointCard[];
}

export interface RehabProtocol extends RehabJoint {
  joint: string;
  disclaimer: string;
  pain_rule: string;
}

/* ---------- inputs ---------- */

export interface WorkoutItemInput {
  exercise_id?: number | null;
  exercise_name?: string | null;
  target_sets?: number;
  target_reps?: number;
  target_weight?: number | null;
  target_weight_unit?: WeightUnit | null;
  target_band?: string | null;
  hold_seconds?: number | null;
  notes?: string;
}

export interface WorkoutInput {
  name: string;
  description?: string;
  kind?: string;
  joint?: string | null;
  items?: WorkoutItemInput[];
}

export interface WorkoutUpdate {
  name?: string;
  description?: string;
  archived?: boolean;
  items?: WorkoutItemInput[];
}

export interface SetLogInput {
  exercise_id?: number | null;
  exercise_name?: string | null;
  set_number?: number;
  reps?: number | null;
  weight?: number | null;
  weight_unit?: WeightUnit | null;
  band?: string | null;
  duration_seconds?: number | null;
  rpe?: number | null;
  pain?: number | null;
}
