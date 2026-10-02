import { useEffect, useState } from 'react';
import api from '../api';
import { useScrollTop } from '../useScrollTop';
import { ErrorBanner, Loading } from './ui';

const JOINT_ICONS = {
  knee: '🦵',
  shoulder: '💪',
  ankle: '🦶',
  wrist: '✋',
};

function ExerciseCard({ exercise }) {
  const prescription = [
    exercise.sets ? `${exercise.sets} sets` : null,
    exercise.reps > 1 ? `${exercise.reps} reps` : null,
    exercise.hold_seconds ? `${exercise.hold_seconds}s hold` : null,
    exercise.frequency,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="rehab-exercise">
      <div className="rehab-exercise-head">
        <strong>{exercise.name}</strong>
        {exercise.equipment && exercise.equipment !== 'none' && (
          <span className="tag">{exercise.equipment}</span>
        )}
      </div>
      <p>{exercise.description}</p>
      <p className="prescription">{prescription}</p>
      {exercise.cues?.length > 0 && (
        <ul className="cue-list">
          {exercise.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function JointDetail({ joint, onBack, onStartProtocol }) {
  const [data, setData] = useState(null);
  const [phase, setPhase] = useState(1);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  // Opening a protocol, and moving between its phases, are both destination
  // changes: the list you tapped from is often scrolled well down the page.
  useScrollTop(`${joint}:${phase}`);

  useEffect(() => {
    api
      .rehabJoint(joint)
      .then((result) => {
        setData(result);
        setPhase(result.phases[0]?.number ?? 1);
      })
      .catch((err) => setError(err.message));
  }, [joint]);

  if (error) return <ErrorBanner error={error} />;
  if (!data) return <Loading label="Loading protocol" />;

  const current = data.phases.find((entry) => entry.number === phase) || data.phases[0];

  const addToWorkouts = async () => {
    setCreating(true);
    try {
      const workout = await api.createRehabWorkout({ joint, phase: current.number });
      onStartProtocol(workout);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <button type="button" className="link-btn back" onClick={onBack}>
        ← All joints
      </button>

      <header className="page-head">
        <div>
          <h1>
            {JOINT_ICONS[joint]} {data.name} Rehab
          </h1>
          <p className="muted">{data.summary}</p>
        </div>
      </header>

      <div className="two-col">
        <section className="panel warn-panel">
          <h2>Before you start</h2>
          <p>{data.disclaimer}</p>
          <h3>Precautions</h3>
          <ul className="bullets">
            {data.precautions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="panel danger-panel">
          <h2>See someone if</h2>
          <ul className="bullets">
            {data.red_flags.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="pain-rule">{data.pain_rule}</p>
        </section>
      </div>

      <div className="phase-tabs">
        {data.phases.map((entry) => (
          <button
            key={entry.number}
            type="button"
            className={entry.number === current.number ? 'active' : ''}
            onClick={() => setPhase(entry.number)}
          >
            <span className="phase-number">Phase {entry.number}</span>
            <span className="phase-name">{entry.name}</span>
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="phase-head">
          <div>
            <h2>{current.name}</h2>
            <p className="muted">{current.goal}</p>
          </div>
          <button
            type="button"
            className="primary-btn"
            onClick={addToWorkouts}
            disabled={creating}
          >
            {creating ? 'Adding…' : 'Add to my workouts'}
          </button>
        </div>

        <div className="phase-meta">
          <span>
            <strong>Typical length:</strong> {current.typical_duration}
          </span>
          <span>
            <strong>Move on when:</strong> {current.advance_when}
          </span>
        </div>

        <ul className="rehab-exercise-list">
          {current.exercises.map((exercise) => (
            <ExerciseCard key={exercise.name} exercise={exercise} />
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function RehabPage({ onStartProtocol }) {
  const [index, setIndex] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  useScrollTop(selected);

  useEffect(() => {
    api.rehabJoints().then(setIndex).catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorBanner error={error} />;
  if (!index) return <Loading label="Loading rehab library" />;

  if (selected) {
    return (
      <JointDetail
        joint={selected}
        onBack={() => setSelected(null)}
        onStartProtocol={onStartProtocol}
      />
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Rehab</h1>
          <p className="session-meta">
            <span>
              {index.joints.length} {index.joints.length === 1 ? 'joint' : 'joints'}
            </span>
            <span>
              {index.joints.reduce((total, joint) => total + joint.phase_count, 0)} phases
            </span>
          </p>
        </div>
      </header>

      <p className="notice">{index.disclaimer}</p>

      <ul className="joint-grid">
        {index.joints.map((joint) => (
          <li key={joint.joint}>
            <button type="button" className="joint-card" onClick={() => setSelected(joint.joint)}>
              <span className="joint-icon">{JOINT_ICONS[joint.joint]}</span>
              <h3>{joint.name}</h3>
              <p>{joint.summary}</p>
              <p className="muted">
                {joint.phase_count} phases · {joint.exercise_count} exercises
              </p>
              <ul className="condition-list">
                {joint.common_conditions.slice(0, 3).map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
