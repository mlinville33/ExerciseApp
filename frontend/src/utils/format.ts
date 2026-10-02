/** Date, time and duration formatting for display. Presentation only. */

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Seconds as m:ss, for rest timers and session length. */
export function formatClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** A duration in whole minutes and hours, for a finished session. */
export function formatDuration(fromIso: string, toIso?: string | null): string {
  const start = new Date(fromIso).getTime();
  const end = new Date(toIso || Date.now()).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';

  const minutes = Math.round((end - start) / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
