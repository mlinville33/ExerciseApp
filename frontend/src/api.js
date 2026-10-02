/**
 * The app's data access, backed entirely by an on-device SQLite database.
 *
 * This used to be a thin HTTP client for the FastAPI backend. Nothing else in
 * the app imported `fetch`, so moving the data on-device was a matter of
 * reimplementing this one module's methods against local SQLite - every
 * component still does `import api from './api'` and is unaware of the change.
 *
 * There is no server, no network call and no account. The app works in a gym
 * basement with no signal, which is the point. The Python backend in
 * backendAPI/ remains the source of the exercise library that seeds the
 * database, and is still useful for export and backup, but the app does not
 * talk to it.
 */
import api, { resetDatabase } from './data';

/**
 * A handle on the data layer for debugging.
 *
 * With the app running on a phone you can attach desktop Chrome to it through
 * chrome://inspect and query the real database from the console - which is the
 * only practical way to see what is going on inside a WebView. It is also what
 * the automated checks in scripts/ drive.
 */
if (typeof window !== 'undefined') {
  window.exerciseApp = { api, resetDatabase };
}

export { resetDatabase };
export default api;
