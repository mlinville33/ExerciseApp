from fastapi import FastAPI, Query
from src.selector.randomizer import randomizer, categories

app = FastAPI()

@app.get('/')
def root():
    data = randomizer()
    return data

@app.get('/health')
def health_check():
    return {'status': '200'}

@app.get('/categories')
def get_categories(search: str = Query(default=None, description='Returns the specified catgory')):
    data = categories(search)
    return data
