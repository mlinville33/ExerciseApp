from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from src.db import get_session
from src.tables import Exercise

router = APIRouter(prefix='/exercises', tags=['exercises'])


@router.get('')
def list_exercises(
    category: str = Query(default=None, description='Filter by category, e.g. legs or rehab'),
    kind: str = Query(default=None, description="Filter by 'strength' or 'rehab'"),
    joint: str = Query(default=None, description='Filter rehab exercises by joint'),
    search: str = Query(default=None, description='Case-insensitive name match'),
    session=Depends(get_session),
):
    statement = select(Exercise)

    if category:
        statement = statement.where(Exercise.category == category)
    if kind:
        statement = statement.where(Exercise.kind == kind)
    if joint:
        # joints is a comma separated list, so match on a padded copy
        statement = statement.where(
            (',' + Exercise.joints + ',').contains(f',{joint},')
        )
    if search:
        statement = statement.where(Exercise.name.ilike(f'%{search}%'))

    statement = statement.order_by(Exercise.category, Exercise.name)
    return [exercise.as_dict() for exercise in session.scalars(statement)]
