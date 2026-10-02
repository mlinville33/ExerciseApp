from fastapi import APIRouter, Depends, HTTPException

from src.db import get_session
from src.models import RehabWorkoutRequest
from src.routers.workouts import load_workout
from src.seed import ensure_exercise
from src.selector.randomizer import load_rehab
from src.tables import Workout, WorkoutItem

router = APIRouter(prefix='/rehab', tags=['rehab'])


def _library():
    return load_rehab()


def _get_joint(joint):
    data = _library()
    joint_data = data.get('joints', {}).get(joint)
    if joint_data is None:
        raise HTTPException(status_code=404, detail=f"No rehab protocol for '{joint}'")
    return data, joint_data


@router.get('')
def list_joints():
    """The joints with a protocol, as cards for the Rehab landing page."""
    data = _library()
    joints = []
    for key, joint_data in data.get('joints', {}).items():
        joints.append({
            'joint': key,
            'name': joint_data['name'],
            'summary': joint_data['summary'],
            'common_conditions': joint_data['common_conditions'],
            'phase_count': len(joint_data.get('phases', [])),
            'exercise_count': sum(len(p.get('exercises', [])) for p in joint_data.get('phases', [])),
        })
    return {
        'disclaimer': data['disclaimer'],
        'pain_rule': data['pain_rule'],
        'joints': joints,
    }


@router.get('/{joint}')
def get_joint(joint: str):
    """The full protocol for one joint: all phases, exercises, precautions and red flags."""
    data, joint_data = _get_joint(joint)
    return {
        'joint': joint,
        'disclaimer': data['disclaimer'],
        'pain_rule': data['pain_rule'],
        **joint_data,
    }


@router.get('/{joint}/phase/{phase}')
def get_phase(joint: str, phase: int):
    _, joint_data = _get_joint(joint)
    for entry in joint_data.get('phases', []):
        if entry['number'] == phase:
            return {'joint': joint, 'joint_name': joint_data['name'], **entry}
    raise HTTPException(status_code=404, detail=f'Phase {phase} not found for {joint}')


@router.post('/workout', status_code=201)
def create_rehab_workout(payload: RehabWorkoutRequest, session=Depends(get_session)):
    """Turn one phase of a protocol into a saved workout so it can be logged and tracked."""
    _, joint_data = _get_joint(payload.joint)

    phase = next(
        (entry for entry in joint_data.get('phases', []) if entry['number'] == payload.phase),
        None,
    )
    if phase is None:
        raise HTTPException(
            status_code=404, detail=f'Phase {payload.phase} not found for {payload.joint}'
        )

    name = payload.name or f"{joint_data['name']} Rehab - Phase {phase['number']}: {phase['name']}"

    items = []
    for position, entry in enumerate(phase['exercises']):
        exercise = ensure_exercise(
            session,
            entry['name'],
            category='rehab',
            equipment=entry.get('equipment', 'none'),
            description=entry.get('description', ''),
            kind='rehab',
        )
        items.append(WorkoutItem(
            exercise=exercise,
            position=position,
            target_sets=entry.get('sets', 3),
            target_reps=entry.get('reps', 10),
            hold_seconds=entry.get('hold_seconds'),
            notes=' | '.join(entry.get('cues', [])),
        ))

    workout = Workout(
        name=name,
        description=phase['goal'],
        kind='rehab',
        joint=payload.joint,
        items=items,
    )
    session.add(workout)
    session.flush()
    return load_workout(session, workout.id)
