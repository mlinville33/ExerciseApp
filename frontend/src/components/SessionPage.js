import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import { categoryStyle } from '../categories';
import { BANDS, convert, isBandExercise, useUnit } from '../units';
import { useScrollTop } from '../useScrollTop';
import {
  BandOptions,
  CategoryTag,
  EmptyState,
  ErrorBanner,
  Loading,
  Modal,
  PrBadge,
  SetProgress,
  Stat,
  formatClock,
  formatDuration,
} from './ui';

/** Seconds of rest offered after a set, and the size of one nudge. */
const REST_SECONDS = 90;
const REST_STEP = 30;

/** Epley, matching the estimate the API uses so the two never disagree. */
const estimateOneRepMax = (weight, reps) =>
  !weight || !reps ? null : weight * (1 + reps / 30);

/**
 * Decide whether a set beat the standing record, and on which measure.
 *
 * A record that does not exist yet cannot be beaten, so the first time an
 * exercise is ever logged is not a PR - only the time it is bettered.
 */
function scorePr(log, best, unit) {
  if (!best) return null;

  const weight = log.weight === null || log.weight === undefined
    ? null
    : convert(log.weight, log.weight_unit, unit);

  if (weight !== null) {
    if (best.weight !== null && best.weight !== undefined && weight > best.weight) {
      return 'weight';
    }
    const estimate = estimateOneRepMax(weight, log.reps);
    if (
      estimate !== null &&
      best.estimated_one_rep_max !== null &&
      best.estimated_one_rep_max !== undefined &&
      estimate > best.estimated_one_rep_max
    ) {
      return '1rm';
    }
    return null;
  }

  if (log.band_level !== null && log.band_level !== undefined) {
    if (
      best.band_level !== null &&
      best.band_level !== undefined &&
      log.band_level > best.band_level
    ) {
      return 'band';
    }
    return null;
  }

  if (log.reps !== null && log.reps !== undefined) {
    if (best.reps !== null && best.reps !== undefined && log.reps > best.reps) {
      return 'reps';
    }
  }
  return null;
}

/** Fold a logged set into the running record, so it cannot be beaten twice. */
function absorbBest(best, log, unit) {
  const next = { ...(best || {}) };
  const weight = log.weight === null || log.weight === undefined
    ? null
    : convert(log.weight, log.weight_unit, unit);

  if (weight !== null && (next.weight == null || weight > next.weight)) next.weight = weight;
  if (log.reps != null && (next.reps == null || log.reps > next.reps)) next.reps = log.reps;

  const estimate = estimateOneRepMax(weight, log.reps);
  if (estimate != null && (next.estimated_one_rep_max == null
    || estimate > next.estimated_one_rep_max)) {
    next.estimated_one_rep_max = estimate;
  }
  if (log.band_level != null && (next.band_level == null || log.band_level > next.band_level)) {
    next.band = log.band;
    next.band_level = log.band_level;
  }
  return next;
}

/** A number field you can drive with your thumb instead of a keyboard. */
function Stepper({ label, value, onChange, step = 1, min = 0, max, wide }) {
  const nudge = (delta) => {
    const raw = (Number(value) || 0) + delta;
    const clamped = Math.min(max ?? Infinity, Math.max(min, raw));
    // Weight steps by 2.5, so trim the float noise rather than showing 47.50000001.
    onChange(String(Math.round(clamped * 100) / 100));
  };

  return (
    <div className={`stepper${wide ? ' stepper-wide' : ''}`}>
      <span className="stepper-label">{label}</span>
      <div className="stepper-body">
        <button type="button" onClick={() => nudge(-step)} aria-label={`Decrease ${label}`}>
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" onClick={() => nudge(step)} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

/** Counts the rest between sets down, with the bar draining as it goes. */
function RestTimer({ rest, onExtend, onSkip }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, (rest.endsAt - now) / 1000);
  const elapsed = rest.duration - remaining;
  const done = remaining <= 0;

  return (
    <div className={`rest${done ? ' rest-done' : ''}`} role="status" aria-live="polite">
      <div className="rest-track">
        <div
          className="rest-fill"
          style={{ width: `${Math.min(100, (elapsed / rest.duration) * 100)}%` }}
        />
      </div>
      <div className="rest-row">
        <strong className="rest-clock">{done ? 'Rest done' : formatClock(remaining)}</strong>
        <div className="rest-actions">
          {!done && (
            <button type="button" className="secondary-btn small" onClick={onExtend}>
              +{REST_STEP}s
            </button>
          )}
          <button type="button" className="secondary-btn small" onClick={onSkip}>
            {done ? 'Dismiss' : 'Skip rest'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The exercise you are on: the plan, the sets so far, and one place to log. */
function FocusCard({ item, logs, isRehab, prs, onLog, onDeleteLog }) {
  const { unit } = useUnit();
  const done = logs.length;
  const nextSet = done + 1;
  const last = logs[logs.length - 1];
  const complete = done >= item.target_sets;

  const defaultMode = item.target_band || isBandExercise(item.equipment) ? 'band' : 'weight';
  const [mode, setMode] = useState(defaultMode);
  const [reps, setReps] = useState(item.target_reps ?? '');
  const [weight, setWeight] = useState(
    item.target_weight === null || item.target_weight === undefined
      ? ''
      : convert(item.target_weight, item.target_weight_unit || unit, unit)
  );
  const [band, setBand] = useState(item.target_band || 'Medium');
  const [hold, setHold] = useState(item.hold_seconds ?? '');
  const [effort, setEffort] = useState('');

  // Moving to another exercise re-seeds the form from that exercise's targets.
  useEffect(() => {
    setMode(item.target_band || isBandExercise(item.equipment) ? 'band' : 'weight');
    setReps(item.target_reps ?? '');
    setWeight(
      item.target_weight === null || item.target_weight === undefined
        ? ''
        : convert(item.target_weight, item.target_weight_unit || unit, unit)
    );
    setBand(item.target_band || 'Medium');
    setHold(item.hold_seconds ?? '');
    setEffort('');
  }, [item.id, item.equipment, item.target_band, item.target_reps, item.target_weight,
    item.target_weight_unit, item.hold_seconds, unit]);

  const submit = (event) => {
    event.preventDefault();
    onLog({
      exercise_id: item.exercise_id,
      set_number: nextSet,
      reps: reps === '' ? null : Number(reps),
      weight: mode === 'weight' && weight !== '' ? Number(weight) : null,
      weight_unit: mode === 'weight' && weight !== '' ? unit : null,
      band: mode === 'band' && band ? band : null,
      duration_seconds: hold === '' ? null : Number(hold),
      rpe: !isRehab && effort !== '' ? Number(effort) : null,
      pain: isRehab && effort !== '' ? Number(effort) : null,
    });
    setEffort('');
  };

  // Rehab cues are stored joined with a pipe; a list is far easier to scan
  // than one run-on line when you are part way through a set.
  const cues = (item.notes || '')
    .split('|')
    .map((cue) => cue.trim())
    .filter(Boolean);

  const describeTarget = () => {
    if (item.target_band) return ` · ${item.target_band} band`;
    if (item.target_weight) {
      return ` @ ${convert(item.target_weight, item.target_weight_unit || unit, unit)} ${unit}`;
    }
    return '';
  };

  return (
    <section
      className={`focus-card${complete ? ' complete' : ''}`}
      style={categoryStyle(item.category)}
    >
      <header className="focus-head">
        <div>
          <CategoryTag category={item.category} />
          <h2 className="focus-name">{item.exercise_name}</h2>
          <p className="focus-target">
            target {item.target_sets} × {item.target_reps}
            {describeTarget()}
            {item.hold_seconds ? ` · ${item.hold_seconds}s hold` : ''}
          </p>
        </div>
        <SetProgress done={done} target={item.target_sets} />
      </header>

      {/* How to actually do the movement. Needed most here, mid-session,
          where you cannot go and look it up without losing your place. */}
      {item.description && <p className="how-to">{item.description}</p>}
      {cues.length > 0 && (
        <ul className="cue-list">
          {cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      )}

      {logs.length > 0 && (
        <ul className="logged-sets">
          {logs.map((log) => (
            <li key={log.id} className={prs[log.id] ? 'logged-pr' : ''}>
              <span>
                <b>Set {log.set_number}</b> {log.reps ?? '—'} reps
                {log.weight ? ` × ${convert(log.weight, log.weight_unit, unit)} ${unit}` : ''}
                {log.band ? ` · ${log.band} band` : ''}
                {log.duration_seconds ? ` · ${log.duration_seconds}s` : ''}
                {log.rpe ? ` · RPE ${log.rpe}` : ''}
                {log.pain !== null && log.pain !== undefined ? ` · pain ${log.pain}` : ''}
                {prs[log.id] && <PrBadge type={prs[log.id]} />}
              </span>
              <button
                type="button"
                className="icon-btn danger"
                onClick={() => onDeleteLog(log.id)}
                aria-label={`Delete set ${log.set_number}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="log-form" onSubmit={submit}>
        <div className="load-toggle" role="group" aria-label="Load type">
          <button
            type="button"
            className={mode === 'weight' ? 'active' : ''}
            onClick={() => setMode('weight')}
          >
            Weight
          </button>
          <button
            type="button"
            className={mode === 'band' ? 'active' : ''}
            onClick={() => setMode('band')}
          >
            Band
          </button>
        </div>

        <div className="stepper-row">
          <Stepper label="Reps" value={reps} onChange={setReps} step={1} />

          {mode === 'weight' ? (
            <Stepper
              label={`Weight (${unit})`}
              value={weight}
              onChange={setWeight}
              step={unit === 'kg' ? 1.25 : 2.5}
              wide
            />
          ) : (
            <label className="band-field">
              <span>Band</span>
              <input
                list="band-options"
                value={band}
                onChange={(event) => setBand(event.target.value)}
                placeholder="Medium"
              />
            </label>
          )}

          <Stepper label="Hold (s)" value={hold} onChange={setHold} step={5} />
          <Stepper
            label={isRehab ? 'Pain 0-10' : 'RPE'}
            value={effort}
            onChange={setEffort}
            step={isRehab ? 1 : 0.5}
            min={0}
            max={10}
          />
        </div>

        <div className="log-actions">
          <button type="submit" className="primary-btn log-btn">
            Log set {nextSet}
          </button>
          {last && (
            <span className="muted small-text">
              last: {last.reps ?? '—'} reps
              {last.band
                ? `, ${last.band}`
                : last.weight
                  ? `, ${convert(last.weight, last.weight_unit, unit)} ${unit}`
                  : ''}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

/** Everything in the workout, with where you are in each. Doubles as the jump list. */
function UpNext({ items, logsByExercise, currentIndex, onJump }) {
  return (
    <nav className="up-next" aria-label="Exercises in this workout">
      {items.map((item, index) => {
        const done = (logsByExercise.get(item.exercise_id) || []).length;
        const complete = done >= item.target_sets;
        return (
          <button
            key={item.id}
            type="button"
            style={categoryStyle(item.category)}
            className={`up-next-item${index === currentIndex ? ' current' : ''}${
              complete ? ' complete' : ''
            }`}
            onClick={() => onJump(index)}
            aria-current={index === currentIndex}
          >
            <span className="up-next-name">{item.exercise_name}</span>
            <SetProgress done={done} target={item.target_sets} />
          </button>
        );
      })}
    </nav>
  );
}

/** The payoff: what the session came to, shown once it is put to bed. */
function FinishSummary({ finished, previous, prs, planItems, unit, onClose }) {
  const logs = finished.logs || [];
  const reps = logs.reduce((total, log) => total + (log.reps || 0), 0);
  const volume = Math.round(finished.total_volume || 0);
  const previousVolume = previous ? Math.round(previous.total_volume || 0) : null;
  const delta = previousVolume ? Math.round(((volume - previousVolume) / previousVolume) * 100) : null;

  const nameFor = (exerciseId) =>
    planItems.find((item) => item.exercise_id === exerciseId)?.exercise_name || 'Exercise';

  const prList = logs.filter((log) => prs[log.id]);

  return (
    <Modal title="Session complete" onClose={onClose}>
      <div className="summary">
        <div className="stat-grid">
          <Stat label="Duration" value={formatDuration(finished.started_at, finished.completed_at)} />
          <Stat label="Sets" value={logs.length} />
          <Stat label="Reps" value={reps} />
          <Stat label={`Volume (${unit})`} value={volume.toLocaleString()} />
        </div>

        {delta !== null && (
          <p className={`delta${delta >= 0 ? ' up' : ' down'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% volume vs. your last{' '}
            {finished.workout_name || 'session'}
            <span className="muted">
              {' '}
              ({previousVolume.toLocaleString()} → {volume.toLocaleString()} {unit})
            </span>
          </p>
        )}

        {prList.length > 0 && (
          <section className="summary-prs">
            <h3>
              {prList.length} personal best{prList.length > 1 ? 's' : ''}
            </h3>
            <ul className="bullets">
              {prList.map((log) => (
                <li key={log.id}>
                  <strong>{nameFor(log.exercise_id)}</strong> —{' '}
                  {log.weight
                    ? `${convert(log.weight, log.weight_unit, unit)} ${unit} × ${log.reps} reps`
                    : log.band
                      ? `${log.band} band × ${log.reps} reps`
                      : `${log.reps} reps`}
                  <PrBadge type={prs[log.id]} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="builder-footer">
          <button type="button" className="primary-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function SessionPage({ session, onSessionChange, onFinished, onBrowseWorkouts }) {
  const { unit } = useUnit();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState(session?.notes || '');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prs, setPrs] = useState({});
  const [rest, setRest] = useState(null);
  const [summary, setSummary] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // Previous/Next, and jumping from the up-next list, both change which
  // exercise you are on - and the up-next list sits below the fold.
  useScrollTop(currentIndex);

  // Records standing before this session started. Held in a ref because every
  // logged set folds into it, and the PR check needs the value as it is at that
  // moment rather than as it was when the render closed over it.
  const bestsRef = useRef({});

  const loadPlan = useCallback(async () => {
    if (!session?.workout_id) {
      setPlan(null);
      return;
    }
    setLoading(true);
    try {
      setPlan(await api.getWorkout(session.workout_id));
    } catch (err) {
      // The workout may have been deleted mid-session; logging still works.
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [session?.workout_id]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    setNotes(session?.notes || '');
  }, [session?.id, session?.notes]);

  // PR detection is a bonus on top of logging: if this call fails, sets still
  // log, they just never get a badge.
  useEffect(() => {
    if (!session?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const bests = await api.bests(session.id, unit);
        if (!cancelled) bestsRef.current = bests || {};
      } catch {
        if (!cancelled) bestsRef.current = {};
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.id, unit]);

  // One ticking clock for the header; the rest timer runs its own.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const logsByExercise = useMemo(() => {
    const map = new Map();
    (session?.logs || []).forEach((log) => {
      if (!map.has(log.exercise_id)) map.set(log.exercise_id, []);
      map.get(log.exercise_id).push(log);
    });
    return map;
  }, [session?.logs]);

  if (!session) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1>Today</h1>
          </div>
        </header>
        <EmptyState
          title="Nothing in progress"
          message="Start a workout to begin logging sets."
          action={
            <button type="button" className="primary-btn" onClick={onBrowseWorkouts}>
              Choose a workout
            </button>
          }
        />
      </div>
    );
  }

  const isRehab = plan?.kind === 'rehab';
  const items = plan?.items || [];
  const current = items[Math.min(currentIndex, Math.max(items.length - 1, 0))];

  const handleLog = async (body) => {
    const before = new Set((session.logs || []).map((log) => log.id));
    try {
      const updated = await api.logSet(session.id, body, unit);
      const created = (updated.logs || []).find((log) => !before.has(log.id));

      if (created) {
        const best = bestsRef.current[String(created.exercise_id)];
        const type = scorePr(created, best, unit);
        if (type) setPrs((current_) => ({ ...current_, [created.id]: type }));
        bestsRef.current = {
          ...bestsRef.current,
          [String(created.exercise_id)]: absorbBest(best, created, unit),
        };
      }

      onSessionChange(updated);
      setRest({ endsAt: Date.now() + REST_SECONDS * 1000, duration: REST_SECONDS });
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteLog = async (logId) => {
    try {
      onSessionChange(await api.deleteLog(session.id, logId, unit));
      setPrs((current_) => {
        const next = { ...current_ };
        delete next[logId];
        return next;
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const finish = async () => {
    try {
      const finished = await api.updateSession(session.id, { completed: true, notes }, unit);

      // Comparing against the last time you ran this workout is a nicety, so a
      // failure here still lets the summary open.
      let previous = null;
      try {
        const history = await api.listSessions(30, unit);
        previous =
          (history || []).find(
            (entry) =>
              entry.id !== session.id &&
              entry.workout_id === session.workout_id &&
              entry.completed_at
          ) || null;
      } catch {
        previous = null;
      }

      setRest(null);
      setSummary({ finished, previous });
    } catch (err) {
      setError(err.message);
    }
  };

  const discard = async () => {
    if (!window.confirm('Discard this session and everything logged in it?')) return;
    try {
      await api.deleteSession(session.id);
      onFinished();
    } catch (err) {
      setError(err.message);
    }
  };

  const totalSets = session.logs.length;
  const completedCount = items.filter(
    (item) => (logsByExercise.get(item.exercise_id) || []).length >= item.target_sets
  ).length;

  return (
    <div className="page">
      <header className="page-head session-head">
        <div>
          <h1>{session.workout_name || 'Open session'}</h1>
          <p className="session-meta">
            <span className="live-clock">
              <i className="live-dot" />
              {formatDuration(session.started_at, new Date(now).toISOString())}
            </span>
            <span>{totalSets} sets</span>
            <span>
              {Math.round(session.total_volume).toLocaleString()} {unit}
            </span>
            {items.length > 0 && (
              <span>
                {completedCount}/{items.length} exercises
              </span>
            )}
          </p>
        </div>
        <div className="card-actions">
          <button type="button" className="secondary-btn danger" onClick={discard}>
            Discard
          </button>
          <button type="button" className="primary-btn" onClick={finish}>
            Finish session
          </button>
        </div>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {isRehab && (
        <p className="notice">
          Rehab session: log a pain score for each set. Keep it at 3 or below, and back off if it
          lingers into the next day.
        </p>
      )}

      <BandOptions bands={BANDS} />

      {loading ? (
        <Loading label="Loading plan" />
      ) : current ? (
        <>
          <FocusCard
            key={current.id}
            item={current}
            isRehab={isRehab}
            prs={prs}
            logs={logsByExercise.get(current.exercise_id) || []}
            onLog={handleLog}
            onDeleteLog={handleDeleteLog}
          />

          {rest && (
            <RestTimer
              rest={rest}
              onExtend={() =>
                setRest((value) => ({
                  endsAt: value.endsAt + REST_STEP * 1000,
                  duration: value.duration + REST_STEP,
                }))
              }
              onSkip={() => setRest(null)}
            />
          )}

          <div className="focus-nav">
            <button
              type="button"
              className="secondary-btn"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((index) => index - 1)}
            >
              ← Previous
            </button>
            <span className="muted small-text">
              {currentIndex + 1} of {items.length}
            </span>
            <button
              type="button"
              className="secondary-btn"
              disabled={currentIndex >= items.length - 1}
              onClick={() => setCurrentIndex((index) => index + 1)}
            >
              Next →
            </button>
          </div>

          <UpNext
            items={items}
            logsByExercise={logsByExercise}
            currentIndex={currentIndex}
            onJump={setCurrentIndex}
          />
        </>
      ) : (
        <EmptyState
          title="No plan attached"
          message="This session has no workout behind it, so nothing is pre-filled."
        />
      )}

      <label className="field">
        <span>Session notes</span>
        <textarea
          rows="3"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => api.updateSession(session.id, { notes }).catch(() => {})}
          placeholder="How did it feel?"
        />
      </label>

      {summary && (
        <FinishSummary
          finished={summary.finished}
          previous={summary.previous}
          prs={prs}
          planItems={items}
          unit={unit}
          onClose={onFinished}
        />
      )}
    </div>
  );
}
