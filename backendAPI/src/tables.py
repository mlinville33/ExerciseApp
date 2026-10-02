from datetime import datetime, timezone

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow_iso():
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


class Exercise(Base):
    __tablename__ = 'exercises'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    category: Mapped[str] = mapped_column(String)
    equipment: Mapped[str] = mapped_column(String, default='none')
    description: Mapped[str] = mapped_column(Text, default='')
    kind: Mapped[str] = mapped_column(String, default='strength')
    # A rehab exercise can belong to more than one protocol (an ankle pump is
    # used for both knees and ankles), so these hold comma separated lists.
    joints: Mapped[str] = mapped_column(String, default='')
    phases: Mapped[str] = mapped_column(String, default='')

    def as_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'equipment': self.equipment,
            'description': self.description,
            'kind': self.kind,
            'joints': self.joints,
            'phases': self.phases,
        }


class Workout(Base):
    __tablename__ = 'workouts'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default='')
    kind: Mapped[str] = mapped_column(String, default='strength')
    joint: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String, default=utcnow_iso)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    items: Mapped[list['WorkoutItem']] = relationship(
        back_populates='workout',
        cascade='all, delete-orphan',
        order_by='WorkoutItem.position',
    )

    def as_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'kind': self.kind,
            'joint': self.joint,
            'created_at': self.created_at,
            'archived': bool(self.archived),
        }


class WorkoutItem(Base):
    __tablename__ = 'workout_items'

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_id: Mapped[int] = mapped_column(ForeignKey('workouts.id', ondelete='CASCADE'))
    exercise_id: Mapped[int] = mapped_column(ForeignKey('exercises.id'))
    position: Mapped[int] = mapped_column(Integer, default=0)
    target_sets: Mapped[int] = mapped_column(Integer, default=3)
    target_reps: Mapped[int] = mapped_column(Integer, default=10)
    target_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    # The unit the target was entered in, so a display preference change never
    # silently reinterprets the number.
    target_weight_unit: Mapped[str | None] = mapped_column(String, nullable=True)
    # Band work carries a label instead of a weight; level orders the ladder.
    target_band: Mapped[str | None] = mapped_column(String, nullable=True)
    target_band_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hold_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default='')

    workout: Mapped['Workout'] = relationship(back_populates='items')
    exercise: Mapped['Exercise'] = relationship()

    def as_dict(self):
        return {
            'id': self.id,
            'workout_id': self.workout_id,
            'exercise_id': self.exercise_id,
            'position': self.position,
            'target_sets': self.target_sets,
            'target_reps': self.target_reps,
            'target_weight': self.target_weight,
            'target_weight_unit': self.target_weight_unit,
            'target_band': self.target_band,
            'target_band_level': self.target_band_level,
            'hold_seconds': self.hold_seconds,
            'notes': self.notes,
            'exercise_name': self.exercise.name,
            'category': self.exercise.category,
            'equipment': self.exercise.equipment,
            'description': self.exercise.description,
        }


class TrainingSession(Base):
    """One workout performance. Named to avoid colliding with a database session."""

    __tablename__ = 'sessions'

    id: Mapped[int] = mapped_column(primary_key=True)
    # Deleting a workout keeps its history, so the name is denormalised here.
    workout_id: Mapped[int | None] = mapped_column(
        ForeignKey('workouts.id', ondelete='SET NULL'), nullable=True
    )
    workout_name: Mapped[str] = mapped_column(String, default='')
    started_at: Mapped[str] = mapped_column(String, index=True, default=utcnow_iso)
    completed_at: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default='')

    logs: Mapped[list['SetLog']] = relationship(
        back_populates='session',
        cascade='all, delete-orphan',
        order_by='(SetLog.logged_at, SetLog.id)',
    )

    def as_dict(self):
        return {
            'id': self.id,
            'workout_id': self.workout_id,
            'workout_name': self.workout_name,
            'started_at': self.started_at,
            'completed_at': self.completed_at,
            'notes': self.notes,
        }


class SetLog(Base):
    __tablename__ = 'set_logs'

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey('sessions.id', ondelete='CASCADE'))
    exercise_id: Mapped[int] = mapped_column(ForeignKey('exercises.id'), index=True)
    set_number: Mapped[int] = mapped_column(Integer, default=1)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_unit: Mapped[str | None] = mapped_column(String, nullable=True)
    band: Mapped[str | None] = mapped_column(String, nullable=True)
    band_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    pain: Mapped[int | None] = mapped_column(Integer, nullable=True)
    logged_at: Mapped[str] = mapped_column(String, default=utcnow_iso)

    session: Mapped['TrainingSession'] = relationship(back_populates='logs')
    exercise: Mapped['Exercise'] = relationship()

    def as_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'exercise_id': self.exercise_id,
            'set_number': self.set_number,
            'reps': self.reps,
            'weight': self.weight,
            'weight_unit': self.weight_unit,
            'band': self.band,
            'band_level': self.band_level,
            'duration_seconds': self.duration_seconds,
            'rpe': self.rpe,
            'pain': self.pain,
            'logged_at': self.logged_at,
            'exercise_name': self.exercise.name,
            'category': self.exercise.category,
            'kind': self.exercise.kind,
        }
