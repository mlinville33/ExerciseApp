import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { convert, useUnit } from '../units';
import WorkoutBuilder from './WorkoutBuilder';
import { CategoryTag, EmptyState, ErrorBanner, Loading, MixBar, Modal, formatDate } from './ui';

export default function WorkoutsPage({ onStartSession }) {
  const { unit } = useUnit();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [builder, setBuilder] = useState(null); // { workout } or { workout: null } for new
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWorkouts(await api.listWorkouts());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = workouts.reduce((sum, workout) => sum + workout.session_count, 0);
  const sessionsLogged = `${total} ${total === 1 ? 'session' : 'sessions'}`;

  const openEditor = async (workout) => {
    try {
      const full = await api.getWorkout(workout.id);
      setBuilder({ workout: full });
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleExpand = async (workout) => {
    if (expanded?.id === workout.id) {
      setExpanded(null);
      return;
    }
    try {
      setExpanded(await api.getWorkout(workout.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (workout) => {
    if (!window.confirm(`Delete “${workout.name}”? Logged sessions are kept.`)) return;
    try {
      await api.deleteWorkout(workout.id);
      if (expanded?.id === workout.id) setExpanded(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Workouts</h1>
          {workouts.length > 0 && (
            <p className="session-meta">
              <span>
                {workouts.length} {workouts.length === 1 ? 'routine' : 'routines'}
              </span>
              <span>{sessionsLogged} logged</span>
            </p>
          )}
        </div>
        <button type="button" className="primary-btn" onClick={() => setBuilder({ workout: null })}>
          New workout
        </button>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {loading ? (
        <Loading label="Loading workouts" />
      ) : !workouts.length ? (
        <EmptyState
          title="No workouts yet"
          message="Create your first routine, or build one from a rehab protocol in the Rehab tab."
          action={
            <button
              type="button"
              className="primary-btn"
              onClick={() => setBuilder({ workout: null })}
            >
              Create a workout
            </button>
          }
        />
      ) : (
        <ul className="card-list">
          {workouts.map((workout) => (
            <li key={workout.id} className="card">
              <div className="card-main">
                <div>
                  <h3>
                    {workout.name}
                    {workout.kind === 'rehab' && <span className="tag tag-rehab">rehab</span>}
                  </h3>
                  <p className="muted">
                    {workout.item_count} {workout.item_count === 1 ? 'exercise' : 'exercises'} ·{' '}
                    {workout.session_count}{' '}
                    {workout.session_count === 1 ? 'session' : 'sessions'} logged · last done{' '}
                    {formatDate(workout.last_performed)}
                  </p>
                  {workout.description && <p className="card-note">{workout.description}</p>}
                  {/* What this routine actually trains, before you open it. */}
                  <MixBar mix={workout.category_mix} />
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => onStartSession(workout)}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => toggleExpand(workout)}
                  >
                    {expanded?.id === workout.id ? 'Hide' : 'View'}
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => openEditor(workout)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary-btn danger"
                    onClick={() => remove(workout)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {expanded?.id === workout.id && (
                <div className="table-scroll">
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Sets</th>
                      <th>Reps</th>
                      <th>Load</th>
                      <th>Hold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expanded.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.exercise_name}
                          <CategoryTag category={item.category} />
                          {item.description && (
                            <span className="how-to">{item.description}</span>
                          )}
                          {item.notes && <span className="cue">{item.notes}</span>}
                        </td>
                        <td>{item.target_sets}</td>
                        <td>{item.target_reps}</td>
                        <td>
                          {item.target_band
                            ? `${item.target_band} band`
                            : item.target_weight
                              ? `${convert(
                                  item.target_weight,
                                  item.target_weight_unit || unit,
                                  unit
                                )} ${unit}`
                              : '—'}
                        </td>
                        <td>{item.hold_seconds ? `${item.hold_seconds}s` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {builder && (
        <Modal
          wide
          title={builder.workout ? `Edit ${builder.workout.name}` : 'New workout'}
          onClose={() => setBuilder(null)}
        >
          <WorkoutBuilder
            workout={builder.workout}
            onCancel={() => setBuilder(null)}
            onSaved={() => {
              setBuilder(null);
              setExpanded(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
