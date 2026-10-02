/** A number field you can drive with your thumb instead of a keyboard. */
export function Stepper({
  label, value, onChange, step = 1, min = 0, max, wide,
}: {
  label: string;
  value: number | string;
  onChange: (next: string) => void;
  step?: number;
  min?: number;
  max?: number;
  wide?: boolean;
}) {
  const nudge = (delta: number) => {
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
