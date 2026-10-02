import { useCallback, useEffect, useState } from 'react';
import './App.css';
import api from './api';
import Dashboard from './components/Dashboard';
import ExercisesPage from './components/ExercisesPage';
import ProgressPage from './components/ProgressPage';
import RehabPage from './components/RehabPage';
import SessionPage from './components/SessionPage';
import WorkoutsPage from './components/WorkoutsPage';
import { ErrorBanner } from './components/ui';
import { UNITS, UnitProvider, useUnit } from './units';
import { useScrollTop } from './useScrollTop';

// Icons carry the tab bar on phones, where there is no room for six words.
// On wider screens they are hidden and the labels do the work.
const TABS = [
  { id: 'dashboard', label: 'Home', icon: '🏠' },
  { id: 'workouts', label: 'Workouts', icon: '📋' },
  { id: 'exercises', label: 'Exercises', icon: '💪' },
  { id: 'session', label: 'Today', icon: '⚡' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'rehab', label: 'Rehab', icon: '🩹' },
];

/** Switches the unit everything is displayed and entered in. */
function UnitToggle() {
  const { unit, setUnit } = useUnit();

  return (
    <div className="segmented unit-toggle" role="group" aria-label="Weight unit">
      {UNITS.map((option) => (
        <button
          key={option}
          type="button"
          className={unit === option ? 'active' : ''}
          onClick={() => setUnit(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function AppShell() {
  const { unit } = useUnit();
  const [tab, setTab] = useState('dashboard');
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [booting, setBooting] = useState(true);

  // Switching tabs is a destination change, so it starts at the top.
  useScrollTop(tab);

  // Pick up a session that was left running, so a refresh does not lose it.
  // Re-runs on a unit change so the session's totals come back in that unit.
  useEffect(() => {
    api
      .activeSession(unit)
      .then(setSession)
      .catch((err) =>
        setError(`Could not open your training database on this device. (${err.message})`)
      )
      .finally(() => setBooting(false));
  }, [unit]);

  const startSession = useCallback(
    async (workout) => {
      try {
        const started = await api.startSession({ workout_id: workout.id }, unit);
        setSession(started);
        setTab('session');
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    },
    [unit]
  );

  const finishSession = useCallback(() => {
    setSession(null);
    setTab('progress');
  }, []);

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">
          <span className="brand-mark">◈</span> ExerciseApp
        </div>
        <ul>
          {TABS.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={tab === entry.id ? 'active' : ''}
                onClick={() => setTab(entry.id)}
                aria-current={tab === entry.id ? 'page' : undefined}
              >
                <span className="tab-icon" aria-hidden="true">
                  {entry.icon}
                </span>
                <span className="tab-label">{entry.label}</span>
                {entry.id === 'session' && session && <span className="dot" aria-label="active" />}
              </button>
            </li>
          ))}
        </ul>
        <UnitToggle />
      </nav>

      <main className="main">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        {booting ? null : (
          <>
            {tab === 'dashboard' && (
              <Dashboard
                activeSession={session}
                onNavigate={setTab}
                onResume={() => setTab('session')}
              />
            )}
            {tab === 'workouts' && <WorkoutsPage onStartSession={startSession} />}
            {tab === 'exercises' && <ExercisesPage />}
            {tab === 'session' && (
              <SessionPage
                session={session}
                onSessionChange={setSession}
                onFinished={finishSession}
                onBrowseWorkouts={() => setTab('workouts')}
              />
            )}
            {tab === 'progress' && <ProgressPage />}
            {tab === 'rehab' && (
              <RehabPage onStartProtocol={() => setTab('workouts')} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <UnitProvider>
      <AppShell />
    </UnitProvider>
  );
}
