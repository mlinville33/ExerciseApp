import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from src.db import init_db
from src.routers import exercises, progress, rehab, sessions, workouts
from src.seed import seed_exercises
from src.selector.randomizer import randomizer, randomizer_detailed, categories
from src.units import BANDS, UNITS


@asynccontextmanager
async def lifespan(_app):
    ## Create the schema and refresh the exercise library on every boot
    init_db()
    seed_exercises()
    yield


app = FastAPI(
    title='ExerciseApp API',
    description='Build workouts, log training, track progress, and follow joint rehab protocols.',
    version='1.0.0',
    lifespan=lifespan,
)

## The frontend runs on its own origin in dev and in docker-compose. 3001 and
## 3002 are included because VS Code's port forwarding often occupies 3000 on
## Windows, pushing the dev server to the next free port.
DEFAULT_ORIGINS = ','.join(
    f'http://{host}:{port}'
    for port in (3000, 3001, 3002)
    for host in ('localhost', '127.0.0.1')
)
allowed_origins = os.environ.get('CORS_ORIGINS', DEFAULT_ORIGINS).split(',')

## Any loopback or private-network origin on any port is allowed, so moving the
## dev server to another port, or opening the app from a phone on the same
## wifi, does not need a config change. This is a personal app with no auth: it
## means any device on your network can reach the API, which is the point, but
## do not expose port 8000 to the internet.
LOCAL_ORIGIN_REGEX = (
    r'https?://('
    r'localhost|127\.0\.0\.1|\[::1\]|'
    r'10\.\d{1,3}\.\d{1,3}\.\d{1,3}|'
    r'192\.168\.\d{1,3}\.\d{1,3}|'
    r'172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}'
    r')(:\d+)?'
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins],
    allow_origin_regex=LOCAL_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


logger = logging.getLogger('exerciseapp')


## An unhandled exception escapes past the CORS middleware, so the browser sees
## an opaque "CORS header missing" error instead of the real failure. Handling
## database errors here keeps the response inside the middleware stack, which
## means it comes back with CORS headers and a message worth reading.
@app.exception_handler(SQLAlchemyError)
async def database_error_handler(request: Request, exc: SQLAlchemyError):
    logger.exception('Database error on %s %s', request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={'detail': f'Database error: {exc}'},
    )


app.include_router(exercises.router)
app.include_router(workouts.router)
app.include_router(sessions.router)
app.include_router(progress.router)
app.include_router(rehab.router)


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


## Supported weight units and the resistance band ladder used for band work
@app.get('/settings')
def get_settings():
    return {
        'units': list(UNITS),
        'bands': BANDS,
        'band_note': (
            'Band strengths are ordered light to heavy. Colours are the most common '
            'convention but they vary between brands, so go by the strength label.'
        ),
    }


## Structured random routine that can be saved straight into a workout
@app.get('/generate')
def generate(
    categories_filter: str = Query(
        default=None, alias='categories', description='Comma separated category names'
    ),
    ## Every category holds fifteen exercises, so this bounds the input rather
    ## than the library. Kept in step with MAX_EXERCISES_PER_CATEGORY on the client.
    per_category: int = Query(default=1, ge=1, le=8),
):
    selected = None
    if categories_filter:
        selected = [item.strip() for item in categories_filter.split(',') if item.strip()]
    return randomizer_detailed(selected, per_category)
