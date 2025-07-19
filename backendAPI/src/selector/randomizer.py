import json
import os
import random

def load_json():
    load_json = os.path.join(os.path.dirname(__file__), '..', 'assets', 'workouts.json')

    with open(load_json, 'r') as file:
        data = json.load(file)
    return(data)

def categories(search=None):
    data = load_json()
    if search:
        return data.get(search, [])
    return list(data.keys())

def randomizer():
    random_workout = []
    data = load_json()

    for item in data.values():
        exercise = random.choice(item)
        random_number = random.randint(1, 3)
        random_workout.append(f'{exercise} x {random_number * 5}')
    
    return random_workout


if __name__ == "__main__":
    print(load_json())