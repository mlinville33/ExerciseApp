# ExerciseApp

Build workouts, log every set, watch your numbers move, and follow a phased rehab
protocol when a joint needs rebuilding.

- **Workouts** — assemble a routine from the exercise library (or add your own
  movements), set targets per exercise, reorder, edit, delete.
- **Today** — a live session screen: log sets as you go, with reps, load, hold
  time and RPE. Unfinished sessions survive a refresh.
- **Pounds or kilos** — switch any time from the header. The unit is stored with
  each set as it was entered, so switching the display never reinterprets
  anything you logged earlier; totals are summed in kilograms internally and
  converted once for display.
- **Resistance bands** — any exercise can be logged by band strength instead of
  weight. Bands are ranked Extra Light through Extra Heavy so progression is
  tracked as a ladder, and band sets add reps rather than volume, since a band
  has no weight to multiply. Band exercises (most of the rehab work) open in band
  mode automatically, and a brand-specific label can be typed in instead.
- **Progress** — volume, sets, reps, streaks, per-exercise history and personal
  bests including an estimated 1RM.
- **Rehab** — three-phase protocols for **knee, shoulder, ankle and wrist**, each
  with goals, precautions, red flags and progression criteria. Any phase can be
  turned into a real workout and logged like anything else, with pain tracked per
  set alongside the usual numbers.

The rehab content is general education, not medical advice. Each protocol shows
its own precautions and the signs that mean you should see a professional.

## Running it

### Docker (both services)

```bash
docker compose up --build
```

Frontend on <http://localhost:3000>, API on <http://localhost:8000>, interactive
API docs at <http://localhost:8000/docs>. (Docker publishes 3000 itself, so the
`frontend/.env` port below does not apply to this path.)

### Locally

Backend (Poetry, if you have it):

```bash
cd backendAPI
poetry install
poetry run uvicorn src.index:app --reload --port 8000
```

Backend (plain venv, no Poetry):

```powershell
cd backendAPI
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn src.index:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm start
```

The dev server's host and port come from `frontend/.env`. It runs on **3002**
bound to `127.0.0.1`, not the usual 3000, because VS Code's automatic port
forwarding claims `127.0.0.1:3000` and would otherwise shadow the app on
`localhost` — the dev server still starts, but the browser reaches VS Code's
file browser instead. `.vscode/settings.json` disables that auto-forwarding for
this workspace; once VS Code has been reloaded you can move back to 3000 by
editing `frontend/.env`. Binding the loopback address directly also means a
future port clash fails loudly with `EADDRINUSE` rather than silently.

## Configuration

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `EXERCISE_DB_PATH` | backend | `backendAPI/data/exercise.db` | SQLite file location |
| `CORS_ORIGINS` | backend | localhost and 127.0.0.1 on ports 3000-3002 | Comma separated allowed origins |
| `REACT_APP_API_URL` | frontend | `http://localhost:8000` | API base URL |
| `HOST` / `PORT` | frontend | `127.0.0.1` / `3002` | Dev server bind address, set in `frontend/.env` |

If you change the frontend port, add the new origin to `CORS_ORIGINS` or the
browser will block every API call.

## Data

Storage is SQLite via SQLAlchemy. The models in `src/tables.py` define the
schema, which is created on first boot, so there is nothing to provision. Each
request gets its own session (`get_session` in `src/db.py`); SQLAlchemy's pool
is what keeps that safe across FastAPI's worker threads.

Columns added to a model after a database already exists are backfilled at
startup by comparing the models against the live schema, which covers the
simple case without pulling in a migration tool. Anything more involved than
adding a column would want Alembic.

The exercise library and the rehab protocols are re-seeded on every start from
`src/assets/workouts.json` and `src/assets/rehab.json`; editing those files and
restarting updates the library without touching anything you have already
logged.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/settings` | Supported units and the band ladder |
| `GET` | `/` | Random routine (one exercise per category) |
| `GET` | `/categories` | Categories, or exercises within `?category=` |
| `GET` | `/generate` | Structured random routine |
| `GET` | `/exercises` | Library, filterable by `category`, `kind`, `joint`, `search` |
| `GET` `POST` | `/workouts` | List / create workouts |
| `GET` `PATCH` `DELETE` | `/workouts/{id}` | Read, edit, remove a workout |
| `GET` `POST` | `/sessions` | List / start training sessions |
| `GET` | `/sessions/active` | The session still in progress, if any |
| `PATCH` `DELETE` | `/sessions/{id}` | Add notes, finish, or discard |
| `POST` | `/sessions/{id}/logs` | Log a set |
| `DELETE` | `/sessions/{id}/logs/{log_id}` | Remove a logged set |
| `GET` | `/progress/summary` | Headline stats over `?days=` |
| `GET` | `/progress/volume` | Daily volume series |
| `GET` | `/progress/exercises` | Exercises with logged sets |
| `GET` | `/progress/exercises/{id}` | History and personal bests |
| `GET` | `/rehab` | Joints with a protocol |
| `GET` | `/rehab/{joint}` | Full protocol: phases, precautions, red flags |
| `GET` | `/rehab/{joint}/phase/{n}` | A single phase |
| `POST` | `/rehab/workout` | Turn a phase into a saved workout |

Session and progress endpoints take `?unit=kg|lb` (default `lb`) and return
weights and volumes in that unit; an unrecognised value falls back to the
default rather than erroring. Weights logged before units were recorded are read
as the default unit.

Deleting a workout keeps its past sessions; the session stores the workout name
so history stays readable.
