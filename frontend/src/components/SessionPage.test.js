import { render, screen } from '@testing-library/react';
import SessionPage from './SessionPage';
import { UnitProvider } from '../units';
import api from '../api';

jest.mock('../api');

const REHAB_WORKOUT = {
  id: 7,
  name: 'Ankle Rehab - Phase 2: Strength and Balance',
  kind: 'rehab',
  items: [
    {
      id: 1,
      exercise_id: 42,
      exercise_name: 'Band Eversion',
      equipment: 'resistance band',
      description: 'With a band around the foot, turn the sole outward against resistance.',
      notes: 'Move only the foot, keep the knee still | Slow return every rep',
      target_sets: 3,
      target_reps: 15,
      target_weight: null,
      target_band: null,
      hold_seconds: null,
    },
  ],
};

const SESSION = {
  id: 3,
  workout_id: 7,
  workout_name: 'Ankle Rehab - Phase 2: Strength and Balance',
  started_at: '2026-09-24T10:00:00+00:00',
  completed_at: null,
  notes: '',
  logs: [],
  total_volume: 0,
  band_sets: 0,
};

function renderSession() {
  return render(
    <UnitProvider>
      <SessionPage
        session={SESSION}
        onSessionChange={() => {}}
        onFinished={() => {}}
        onBrowseWorkouts={() => {}}
      />
    </UnitProvider>
  );
}

beforeEach(() => {
  api.getWorkout.mockResolvedValue(REHAB_WORKOUT);
});

afterEach(() => {
  jest.resetAllMocks();
});

test('shows what the movement is while you are doing it', async () => {
  renderSession();

  // The whole point: you can tell what the exercise is without leaving the session.
  expect(
    await screen.findByText(
      /With a band around the foot, turn the sole outward against resistance\./i
    )
  ).toBeInTheDocument();
});

test('splits the coaching cues into separate points', async () => {
  renderSession();

  expect(await screen.findByText('Move only the foot, keep the knee still')).toBeInTheDocument();
  expect(screen.getByText('Slow return every rep')).toBeInTheDocument();
  // The raw pipe-joined string should never reach the screen.
  expect(screen.queryByText(/keep the knee still \| Slow return/)).not.toBeInTheDocument();
});
