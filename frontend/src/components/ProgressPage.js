import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { categoryStyle } from '../categories';
import { useUnit } from '../units';
import {
  BarChart,
  CategoryTag,
  EmptyState,
  ErrorBanner,
  Loading,
  Stat,
  formatDate,
  formatDateTime,
} from './ui';

const WINDOWS = [7, 30, 90];

export default function ProgressPage() {
  const { unit } = useUnit();
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [volume, setVolume] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, volumeData, trackedData, sessionData] = await Promise.all([
        api.summary(days, unit),
        api.volume(days, unit),
        api.trackedExercises(),
        api.listSessions(15, unit),
      ]);
      setSummary(summaryData);
      setVolume(volumeData);
      setTracked(trackedData);
      setSessions(sessionData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days, unit]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (exercise) => {
    if (detail?.exercise?.id === exercise.id) {
      setDetail(null);
      return;
    }
    try {
      setDetail(await api.exerciseProgress(exercise.id, unit));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && !summary) return <Loading label="Loading progress" />;

  const hasData = summary && summary.total_sessions_all_time > 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Progress</h1>
          {summary && (
            <p className="session-meta">
              <span>{summary.total_sessions_all_time} sessions all time</span>
              <span>{summary.active_days} active days</span>
              {summary.current_streak_days > 0 && (
                <span className="streak">🔥 {summary.current_streak_days} day streak</span>
              )}
            </p>
          )}
        </div>
        <div className="segmented">
          {WINDOWS.map((window) => (
            <button
              key={window}
              type="button"
              className={days === window ? 'active' : ''}
              onClick={() => setDays(window)}
            >
              {window}d
            </button>
          ))}
        </div>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {!hasData ? (
        <EmptyState
          title="No training logged yet"
          message="Finish a session and your numbers will show up here."
        />
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Sessions" value={summary.sessions} hint={`last ${days} days`} />
            <Stat label="Sets" value={summary.sets} />
            <Stat label="Reps" value={summary.reps} />
            <Stat
              label={`Volume (${unit})`}
              value={Math.round(summary.volume).toLocaleString()}
              hint="reps × weight"
            />
            <Stat label="Band sets" value={summary.band_sets} hint="no volume, tracked by strength" />
            <Stat label="Rehab sets" value={summary.rehab_sets} />
            <Stat
              label="Streak"
              value={`${summary.current_streak_days}d`}
              hint={`${summary.active_days} active days`}
            />
          </div>

          <section className="panel">
            <h2>Daily volume ({unit})</h2>
            <BarChart data={volume} />
            <div className="chart-axis">
              <span>{formatDate(volume[0]?.date)}</span>
              <span>{formatDate(volume[volume.length - 1]?.date)}</span>
            </div>
          </section>

          <div className="two-col">
            <section className="panel">
              <h2>By exercise</h2>
              {!tracked.length ? (
                <p className="muted">Nothing logged yet.</p>
              ) : (
                <ul className="tracked-list">
                  {tracked.map((exercise) => (
                    <li key={exercise.id} style={categoryStyle(exercise.category)}>
                      <button type="button" onClick={() => openDetail(exercise)}>
                        <span>
                          {exercise.name}
                          <CategoryTag category={exercise.category} />
                        </span>
                        <span className="muted">
                          {exercise.set_count} sets · {formatDate(exercise.last_logged)}
                        </span>
                      </button>

                      {detail?.exercise?.id === exercise.id && (
                        <div className="detail">
                          <div className="pb-row">
                            {detail.personal_best.band ? (
                              <Stat
                                label="Strongest band"
                                value={detail.personal_best.band}
                                hint="band work is ranked, not weighed"
                              />
                            ) : (
                              <Stat
                                label={`Best weight (${unit})`}
                                value={detail.personal_best.weight ?? '—'}
                              />
                            )}
                            <Stat label="Best reps" value={detail.personal_best.reps ?? '—'} />
                            <Stat
                              label={`Est. 1RM (${unit})`}
                              value={detail.personal_best.estimated_one_rep_max ?? '—'}
                            />
                          </div>
                          <div className="table-scroll">
                          <table className="mini-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Sets</th>
                                <th>Reps</th>
                                <th>{detail.personal_best.band ? 'Top band' : `Top weight (${unit})`}</th>
                                <th>Volume ({unit})</th>
                                {detail.exercise.kind === 'rehab' && <th>Pain</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {detail.history.map((point) => (
                                <tr key={point.date}>
                                  <td>{formatDate(point.date)}</td>
                                  <td>{point.sets}</td>
                                  <td>{point.reps}</td>
                                  <td>
                                    {detail.personal_best.band
                                      ? point.top_band ?? '—'
                                      : point.top_weight ?? '—'}
                                  </td>
                                  <td>{point.volume}</td>
                                  {detail.exercise.kind === 'rehab' && (
                                    <td>{point.avg_pain ?? '—'}</td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <h2>Recent sessions</h2>
              <ul className="session-history">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <div>
                      <strong>{session.workout_name || 'Open session'}</strong>
                      <span className="muted"> {formatDateTime(session.started_at)}</span>
                    </div>
                    <span className="muted">
                      {session.set_count} sets ·{' '}
                      {Math.round(session.total_volume).toLocaleString()} {unit}
                      {session.band_sets ? ` · ${session.band_sets} band` : ''}
                      {!session.completed_at && ' · in progress'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
