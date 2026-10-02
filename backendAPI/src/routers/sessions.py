from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from src.db import get_session
from src.models import SessionStart, SessionUpdate, SetLogIn
from src.seed import ensure_exercise
from src.tables import Exercise, SetLog, TrainingSession, Workout, utcnow_iso
from src.units import DEFAULT_UNIT, band_level, from_kg, normalise_unit, to_kg, volume_kg_expression

router = APIRouter(prefix='/sessions', tags=['sessions'])


def load_session(session, session_id, unit=DEFAULT_UNIT):
    training = session.scalar(
        select(TrainingSession)
        .where(TrainingSession.id == session_id)
        .options(selectinload(TrainingSession.logs).selectinload(SetLog.exercise))
    )
    if training is None:
        raise HTTPException(status_code=404, detail='Session not found')

    unit = normalise_unit(unit)
    logs = [log.as_dict() for log in training.logs]

    # Sets may have been logged in either unit, so total in kg then convert once.
    volume_kg = sum(
        (log['reps'] or 0) * (to_kg(log['weight'], log['weight_unit']) or 0) for log in logs
    )

    payload = training.as_dict()
    payload['logs'] = logs
    payload['unit'] = unit
    payload['total_volume'] = from_kg(volume_kg, unit)
    payload['band_sets'] = sum(1 for log in logs if log['band'])
    return payload


@router.get('')
def list_sessions(
    limit: int = Query(default=50, le=500),
    unit: str = Query(default=DEFAULT_UNIT, description="'kg' or 'lb'"),
    session=Depends(get_session),
):
    unit = normalise_unit(unit)

    set_count = (
        select(func.count(SetLog.id))
        .where(SetLog.session_id == TrainingSession.id)
        .scalar_subquery()
    )
    band_sets = (
        select(func.count(SetLog.id))
        .where(SetLog.session_id == TrainingSession.id, SetLog.band.is_not(None))
        .scalar_subquery()
    )
    volume_kg = (
        select(func.coalesce(func.sum(volume_kg_expression()), 0.0))
        .where(SetLog.session_id == TrainingSession.id)
        .scalar_subquery()
    )

    rows = session.execute(
        select(TrainingSession, set_count, band_sets, volume_kg)
        .order_by(TrainingSession.started_at.desc())
        .limit(limit)
    )

    return [
        {
            **training.as_dict(),
            'set_count': sets,
            'band_sets': bands,
            'total_volume': from_kg(kilograms, unit),
            'unit': unit,
        }
        for training, sets, bands, kilograms in rows
    ]


@router.post('', status_code=201)
def start_session(
    payload: SessionStart,
    unit: str = Query(default=DEFAULT_UNIT),
    session=Depends(get_session),
):
    workout_name = ''
    if payload.workout_id is not None:
        workout = session.get(Workout, payload.workout_id)
        if workout is None:
            raise HTTPException(status_code=404, detail='Workout not found')
        workout_name = workout.name

    training = TrainingSession(
        workout_id=payload.workout_id,
        workout_name=workout_name,
        started_at=utcnow_iso(),
        notes=payload.notes,
    )
    session.add(training)
    session.flush()
    return load_session(session, training.id, unit)


@router.get('/active')
def active_session(
    unit: str = Query(default=DEFAULT_UNIT),
    session=Depends(get_session),
):
    """The most recent session that has not been finished yet, if there is one."""
    training = session.scalar(
        select(TrainingSession)
        .where(TrainingSession.completed_at.is_(None))
        .order_by(TrainingSession.started_at.desc())
        .limit(1)
    )
    if training is None:
        return None
    return load_session(session, training.id, unit)


@router.get('/{session_id}')
def get_training_session(
    session_id: int,
    unit: str = Query(default=DEFAULT_UNIT),
    session=Depends(get_session),
):
    return load_session(session, session_id, unit)


@router.patch('/{session_id}')
def update_session(
    session_id: int,
    payload: SessionUpdate,
    unit: str = Query(default=DEFAULT_UNIT),
    session=Depends(get_session),
):
    training = session.get(TrainingSession, session_id)
    if training is None:
        raise HTTPException(status_code=404, detail='Session not found')

    if payload.notes is not None:
        training.notes = payload.notes
    if payload.completed is not None:
        training.completed_at = utcnow_iso() if payload.completed else None

    session.flush()
    return load_session(session, session_id, unit)


@router.delete('/{session_id}', status_code=204)
def delete_session(session_id: int, session=Depends(get_session)):
    training = session.get(TrainingSession, session_id)
    if training is None:
        raise HTTPException(status_code=404, detail='Session not found')

    session.delete(training)
    return None


@router.post('/{session_id}/logs', status_code=201)
def log_set(
    session_id: int,
    payload: SetLogIn,
    unit: str = Query(default=DEFAULT_UNIT),
    session=Depends(get_session),
):
    training = session.get(TrainingSession, session_id)
    if training is None:
        raise HTTPException(status_code=404, detail='Session not found')

    if payload.exercise_id is not None:
        exercise = session.get(Exercise, payload.exercise_id)
        if exercise is None:
            raise HTTPException(status_code=404, detail='Exercise not found')
    elif payload.exercise_name:
        exercise = ensure_exercise(session, payload.exercise_name.strip())
    else:
        raise HTTPException(status_code=422, detail='A log needs an exercise_id or an exercise_name')

    # Record the unit the set was actually entered in, falling back to the unit
    # the client is currently working in.
    stored_unit = (
        normalise_unit(payload.weight_unit or unit) if payload.weight is not None else None
    )

    session.add(SetLog(
        session_id=session_id,
        exercise=exercise,
        set_number=payload.set_number,
        reps=payload.reps,
        weight=payload.weight,
        weight_unit=stored_unit,
        band=payload.band,
        band_level=band_level(payload.band),
        duration_seconds=payload.duration_seconds,
        rpe=payload.rpe,
        pain=payload.pain,
        logged_at=utcnow_iso(),
    ))
    session.flush()
    session.expire(training, ['logs'])
    return load_session(session, session_id, unit)


@router.delete('/{session_id}/logs/{log_id}', status_code=200)
def delete_log(
    session_id: int,
    log_id: int,
    unit: str = Query(default=DEFAULT_UNIT),
    session=Depends(get_session),
):
    log = session.scalar(
        select(SetLog).where(SetLog.id == log_id, SetLog.session_id == session_id)
    )
    if log is None:
        raise HTTPException(status_code=404, detail='Set log not found')

    training = session.get(TrainingSession, session_id)
    session.delete(log)
    session.flush()
    session.expire(training, ['logs'])
    return load_session(session, session_id, unit)
