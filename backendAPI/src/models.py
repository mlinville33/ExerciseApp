from typing import List, Optional

from pydantic import BaseModel, Field


class WorkoutItemIn(BaseModel):
    exercise_id: Optional[int] = None
    exercise_name: Optional[str] = Field(
        default=None,
        description='Used when the exercise is not already in the library.',
    )
    target_sets: int = 3
    target_reps: int = 10
    target_weight: Optional[float] = None
    target_weight_unit: Optional[str] = Field(
        default=None, description="'kg' or 'lb'; the unit the target was entered in."
    )
    target_band: Optional[str] = Field(
        default=None, description='Band strength label for band work, e.g. Medium.'
    )
    hold_seconds: Optional[int] = None
    notes: str = ''


class WorkoutIn(BaseModel):
    name: str
    description: str = ''
    kind: str = 'strength'
    joint: Optional[str] = None
    items: List[WorkoutItemIn] = []


class WorkoutUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    archived: Optional[bool] = None
    items: Optional[List[WorkoutItemIn]] = None


class SessionStart(BaseModel):
    workout_id: Optional[int] = None
    notes: str = ''


class SessionUpdate(BaseModel):
    notes: Optional[str] = None
    completed: Optional[bool] = None


class SetLogIn(BaseModel):
    exercise_id: Optional[int] = None
    exercise_name: Optional[str] = None
    set_number: int = 1
    reps: Optional[int] = None
    weight: Optional[float] = None
    weight_unit: Optional[str] = Field(
        default=None, description="'kg' or 'lb'; recorded per set so history stays accurate."
    )
    band: Optional[str] = Field(
        default=None, description='Band strength label, used instead of a weight.'
    )
    duration_seconds: Optional[int] = None
    rpe: Optional[float] = Field(default=None, ge=1, le=10)
    pain: Optional[int] = Field(
        default=None, ge=0, le=10,
        description='0-10 pain rating, mainly used for rehab sessions.',
    )


class RehabWorkoutRequest(BaseModel):
    joint: str
    phase: int = 1
    name: Optional[str] = None
