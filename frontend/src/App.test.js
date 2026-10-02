import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import api from './api';

jest.mock('./api');

beforeEach(() => {
  api.activeSession.mockResolvedValue(null);
});

afterEach(() => {
  jest.resetAllMocks();
});

test('renders the main navigation', async () => {
  render(<App />);

  expect(screen.getByText(/ExerciseApp/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /workouts/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /rehab/i })).toBeInTheDocument();

  // The app checks the on-device database for an unfinished session on mount.
  await waitFor(() => expect(api.activeSession).toHaveBeenCalled());
});

test('surfaces a message when the on-device database will not open', async () => {
  // There is no server to be unreachable any more; the equivalent failure is
  // SQLite refusing to open, which would otherwise leave a blank screen.
  api.activeSession.mockRejectedValue(new Error('database is locked'));

  render(<App />);

  expect(await screen.findByRole('alert')).toHaveTextContent(/training database on this device/i);
});
