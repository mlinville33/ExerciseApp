import os

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker

from src.tables import Base

## Location of the SQLite file. Override with EXERCISE_DB_PATH to point at a volume.
DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'exercise.db')
DB_PATH = os.path.abspath(os.environ.get('EXERCISE_DB_PATH', DEFAULT_DB_PATH))

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

## check_same_thread is off because FastAPI runs sync endpoints on a thread
## pool and a connection can be handed between workers. SQLAlchemy's pool is
## what makes that safe: it never lends one connection to two requests at once,
## and it reuses connections rather than reopening the file per request.
engine = create_engine(
    f'sqlite:///{DB_PATH}',
    connect_args={'check_same_thread': False, 'timeout': 15},
    pool_size=20,
    max_overflow=40,
    pool_recycle=3600,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@event.listens_for(engine, 'connect')
def _set_sqlite_pragmas(dbapi_connection, _record):
    """SQLite needs foreign keys switched on per connection; they are off by default."""
    cursor = dbapi_connection.cursor()
    cursor.execute('PRAGMA foreign_keys = ON')
    cursor.close()


def get_session():
    """FastAPI dependency: one session per request, committed on success."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _add_missing_columns():
    """Add columns that exist on a model but not yet in the database.

    SQLite cannot express "ADD COLUMN IF NOT EXISTS" and create_all() leaves
    existing tables alone, so a database created by an earlier version would
    otherwise be missing newer columns. Comparing the models against the live
    schema covers that without pulling in a migration tool.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {column['name'] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                column_type = column.type.compile(engine.dialect)
                connection.execute(
                    text(f'ALTER TABLE {table.name} ADD COLUMN {column.name} {column_type}')
                )


def init_db():
    """Create the schema and bring an older database up to date."""
    # WAL lets reads continue while a write is in progress. It is a persistent
    # property of the file, so it is set once here rather than per connection.
    with engine.begin() as connection:
        connection.execute(text('PRAGMA journal_mode = WAL'))

    Base.metadata.create_all(engine)
    _add_missing_columns()
