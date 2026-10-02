import type { ReactNode } from 'react';

/** One headline number with its label, as used across the dashboard. */
export function Stat({
  label, value, hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
