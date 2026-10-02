import type {
  RehabIndex, RehabPhase, RehabProtocol, WorkoutDetail,
} from '../types';
import { transaction } from './db';
import { ensureExercise, rehabLibrary } from './seed';
import { utcNowIso } from './units';
import { loadWorkout } from './workouts';

/**
 * Ports routers/rehab.py. The protocols are static data, so most of this reads
 * the bundled library rather than the database.
 */

function getJoint(joint: string) {
  const jointData = rehabLibrary.joints[joint];
  if (!jointData) throw new Error(`No rehab protocol for '${joint}'`);
  return jointData;
}

/** The joints with a protocol, as cards for the Rehab landing page. */
export function listJoints(): RehabIndex {
  const joints = Object.entries(rehabLibrary.joints).map(([key, jointData]) => ({
    joint: key,
    name: jointData.name,
    summary: jointData.summary,
    common_conditions: jointData.common_conditions,
    phase_count: jointData.phases.length,
    exercise_count: jointData.phases.reduce(
      (total, phase) => total + phase.exercises.length,
      0
    ),
  }));

  return {
    disclaimer: rehabLibrary.disclaimer,
    pain_rule: rehabLibrary.pain_rule,
    joints,
  };
}

/** The full protocol for one joint: phases, exercises, precautions, red flags. */
export function getJointProtocol(joint: string): RehabProtocol {
  return {
    joint,
    disclaimer: rehabLibrary.disclaimer,
    pain_rule: rehabLibrary.pain_rule,
    ...getJoint(joint),
  };
}

export function getPhase(joint: string, phaseNumber: number) {
  const jointData = getJoint(joint);
  const phase = jointData.phases.find((entry: RehabPhase) => entry.number === phaseNumber);
  if (!phase) throw new Error(`Phase ${phaseNumber} not found for ${joint}`);
  return { joint, joint_name: jointData.name, ...phase };
}

export interface RehabWorkoutRequest {
  joint: string;
  phase?: number;
  name?: string;
}

/** Turn one phase of a protocol into a saved workout so it can be logged. */
export async function createRehabWorkout(
  payload: RehabWorkoutRequest
): Promise<WorkoutDetail> {
  const jointData = getJoint(payload.joint);
  const phaseNumber = payload.phase ?? 1;

  const phase = jointData.phases.find((entry: RehabPhase) => entry.number === phaseNumber);
  if (!phase) throw new Error(`Phase ${phaseNumber} not found for ${payload.joint}`);

  const name = payload.name
    || `${jointData.name} Rehab - Phase ${phase.number}: ${phase.name}`;

  const workoutId = await transaction(async (connection) => {
    const inserted = await connection.run(
      'INSERT INTO workouts (name, description, kind, joint, created_at, archived) VALUES (?,?,?,?,?,0);',
      [name, phase.goal, 'rehab', payload.joint, utcNowIso()],
      false
    );
    const newId = inserted.changes!.lastId!;

    for (let position = 0; position < phase.exercises.length; position += 1) {
      const entry = phase.exercises[position];
      const exerciseId = await ensureExercise(connection, entry.name, {
        category: 'rehab',
        equipment: entry.equipment || 'none',
        description: entry.description || '',
        kind: 'rehab',
      });

      await connection.run(
        `INSERT INTO workout_items
           (workout_id, exercise_id, position, target_sets, target_reps, hold_seconds, notes)
         VALUES (?,?,?,?,?,?,?);`,
        [
          newId,
          exerciseId,
          position,
          entry.sets ?? 3,
          entry.reps ?? 10,
          entry.hold_seconds ?? null,
          (entry.cues || []).join(' | '),
        ],
        false
      );
    }

    return newId;
  });

  return loadWorkout(workoutId);
}
