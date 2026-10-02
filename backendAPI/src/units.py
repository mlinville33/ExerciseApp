KG_PER_LB = 0.45359237

UNITS = ('kg', 'lb')
DEFAULT_UNIT = 'lb'

## Band strengths are ordered so progression can be tracked the way weight is.
## Colours are the most common convention but they do vary between brands, so
## they are a hint for picking the right band rather than a standard.
BANDS = [
    {'level': 1, 'name': 'Extra Light', 'common_color': 'yellow'},
    {'level': 2, 'name': 'Light', 'common_color': 'red'},
    {'level': 3, 'name': 'Medium', 'common_color': 'green'},
    {'level': 4, 'name': 'Heavy', 'common_color': 'blue'},
    {'level': 5, 'name': 'Extra Heavy', 'common_color': 'black'},
]

BAND_LEVELS = {band['name'].lower(): band['level'] for band in BANDS}

def volume_kg_expression():
    """reps x weight for one logged set, expressed in kilograms.

    Weight is stored exactly as it was entered, alongside the unit it was
    entered in, so switching the display preference never rewrites history.
    Anything that adds weights together converts to kilograms first.

    Rows written before units were recorded have a NULL unit. They are read as
    DEFAULT_UNIT, matching what to_kg() does with a missing unit, so the
    database and the Python paths never disagree about the same row.
    """
    from sqlalchemy import case, func

    from src.tables import SetLog

    factor = case(
        (func.coalesce(SetLog.weight_unit, DEFAULT_UNIT) == 'lb', KG_PER_LB),
        else_=1.0,
    )
    return func.coalesce(SetLog.reps, 0) * func.coalesce(SetLog.weight, 0.0) * factor


def normalise_unit(unit):
    return unit if unit in UNITS else DEFAULT_UNIT


def to_kg(weight, unit):
    if weight is None:
        return None
    return weight * KG_PER_LB if normalise_unit(unit) == 'lb' else weight


def from_kg(kilograms, unit):
    if kilograms is None:
        return None
    value = kilograms / KG_PER_LB if normalise_unit(unit) == 'lb' else kilograms
    return round(value, 1)


def convert(weight, from_unit, to_unit):
    return from_kg(to_kg(weight, from_unit), to_unit)


def band_level(name):
    """Map a band label onto the ladder, or None for a custom label."""
    if not name:
        return None
    return BAND_LEVELS.get(name.strip().lower())
