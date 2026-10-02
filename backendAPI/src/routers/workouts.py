from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from src.db import get_session
from src.models import WorkoutIn, WorkoutUpdate
from src.seed import ensure_exercise
from src.tables import Exercise, TrainingSession, Workout, WorkoutItem
from src.units import band_level, normalise_unit

router = APIRouter(prefix='/workouts', tags=['workouts'])


def _resolve_exercise(session, item):
    """Turn an incoming item into a concrete exercise."""
    if item.exercise_id is not None:
        exercise = session.get(Exercise, item.exercise_id)
        if exercise is None:
            raise HTTPException(status_code=404, detail=f'Exercise {item.exercise_id} not found')
        return exercise

    if item.exercise_name:
        return ensure_exercise(session, item.exercise_name.strip())

    raise HTTPException(status_code=422, detail='Each item needs an exercise_id or an exercise_name')


def _build_items(session, items):
    built = []
    for position, item in enumerate(items):
        exercise = _resolve_exercise(session, item)
        unit = normalise_unit(item.target_weight_unit) if item.target_weight is not None else None
        built.append(WorkoutItem(
            exercise=exercise,
            position=position,
            target_sets=item.target_sets,
            target_reps=item.target_reps,
            target_weight=item.target_weight,
            target_weight_unit=unit,
            target_band=item.target_band,
            target_band_level=band_level(item.target_band),
            hold_seconds=item.hold_seconds,
            notes=item.notes,
        ))
    return built


def load_workout(session, workout_id):
    workout = session.scalar(
        select(Workout)
        .where(Workout.id == workout_id)
        .options(selectinload(Workout.items).selectinload(WorkoutItem.exercise))
    )
    if workout is None:
        raise HTTPException(status_code=404, detail='Workout not found')

    payload = workout.as_dict()
    payload['items'] = [item.as_dict() for item in workout.items]
    return payload


@router.get('')
def list_workouts(
    include_archived: bool = Query(default=False),
    session=Depends(get_session),
):
    item_count = (
        select(func.count(WorkoutItem.id))
        .where(WorkoutItem.workout_id == Workout.id)
        .scalar_subquery()
    )
    session_count = (
        select(func.count(TrainingSession.id))
        .where(
            TrainingSession.workout_id == Workout.id,
            TrainingSession.completed_at.is_not(None),
        )
        .scalar_subquery()
    )
    last_performed = (
        select(func.max(TrainingSession.started_at))
        .where(TrainingSession.workout_id == Workout.id)
        .scalar_subquery()
    )

    statement = select(
        Workout, item_count, session_count, last_performed
    ).order_by(Workout.created_at.desc())

    if not include_archived:
        statement = statement.where(Workout.archived.is_(False))

    ## How many items each workout draws from each category, so the client can
    ## show what a routine actually trains without fetching every workout in
    ## full. One grouped query for the whole list rather than one per workout.
    mix = {}
    for workout_id, category, count in session.execute(
        select(WorkoutItem.workout_id, Exercise.category, func.count(WorkoutItem.id))
        .join(Exercise, Exercise.id == WorkoutItem.exercise_id)
        .group_by(WorkoutItem.workout_id, Exercise.category)
    ):
        mix.setdefault(workout_id, {})[category] = count

    results = []
    for workout, items, sessions, last in session.execute(statement):
        results.append({
            **workout.as_dict(),
            'item_count': items,
            'session_count': sessions,
            'last_performed': last,
            'category_mix': mix.get(workout.id, {}),
        })
    return results


@router.post('', status_code=201)
def create_workout(payload: WorkoutIn, session=Depends(get_session)):
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail='Workout name cannot be empty')

    workout = Workout(
        name=payload.name.strip(),
        description=payload.description,
        kind=payload.kind,
        joint=payload.joint,
        items=_build_items(session, payload.items),
    )
    session.add(workout)
    session.flush()
    return load_workout(session, workout.id)


@router.get('/{workout_id}')
def get_workout(workout_id: int, session=Depends(get_session)):
    return load_workout(session, workout_id)


@router.patch('/{workout_id}')
def update_workout(workout_id: int, payload: WorkoutUpdate, session=Depends(get_session)):
    workout = session.get(Workout, workout_id)
    if workout is None:
        raise HTTPException(status_code=404, detail='Workout not found')

    if payload.name is not None:
        workout.name = payload.name.strip()
    if payload.description is not None:
        workout.description = payload.description
    if payload.archived is not None:
        workout.archived = payload.archived

    if payload.items is not None:
        # delete-orphan on the relationship removes the rows that drop out.
        workout.items = _build_items(session, payload.items)

    session.flush()
    return load_workout(session, workout_id)


@router.delete('/{workout_id}', status_code=204)
def delete_workout(workout_id: int, session=Depends(get_session)):
    workout = session.get(Workout, workout_id)
    if workout is None:
        raise HTTPException(status_code=404, detail='Workout not found')

    # Past sessions outlive the workout; they keep the name they were run under.
    session.execute(
        TrainingSession.__table__.update()
        .where(TrainingSession.workout_id == workout_id)
        .values(workout_id=None)
    )
    session.delete(workout)
    return None
