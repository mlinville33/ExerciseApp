import {
  CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { SCHEMA_VERSION, STATEMENTS } from './schema';
import { seedLibrary } from './seed';

/**
 * One SQLite database, opened the same way everywhere.
 *
 * On a phone this is a real database file in the app's private storage. In a
 * browser the same plugin runs SQLite compiled to WebAssembly and persists to
 * IndexedDB, which is what lets the whole data layer be developed and tested
 * with `npm start` on a machine with no device attached.
 *
 * The browser store only writes back to IndexedDB when it is told to, so
 * `saveWebStore` runs after anything that changes data. On a device that call
 * is a no-op.
 */

const DB_NAME = 'exerciseapp';
const IS_WEB = Capacitor.getPlatform() === 'web';

const sqlite = new SQLiteConnection(CapacitorSQLite);

let handle: SQLiteDBConnection | null = null;
let opening: Promise<SQLiteDBConnection> | null = null;

/** The custom element jeep-sqlite defines; it has no published types. */
interface JeepSqliteElement extends HTMLElement {
  componentOnReady?: () => Promise<unknown>;
}

/**
 * Bring up the browser's SQLite runtime.
 *
 * jeep-sqlite is loaded as a plain script rather than imported, because its
 * ESM build pulls in node's `crypto` and webpack refuses to bundle that. The
 * prebuilt standalone version has no such import, self-registers the custom
 * element, and is copied into public/assets by scripts/sync-library.mjs.
 */
async function startWebStore() {
  if (!document.querySelector('script[data-jeep-sqlite]')) {
    await new Promise<void>((ready, fail) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = `${process.env.PUBLIC_URL || ''}/assets/jeep-sqlite/jeep-sqlite.esm.js`;
      script.dataset.jeepSqlite = 'true';
      script.onload = () => ready();
      script.onerror = () => fail(new Error('Could not load the browser SQLite runtime'));
      document.head.appendChild(script);
    });
  }

  await customElements.whenDefined('jeep-sqlite');

  // The element has to be in the DOM before the connection is opened; it is
  // what owns the wasm instance and the IndexedDB store behind it.
  if (!document.querySelector('jeep-sqlite')) {
    const element = document.createElement('jeep-sqlite') as JeepSqliteElement;
    document.body.appendChild(element);
    await element.componentOnReady?.();
  }

  await sqlite.initWebStore();
}

/** Reject rather than hang forever, so a failure reaches the error banner. */
function withTimeout<T>(promise: Promise<T>, milliseconds: number, what: string) {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, fail) => {
      timer = setTimeout(
        () => fail(new Error(`${what} timed out after ${milliseconds}ms`)),
        milliseconds
      );
    }),
  ]);
}

async function open(): Promise<SQLiteDBConnection> {
  if (IS_WEB) await startWebStore();

  // The plugin tracks open connections separately from this module's state, so
  // a hot reload can leave one behind. Reconciling first is what makes
  // retrieve/create reliable rather than a coin flip.
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const existing = (await sqlite.isConnection(DB_NAME, false)).result;

  const connection = consistent && existing
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', SCHEMA_VERSION, false);

  await withTimeout(connection.open(), 15000, 'Opening the database');

  await connection.execute('PRAGMA foreign_keys = ON;');
  for (const statement of STATEMENTS) {
    await connection.execute(statement);
  }

  await seedLibrary(connection);
  if (IS_WEB) await sqlite.saveToStore(DB_NAME);

  return connection;
}

/** The open database, opening it on first use. Safe to call concurrently. */
export function db(): Promise<SQLiteDBConnection> {
  if (handle) return Promise.resolve(handle);
  if (!opening) {
    opening = open().then(
      (connection) => {
        handle = connection;
        opening = null;
        return connection;
      },
      (error) => {
        opening = null;
        throw error;
      }
    );
  }
  return opening;
}

/** Persist the browser store. A no-op on a device. */
export async function saveWebStore() {
  if (IS_WEB) await sqlite.saveToStore(DB_NAME);
}

/**
 * Rows for a SELECT.
 *
 * The caller names the row shape. SQLite hands back whatever the query asked
 * for, so this is an assertion about the SQL rather than something that can be
 * checked - which is exactly why the shapes live in types.ts next to the schema
 * they mirror.
 */
export async function all<Row>(sql: string, params: unknown[] = []): Promise<Row[]> {
  const connection = await db();
  const result = await connection.query(sql, params);
  return (result.values ?? []) as Row[];
}

/** The first row, or null. */
export async function one<Row>(sql: string, params: unknown[] = []): Promise<Row | null> {
  const rows = await all<Row>(sql, params);
  return rows.length ? rows[0] : null;
}

/** A single scalar from the first row, or null. */
export async function scalar<Value>(sql: string, params: unknown[] = []): Promise<Value | null> {
  const row = await one<Record<string, Value>>(sql, params);
  if (!row) return null;
  const keys = Object.keys(row);
  return keys.length ? row[keys[0]] : null;
}

/** Run a write and return the id of the inserted row, when there is one. */
export async function run(sql: string, params: unknown[] = []): Promise<number | null> {
  const connection = await db();
  const result = await connection.run(sql, params, false);
  await saveWebStore();
  return result.changes?.lastId ?? null;
}

/**
 * Run several writes as one unit. The callback receives the connection and
 * queues statements on it; nothing is visible until the whole set succeeds.
 */
export async function transaction<Result>(
  work: (connection: SQLiteDBConnection) => Promise<Result>
): Promise<Result> {
  const connection = await db();

  // The second argument turns off the plugin's own transaction wrapping. It
  // defaults to true, which would put these statements inside a transaction of
  // their own and fail with "cannot start a transaction within a transaction".
  await connection.execute('BEGIN TRANSACTION;', false);
  try {
    const result = await work(connection);
    await connection.execute('COMMIT;', false);
    await saveWebStore();
    return result;
  } catch (error) {
    await connection.execute('ROLLBACK;', false);
    throw error;
  }
}

/** Delete everything and re-seed. Used for debugging and by the reset control. */
export async function resetDatabase() {
  const connection = await db();
  for (const table of ['set_logs', 'sessions', 'workout_items', 'workouts', 'exercises']) {
    await connection.execute(`DELETE FROM ${table};`);
  }
  await connection.execute(
    "DELETE FROM sqlite_sequence WHERE name IN " +
    "('set_logs','sessions','workout_items','workouts','exercises');"
  );
  await seedLibrary(connection, { force: true });
  await saveWebStore();
}
