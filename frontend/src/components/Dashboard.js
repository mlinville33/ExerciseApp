import { useEffect, useState } from 'react';
import api from '../api';
import { useUnit } from '../units';
import { BarChart, ErrorBanner, Loading, Stat, formatDate } from './ui';

export default function Dashboard({ activeSession, onNavigate, onResume }) {
  const { unit } = useUnit();
  const [summary, setSummary] = useState(null);
  const [volume, setVolume] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.summary(30, unit), api.volume(14, unit), api.listWorkouts()])
      .then(([summaryData, volumeData, workoutData]) => {
        setSummary(summaryData);
        setVolume(volumeData);
        setWorkouts(workoutData.slice(0, 4));
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [activeSession?.id, unit]);

  // Failing quietly here renders a blank dashboard with no explanation, which
  // looks identical to having no data yet.
  if (error) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Welcome back</h1>
        </header>
        <ErrorBanner error={`Could not load your stats. ${error}`} />
        <p className="muted">
          Your training data lives in a database on this device, so this is not a connection
          problem. Reopening the app usually clears it; if it does not, the database may need
          to be reset.
        </p>
      </div>
    );
  }

  if (!summary) return <Loading label="Loading dashboard" />;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Welcome back</h1>
          {summary.total_sessions_all_time ? (
            <p className="session-meta">
              <span>{summary.total_sessions_all_time} sessions</span>
              <span>{summary.active_days} active days</span>
              {summary.current_streak_days > 0 && (
                <span className="streak">🔥 {summary.current_streak_days} day streak</span>
              )}
            </p>
          ) : (
            <p className="muted">Build a workout and log your first session.</p>
          )}
        </div>
      </header>

      {activeSession && (
        <div className="resume-banner">
          <div>
            <strong>Session in progress</strong>
            <p className="muted">
              {activeSession.workout_name || 'Open session'} · {activeSession.logs.length} sets
              logged
            </p>
          </div>
          <button type="button" className="primary-btn" onClick={onResume}>
            Resume
          </button>
        </div>
      )}

      <div className="stat-grid">
        <Stat label="Sessions" value={summary.sessions} hint="last 30 days" />
        <Stat
          label={`Volume (${unit})`}
          value={Math.round(summary.volume).toLocaleString()}
          hint="last 30 days"
        />
        <Stat label="Streak" value={`${summary.current_streak_days}d`} />
        <Stat label="Rehab sets" value={summary.rehab_sets} hint="last 30 days" />
      </div>

      <section className="panel">
        <h2>Last two weeks ({unit})</h2>
        <BarChart data={volume} />
      </section>

      <section className="panel">
        <div className="phase-head">
          <h2>Your workouts</h2>
          <button type="button" className="link-btn" onClick={() => onNavigate('workouts')}>
            see all
          </button>
        </div>
        {!workouts.length ? (
          <p className="muted">
            No workouts yet.{' '}
            <button type="button" className="link-btn" onClick={() => onNavigate('workouts')}>
              Create one
            </button>{' '}
            or start from a{' '}
            <button type="button" className="link-btn" onClick={() => onNavigate('rehab')}>
              rehab protocol
            </button>
            .
          </p>
        ) : (
          <ul className="quick-list">
            {workouts.map((workout) => (
              <li key={workout.id}>
                <div>
                  <strong>{workout.name}</strong>
                  <span className="muted">
                    {' '}
                    {workout.item_count} exercises · last {formatDate(workout.last_performed)}
                  </span>
                </div>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => onNavigate('workouts')}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
