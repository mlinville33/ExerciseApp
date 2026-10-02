import { useEffect, useState } from 'react';
import { formatClock } from '../utils/format';

export interface Rest {
  /** Wall-clock milliseconds, so the countdown survives the app backgrounding. */
  endsAt: number;
  duration: number;
}

/** Counts the rest between sets down, with the bar draining as it goes. */
export function RestTimer({
  rest, stepSeconds, onExtend, onSkip,
}: {
  rest: Rest;
  stepSeconds: number;
  onExtend: () => void;
  onSkip: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
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
              +{stepSeconds}s
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
