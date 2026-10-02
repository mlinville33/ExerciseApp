import json
import os
import random
from functools import lru_cache

ASSETS = os.path.join(os.path.dirname(__file__), '..', 'assets')


## These files never change while the server runs, so they are read and parsed
## once rather than on every request. Re-opening and re-parsing them per call
## was pure waste, and it made these endpoints the slowest in the app.
@lru_cache(maxsize=None)
def _read_asset(filename):
    with open(os.path.join(ASSETS, filename), 'r') as file:
        return json.load(file)


## Load JSON data from the workouts.json file
def load_json():
    return _read_asset('workouts.json')


## Load the rehab protocol library
def load_rehab():
    return _read_asset('rehab.json')


## Pull the display name out of an entry, which may be a plain string or an object
def exercise_name(entry):
    if isinstance(entry, dict):
        return entry.get('name', '')
    return entry


## Return all categories or exercise names in a specified category
def categories(category=None):
    data = load_json()
    if category:
        return [exercise_name(item) for item in data.get(category, [])]
    return list(data.keys())


## Generate a random workout routine, one exercise per category
def randomizer():
    random_workout = []
    data = load_json()

    for item in data.values():
        exercise = random.choice(item)
        random_number = random.randint(1, 3)
        random_workout.append(f'{exercise_name(exercise)} x {random_number * 5}')

    return random_workout


## Generate a random routine as structured data the frontend can turn into a workout
def randomizer_detailed(categories_filter=None, per_category=1):
    data = load_json()
    picks = []

    for category, items in data.items():
        if categories_filter and category not in categories_filter:
            continue
        count = min(per_category, len(items))
        for entry in random.sample(items, count):
            picks.append({
                'name': exercise_name(entry),
                'category': category,
                'equipment': entry.get('equipment', 'none') if isinstance(entry, dict) else 'none',
                'target_sets': 3,
                'target_reps': random.randint(1, 3) * 5,
            })

    return picks


if __name__ == "__main__":
    print(load_json())
