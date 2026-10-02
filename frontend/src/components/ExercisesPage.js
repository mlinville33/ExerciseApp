import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { categoryStyle, sortCategories } from '../categories';
import { CategoryChips, EmptyState, ErrorBanner, Loading } from './ui';

const KINDS = [
  { id: 'all', label: 'Everything' },
  { id: 'strength', label: 'Strength' },
  { id: 'rehab', label: 'Rehab' },
];

/** Browse the exercise library: what is in it, what it hits, and how it is done. */
export default function ExercisesPage() {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]); // empty means every category
  const [kind, setKind] = useState('all');
  const [openId, setOpenId] = useState(null);

  // The library is small and does not change while the app is open, so it is
  // fetched once and every filter below runs in the browser.
  useEffect(() => {
    api
      .exercises()
      .then(setLibrary)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const categoryOptions = useMemo(
    () => sortCategories([...new Set(library.map((exercise) => exercise.category))]),
    [library]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return library.filter((exercise) => {
      if (kind !== 'all' && exercise.kind !== kind) return false;
      if (categories.length && !categories.includes(exercise.category)) return false;
      if (term && !exercise.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [library, search, categories, kind]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const exercise of filtered) {
      if (!groups.has(exercise.category)) groups.set(exercise.category, []);
      groups.get(exercise.category).push(exercise);
    }
    return sortCategories([...groups.keys()]).map((category) => [category, groups.get(category)]);
  }, [filtered]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Exercises</h1>
          {library.length > 0 && (
            <p className="session-meta">
              <span>{library.length} movements</span>
              <span>{categoryOptions.length} areas</span>
            </p>
          )}
        </div>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <section className="panel filter-panel">
        <input
          className="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search exercises"
          aria-label="Search exercises"
        />

        <CategoryChips
          options={categoryOptions}
          selected={categories}
          onChange={setCategories}
          allLabel="All areas"
          label="Filter by category"
        />

        <div className="segmented" role="group" aria-label="Exercise type">
          {KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={kind === option.id ? 'active' : ''}
              onClick={() => setKind(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="muted small-text">
          {filtered.length} of {library.length} exercises
        </p>
      </section>

      {loading ? (
        <Loading label="Loading exercises" />
      ) : !filtered.length ? (
        <EmptyState
          title="Nothing matches"
          message="Try a different area, or clear the search box."
          action={
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setSearch('');
                setCategories([]);
                setKind('all');
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        grouped.map(([category, exercises]) => (
          <section className="panel cat-panel" key={category} style={categoryStyle(category)}>
            <div className="phase-head">
              <h2 className="exercise-category">
                <i className="cat-dot" />
                {category}
              </h2>
              <span className="muted small-text">{exercises.length} exercises</span>
            </div>

            <ul className="tracked-list cat-list">
              {exercises.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === exercise.id ? null : exercise.id)}
                    aria-expanded={openId === exercise.id}
                  >
                    <span>{exercise.name}</span>
                    <span className="tag">{exercise.equipment}</span>
                  </button>

                  {openId === exercise.id && (
                    <div className="detail">
                      <p className="muted">
                        {exercise.description || 'No description recorded for this one yet.'}
                      </p>
                      {exercise.joints && (
                        <p className="small-text muted">
                          Used in rehab for: {exercise.joints.split(',').join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
