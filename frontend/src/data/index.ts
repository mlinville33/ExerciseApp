import type {
  Band, DailyVolume, Exercise, ExerciseProgress, GeneratedPick, PersonalBests, ProgressSummary,
  RehabIndex, RehabProtocol, SessionDetail, SessionSummary, SetLogInput, TrackedExercise,
  WeightUnit, WorkoutDetail, WorkoutInput, WorkoutSummary, WorkoutUpdate,
} from '../types';
import {
  MAX_EXERCISES_PER_CATEGORY, categories, generate, listExercises, type ExerciseFilters,
} from './exercises';
import {
  exerciseProgress, personalBests, summary, trackedExercises, volumeByDay,
} from './progress';
import {
  createRehabWorkout, getJointProtocol, listJoints, type RehabWorkoutRequest,
} from './rehab';
import {
  activeSession, deleteLog, deleteSession, getSession, listSessions, logSet,
  startSession, updateSession,
} from './sessions';
import { BANDS, UNITS } from './units';
import { createWorkout, deleteWorkout, listWorkouts, loadWorkout, updateWorkout } from './workouts';

export { resetDatabase } from './db';

export interface Settings {
  units: WeightUnit[];
  bands: Band[];
  band_note: string;
}

/**
 * The same surface the HTTP client had, backed by the on-device database.
 *
 * Method names, arguments and return shapes are deliberately identical to the
 * old api.js, so swapping the two needed no change anywhere in the components.
 * Everything is async, exactly as it was when these were network calls.
 */
export interface ExerciseApi {
  health(): Promise<{ status: string }>;
  exercises(filters?: ExerciseFilters): Promise<Exercise[]>;
  categories(category?: string): Promise<string[]>;
  generate(categoryFilter?: string[] | null, exercisesPerCategory?: number): Promise<GeneratedPick[]>;
  settings(): Promise<Settings>;

  listWorkouts(): Promise<WorkoutSummary[]>;
  getWorkout(id: number): Promise<WorkoutDetail>;
  createWorkout(body: WorkoutInput): Promise<WorkoutDetail>;
  updateWorkout(id: number, body: WorkoutUpdate): Promise<WorkoutDetail>;
  deleteWorkout(id: number): Promise<null>;

  listSessions(limit?: number, unit?: WeightUnit): Promise<SessionSummary[]>;
  activeSession(unit?: WeightUnit): Promise<SessionDetail | null>;
  getSession(id: number, unit?: WeightUnit): Promise<SessionDetail>;
  startSession(body: { workout_id?: number | null; notes?: string }, unit?: WeightUnit): Promise<SessionDetail>;
  updateSession(id: number, body: { notes?: string; completed?: boolean }, unit?: WeightUnit): Promise<SessionDetail>;
  deleteSession(id: number): Promise<null>;
  logSet(id: number, body: SetLogInput, unit?: WeightUnit): Promise<SessionDetail>;
  deleteLog(sessionId: number, logId: number, unit?: WeightUnit): Promise<SessionDetail>;

  summary(days?: number, unit?: WeightUnit): Promise<ProgressSummary>;
  volume(days?: number, unit?: WeightUnit): Promise<DailyVolume[]>;
  trackedExercises(): Promise<TrackedExercise[]>;
  exerciseProgress(id: number, unit?: WeightUnit): Promise<ExerciseProgress>;
  bests(excludeSession?: number | null, unit?: WeightUnit): Promise<PersonalBests>;

  rehabJoints(): Promise<RehabIndex>;
  rehabJoint(joint: string): Promise<RehabProtocol>;
  createRehabWorkout(body: RehabWorkoutRequest): Promise<WorkoutDetail>;
}

const api: ExerciseApi = {
  health: async () => ({ status: '200' }),

  exercises: (filters = {}) => listExercises(filters),
  categories: async (category) => categories(category),
  generate: (categoryFilter, exercisesPerCategory = 1) => {
    // Clamped because this is a boundary: the caller is a form field.
    const count = Math.min(
      Math.max(Number(exercisesPerCategory) || 1, 1),
      MAX_EXERCISES_PER_CATEGORY
    );
    return Promise.resolve(generate(categoryFilter, count));
  },

  settings: async () => ({
    units: [...UNITS],
    bands: BANDS,
    band_note:
      'Band strengths are ordered light to heavy. Colours are the most common ' +
      'convention but they vary between brands, so go by the strength label.',
  }),

  listWorkouts: () => listWorkouts(),
  getWorkout: (id) => loadWorkout(id),
  createWorkout: (body) => createWorkout(body),
  updateWorkout: (id, body) => updateWorkout(id, body),
  deleteWorkout: (id) => deleteWorkout(id),

  listSessions: (limit = 50, unit = 'lb') => listSessions(limit, unit),
  activeSession: (unit = 'lb') => activeSession(unit),
  getSession: (id, unit = 'lb') => getSession(id, unit),
  startSession: (body, unit = 'lb') => startSession(body, unit),
  updateSession: (id, body, unit = 'lb') => updateSession(id, body, unit),
  deleteSession: (id) => deleteSession(id),
  logSet: (id, body, unit = 'lb') => logSet(id, body, unit),
  deleteLog: (sessionId, logId, unit = 'lb') => deleteLog(sessionId, logId, unit),

  summary: (days = 30, unit = 'lb') => summary(days, unit),
  volume: (days = 30, unit = 'lb') => volumeByDay(days, unit),
  trackedExercises: () => trackedExercises(),
  exerciseProgress: (id, unit = 'lb') => exerciseProgress(id, unit),
  bests: (excludeSession = null, unit = 'lb') => personalBests(excludeSession, unit),

  rehabJoints: async () => listJoints(),
  rehabJoint: async (joint) => getJointProtocol(joint),
  createRehabWorkout: (body) => createRehabWorkout(body),
};

export default api;
