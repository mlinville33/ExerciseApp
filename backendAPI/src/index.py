from fastapi import FastAPI, Query
from src.selector.randomizer import randomizer, categories

app = FastAPI()

## Root endpoint returning a random workout routine
@app.get('/')
def root():
    data = randomizer()
    return data

## Health check endpoint
@app.get('/health')
def health_check():
    return {'status': '200'}

## Categories endpoint returning available workout categories or exercises in a specified category
@app.get('/categories')
def get_categories(category: str = Query(default=None, description='Returns the specified catgory')):
    data = categories(category)
    return data