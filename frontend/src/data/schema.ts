/**
 * On-device schema. A direct port of the server's tables.py, with the same
 * column names and types so the two stay readable against each other and a
 * database can be moved between them.
 *
 * Timestamps are ISO-8601 strings rather than a native date type, matching the
 * server: SQLite has no date type either way, and ISO strings sort correctly.
 */

export const SCHEMA_VERSION = 1;

export const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS exercises (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    category    TEXT NOT NULL,
    equipment   TEXT NOT NULL DEFAULT 'none',
    description TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL DEFAULT 'strength',
    -- A rehab exercise can belong to more than one protocol, so these hold
    -- comma separated lists rather than a single value.
    joints      TEXT NOT NULL DEFAULT '',
    phases      TEXT NOT NULL DEFAULT ''
  );`,

  `CREATE TABLE IF NOT EXISTS workouts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL DEFAULT 'strength',
    joint       TEXT,
    created_at  TEXT NOT NULL,
    archived    INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS workout_items (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id        INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id       INTEGER NOT NULL REFERENCES exercises(id),
    position          INTEGER NOT NULL DEFAULT 0,
    target_sets       INTEGER NOT NULL DEFAULT 3,
    target_reps       INTEGER NOT NULL DEFAULT 10,
    target_weight     REAL,
    -- The unit the target was entered in, so changing the display preference
    -- never silently reinterprets the number.
    target_weight_unit TEXT,
    target_band       TEXT,
    target_band_level INTEGER,
    hold_seconds      INTEGER,
    notes             TEXT NOT NULL DEFAULT ''
  );`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Deleting a workout keeps its history, so the name is denormalised here.
    workout_id   INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
    workout_name TEXT NOT NULL DEFAULT '',
    started_at   TEXT NOT NULL,
    completed_at TEXT,
    notes        TEXT NOT NULL DEFAULT ''
  );`,

  `CREATE TABLE IF NOT EXISTS set_logs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    exercise_id      INTEGER NOT NULL REFERENCES exercises(id),
    set_number       INTEGER NOT NULL DEFAULT 1,
    reps             INTEGER,
    weight           REAL,
    weight_unit      TEXT,
    band             TEXT,
    band_level       INTEGER,
    duration_seconds INTEGER,
    rpe              REAL,
    pain             INTEGER,
    logged_at        TEXT NOT NULL
  );`,

  `CREATE INDEX IF NOT EXISTS ix_sessions_started_at ON sessions(started_at);`,
  `CREATE INDEX IF NOT EXISTS ix_set_logs_exercise ON set_logs(exercise_id);`,
  `CREATE INDEX IF NOT EXISTS ix_set_logs_session ON set_logs(session_id);`,
  `CREATE INDEX IF NOT EXISTS ix_workout_items_workout ON workout_items(workout_id);`,
];
