/**
 * A wrapping row of category pills. `selected` is a list of category names and
 * an empty list means "everything", so the same control reads as a filter in
 * the library and as a target picker for the random generator.
 */
export function CategoryChips({
  options, selected, onChange, allLabel = 'All', label = 'Categories',
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
  label?: string;
}) {
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    );

  return (
    <div className="chips" role="group" aria-label={label}>
      <button
        type="button"
        className={`chip${selected.length ? '' : ' active'}`}
        onClick={() => onChange([])}
      >
        {allLabel}
      </button>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`chip${selected.includes(option) ? ' active' : ''}`}
          aria-pressed={selected.includes(option)}
          onClick={() => toggle(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
