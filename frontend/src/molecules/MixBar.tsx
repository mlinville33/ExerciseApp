import type { CategoryMix } from '../types';
import { categoryStyle, sortCategories } from '../utils/categories';

/**
 * What a workout actually trains, as one stacked bar. Widths are proportional
 * to the number of exercises drawn from each category.
 */
export function MixBar({
  mix, showKey = true,
}: {
  mix?: CategoryMix | null;
  showKey?: boolean;
}) {
  const entries = sortCategories(Object.keys(mix || {})).map(
    (category) => [category, (mix || {})[category]] as const
  );
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return null;

  return (
    <div className="mix">
      <div className="mix-bar">
        {entries.map(([category, count]) => (
          <span
            key={category}
            style={{ ...categoryStyle(category), flexGrow: count }}
            title={`${category}: ${count}`}
          />
        ))}
      </div>
      {showKey && (
        <ul className="mix-key">
          {entries.map(([category, count]) => (
            <li key={category} style={categoryStyle(category)}>
              <i className="cat-dot" />
              {category} <b>{count}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
