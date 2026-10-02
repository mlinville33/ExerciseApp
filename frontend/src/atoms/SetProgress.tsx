/**
 * Sets done out of sets planned, drawn as segments. Across a whole workout this
 * is far faster to read than "2/3" repeated fifteen times, so the count stays
 * but shrinks to a label beside the bars.
 *
 * Very long prescriptions fall back to the plain count - forty tick marks
 * communicate nothing.
 */
const MAX_SEGMENTS = 8;

export function SetProgress({ done, target }: { done: number; target: number }) {
  const total = Number(target) || 0;
  const label = `${done} of ${total} sets done`;

  if (total > MAX_SEGMENTS) {
    return (
      <span className={`set-pill${done >= total ? ' set-pill-done' : ''}`} aria-label={label}>
        {done}/{total}
      </span>
    );
  }

  return (
    <span className="set-progress" role="img" aria-label={label}>
      <span className="set-progress-bars">
        {Array.from({ length: total }, (_, index) => (
          <i key={index} className={`seg${index < done ? ' seg-done' : ''}`} />
        ))}
      </span>
      <span className="set-progress-count">
        {done}/{total}
      </span>
    </span>
  );
}
