from sqlalchemy import select

from src.db import SessionLocal
from src.selector.randomizer import load_json, load_rehab
from src.tables import Exercise


def _collect_rehab(rehab):
    """Flatten the protocol library into one record per exercise name.

    Exercises shared between protocols (ankle pumps serve both knees and
    ankles) collect every joint and phase they appear in rather than the last
    one seen, so a single row can still track progress across both protocols.
    """
    collected = {}

    for joint, joint_data in rehab.get('joints', {}).items():
        for phase in joint_data.get('phases', []):
            for entry in phase.get('exercises', []):
                record = collected.setdefault(entry['name'], {
                    'equipment': entry.get('equipment', 'none'),
                    'description': entry.get('description', ''),
                    'joints': [],
                    'phases': [],
                })
                if joint not in record['joints']:
                    record['joints'].append(joint)
                tag = f"{joint}:{phase['number']}"
                if tag not in record['phases']:
                    record['phases'].append(tag)

    return collected


def seed_exercises():
    """Load the strength library and the rehab protocols into the exercises table.

    Safe to run on every boot: exercises are keyed by name, so this refreshes
    metadata without duplicating rows or breaking existing workout references.
    """
    strength = load_json()
    rehab = load_rehab()

    wanted = {}
    for category, items in strength.items():
        for entry in items:
            if isinstance(entry, dict):
                wanted[entry['name']] = {
                    'category': category,
                    'equipment': entry.get('equipment', 'none'),
                    'description': entry.get('description', ''),
                    'kind': 'strength',
                    'joints': '',
                    'phases': '',
                }
            else:
                wanted[entry] = {
                    'category': category, 'equipment': 'none', 'description': '',
                    'kind': 'strength', 'joints': '', 'phases': '',
                }

    for name, record in _collect_rehab(rehab).items():
        wanted[name] = {
            'category': 'rehab',
            'equipment': record['equipment'],
            'description': record['description'],
            'kind': 'rehab',
            'joints': ','.join(record['joints']),
            'phases': ','.join(record['phases']),
        }

    with SessionLocal() as session:
        existing = {
            exercise.name: exercise
            for exercise in session.scalars(
                select(Exercise).where(Exercise.name.in_(wanted.keys()))
            )
        }

        for name, fields in wanted.items():
            exercise = existing.get(name)
            if exercise is None:
                session.add(Exercise(name=name, **fields))
            else:
                for key, value in fields.items():
                    setattr(exercise, key, value)

        session.commit()


def ensure_exercise(session, name, category='custom', equipment='none', description='',
                    kind='strength'):
    """Return the exercise for a name, creating a custom entry if it is new."""
    exercise = session.scalar(select(Exercise).where(Exercise.name == name))
    if exercise is not None:
        return exercise

    exercise = Exercise(
        name=name, category=category, equipment=equipment,
        description=description, kind=kind,
    )
    session.add(exercise)
    # Flush so the new row has an id the caller can reference straight away.
    session.flush()
    return exercise
