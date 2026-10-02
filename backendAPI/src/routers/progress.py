from collections import OrderedDict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import selectinload

from src.db import get_session
from src.tables import Exercise, SetLog, TrainingSession
from src.units import DEFAULT_UNIT, from_kg, normalise_unit, to_kg, volume_kg_expression

router = APIRouter(prefix='/progress', tags=['progress'])


def _is_band():
    """1 for a set logged with a band, 0 otherwise, for summing in SQL."""
    return case((SetLog.band.is_not(None), 1), else_=0)


def _parse(value):
    """Parse a stored ISO timestamp back into an aware datetime."""
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _estimate_one_rep_max(weight, reps):
    """Epley estimate, which is close enough for tracking trends under about 10 reps."""
    if not weight or not reps:
        return None
    return weight * (1 + reps / 30)


@router.get('/summary')
def summary(
    days: int = Query(default=30, ge=1, le=365),
    unit: str = Query(default=DEFAULT_UNIT, description="'kg' or 'lb'"),
    session=Depends(get_session),
):
    """Headline numbers for the dashboard."""
    unit = normalise_unit(unit)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    totals = session.execute(
        select(
            func.count(func.distinct(TrainingSession.id)),
            func.count(SetLog.id),
            func.coalesce(func.sum(func.coalesce(SetLog.reps, 0)), 0),
            func.coalesce(func.sum(volume_kg_expression()), 0.0),
            func.coalesce(func.sum(_is_band()), 0),
        )
        .select_from(TrainingSession)
        .outerjoin(SetLog, SetLog.session_id == TrainingSession.id)
        .where(TrainingSession.started_at >= since)
    ).one()

    sessions, sets, reps, volume_kg, band_sets = totals

    all_time = session.scalar(select(func.count(TrainingSession.id)))

    rehab_sets = session.scalar(
        select(func.count(SetLog.id))
        .join(Exercise, Exercise.id == SetLog.exercise_id)
        .join(TrainingSession, TrainingSession.id == SetLog.session_id)
        .where(Exercise.kind == 'rehab', TrainingSession.started_at >= since)
    )

    day_set = set()
    for started_at in session.scalars(select(TrainingSession.started_at)):
        parsed = _parse(started_at)
        if parsed:
            day_set.add(parsed.date())

    # A streak counts consecutive days back from today, tolerating a start yesterday.
    today = datetime.now(timezone.utc).date()
    streak = 0
    cursor_day = today if today in day_set else today - timedelta(days=1)
    while cursor_day in day_set:
        streak += 1
        cursor_day -= timedelta(days=1)

    return {
        'window_days': days,
        'unit': unit,
        'sessions': sessions,
        'sets': sets,
        'reps': reps,
        'volume': from_kg(volume_kg, unit),
        'band_sets': band_sets,
        'rehab_sets': rehab_sets,
        'total_sessions_all_time': all_time,
        'active_days': len(day_set),
        'current_streak_days': streak,
    }


@router.get('/volume')
def volume_by_day(
    days: int = Query(default=30, ge=1, le=365),
    unit: str = Query(default=DEFAULT_UNIT),
    session=Depends(get_session),
):
    """Training volume per calendar day, with empty days filled in as zero."""
    unit = normalise_unit(unit)
    since_date = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    since = datetime.combine(since_date, datetime.min.time(), tzinfo=timezone.utc).isoformat()

    rows = session.execute(
        select(
            TrainingSession.started_at,
            func.coalesce(func.sum(volume_kg_expression()), 0.0),
            func.count(SetLog.id),
        )
        .select_from(TrainingSession)
        .outerjoin(SetLog, SetLog.session_id == TrainingSession.id)
        .where(TrainingSession.started_at >= since)
        .group_by(TrainingSession.id)
    )

    buckets = OrderedDict()
    for offset in range(days):
        day = since_date + timedelta(days=offset)
        buckets[day.isoformat()] = {
            'date': day.isoformat(), 'volume': 0.0, 'sets': 0, 'sessions': 0,
        }

    for started_at, volume_kg, sets in rows:
        parsed = _parse(started_at)
        if parsed is None:
            continue
        key = parsed.date().isoformat()
        if key in buckets:
            buckets[key]['volume'] += volume_kg
            buckets[key]['sets'] += sets
            buckets[key]['sessions'] += 1

    for bucket in buckets.values():
        bucket['volume'] = from_kg(bucket['volume'], unit)
        bucket['unit'] = unit

    return list(buckets.values())


@router.get('/exercises')
def tracked_exercises(session=Depends(get_session)):
    """Every exercise that has at least one logged set, most recently trained first."""
    rows = session.execute(
        select(
            Exercise,
            func.count(SetLog.id),
            func.coalesce(func.sum(_is_band()), 0),
            func.max(SetLog.logged_at),
        )
        .join(SetLog, SetLog.exercise_id == Exercise.id)
        .group_by(Exercise.id)
        .order_by(func.max(SetLog.logged_at).desc())
    )

    return [
        {
            'id': exercise.id,
            'name': exercise.name,
            'category': exercise.category,
            'kind': exercise.kind,
            'set_count': sets,
            'band_sets': bands,
            'last_logged': last,
        }
        for exercise, sets, bands, last in rows
    ]


@router.get('/bests')
def personal_bests(
    unit: str = Query(default=DEFAULT_UNIT),
    exclude_session: int = Query(
        default=None,
        description='Ignore sets from this session, so a live session can be scored against history',
    ),
    session=Depends(get_session),
):
    """The best weight, reps, 1RM estimate and band for every trained exercise.

    `exclude_session` is what makes this usable from a running session: the
    client asks for the bests that stood *before* today, then decides live
    whether each set beats them. Without the exclusion the first set logged
    would become its own record and nothing could ever be a personal best.
    """
    unit = normalise_unit(unit)

    statement = select(SetLog)
    if exclude_session is not None:
        statement = statement.where(SetLog.session_id != exclude_session)

    bests = {}
    for log in session.scalars(statement):
        best = bests.setdefault(log.exercise_id, {
            'weight': None, 'reps': None, 'estimated_one_rep_max': None,
            'band': None, 'band_level': None, 'unit': unit,
        })

        weight_kg = to_kg(log.weight, log.weight_unit)
        if weight_kg is not None and (best['weight'] is None or weight_kg > best['weight']):
            best['weight'] = weight_kg

        if log.reps is not None and (best['reps'] is None or log.reps > best['reps']):
            best['reps'] = log.reps

        estimate = _estimate_one_rep_max(weight_kg, log.reps)
        if estimate is not None and (
            best['estimated_one_rep_max'] is None
            or estimate > best['estimated_one_rep_max']
        ):
            best['estimated_one_rep_max'] = estimate

        # A custom band label carries no level, so it never displaces a ranked one.
        if log.band and log.band_level is not None and (
            best['band_level'] is None or log.band_level > best['band_level']
        ):
            best['band'] = log.band
            best['band_level'] = log.band_level

    for best in bests.values():
        best['weight'] = from_kg(best['weight'], unit)
        best['estimated_one_rep_max'] = from_kg(best['estimated_one_rep_max'], unit)

    # Keys go out as strings because JSON object keys always are; the client
    # looks them up by String(exercise_id).
    return {str(exercise_id): best for exercise_id, best in bests.items()}


@router.get('/exercises/{exercise_id}')
def exercise_progress(
    exercise_id: int,
    unit: str = Query(default=DEFAULT_UNIT),
    session=Depends(get_session),
):
    """Per-session history for one exercise, plus personal bests.

    Weighted and band work are tracked separately: a band has no weight, so it
    contributes reps and its own strength ladder rather than volume.
    """
    unit = normalise_unit(unit)
    exercise = session.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail='Exercise not found')

    logs = session.execute(
        select(SetLog, TrainingSession.started_at)
        .join(TrainingSession, TrainingSession.id == SetLog.session_id)
        .where(SetLog.exercise_id == exercise_id)
        .order_by(SetLog.logged_at)
        .options(selectinload(SetLog.exercise))
    ).all()

    history = OrderedDict()
    best_weight_kg = None
    best_reps = None
    best_one_rep_max_kg = None
    best_band = None
    best_band_level = None

    for log, session_started in logs:
        parsed = _parse(session_started)
        key = parsed.date().isoformat() if parsed else 'unknown'
        entry = history.setdefault(
            key,
            {
                'date': key, 'sets': 0, 'reps': 0, 'volume': 0.0,
                'top_weight': None, 'top_band': None, 'top_band_level': None,
                'avg_pain': None, 'unit': unit,
            },
        )

        reps = log.reps or 0
        weight_kg = to_kg(log.weight, log.weight_unit)
        entry['sets'] += 1
        entry['reps'] += reps
        entry['volume'] += reps * (weight_kg or 0)

        if weight_kg is not None:
            if entry['top_weight'] is None or weight_kg > entry['top_weight']:
                entry['top_weight'] = weight_kg
            if best_weight_kg is None or weight_kg > best_weight_kg:
                best_weight_kg = weight_kg

        if log.band:
            level = log.band_level
            # A custom band label has no level, so it never displaces a ranked one.
            if entry['top_band'] is None or (
                level is not None and (entry['top_band_level'] or 0) < level
            ):
                entry['top_band'] = log.band
                entry['top_band_level'] = level
            if best_band is None or (level is not None and (best_band_level or 0) < level):
                best_band = log.band
                best_band_level = level

        if log.reps is not None and (best_reps is None or log.reps > best_reps):
            best_reps = log.reps

        estimate = _estimate_one_rep_max(weight_kg, log.reps)
        if estimate is not None and (best_one_rep_max_kg is None or estimate > best_one_rep_max_kg):
            best_one_rep_max_kg = estimate

        entry.setdefault('_pain', []).append(log.pain)

    for entry in history.values():
        pains = [value for value in entry.pop('_pain', []) if value is not None]
        entry['avg_pain'] = round(sum(pains) / len(pains), 1) if pains else None
        entry['volume'] = from_kg(entry['volume'], unit)
        entry['top_weight'] = from_kg(entry['top_weight'], unit)

    return {
        'exercise': exercise.as_dict(),
        'unit': unit,
        'history': list(history.values()),
        'personal_best': {
            'weight': from_kg(best_weight_kg, unit),
            'unit': unit,
            'reps': best_reps,
            'estimated_one_rep_max': from_kg(best_one_rep_max_kg, unit),
            'band': best_band,
            'band_level': best_band_level,
        },
    }
