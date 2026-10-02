import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { categoryStyle, sortCategories } from '../categories';
import { MAX_EXERCISES_PER_CATEGORY } from '../data/exercises';
import { BANDS, convert, isBandExercise, useUnit } from '../units';
import { BandOptions, CategoryChips, ErrorBanner, Loading, MixBar } from './ui';

/** How many exercises the generator may draw from each selected area. */
const PER_CATEGORY_CHOICES = Array.from(
  { length: MAX_EXERCISES_PER_CATEGORY },
  (_, index) => index + 1
);

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

/** Name a generated routine after what it actually trains. */
const generatedName = (selected) => {
  if (!selected.length) return 'Full Body Mix';
  if (selected.length === 1) return `${titleCase(selected[0])} Day`;
  return `${selected.map(titleCase).join(' + ')}`;
};

const blankItem = (exercise) => ({
  key: `${exercise.id}-${Date.now()}-${Math.random()}`,
  exercise_id: exercise.id,
  exercise_name: exercise.name,
  category: exercise.category,
  equipment: exercise.equipment,
  target_sets: 3,
  target_reps: 10,
  // Band exercises open in band mode so the target matches how they are done.
  load_type: isBandExercise(exercise.equipment) ? 'band' : 'weight',
  target_weight: '',
  target_band: '',
  hold_seconds: '',
  notes: '',
});

/** Create or edit a workout: pick exercises from the library, set targets, save. */
export default function WorkoutBuilder({ workout, onSaved, onCancel }) {
  const { unit } = useUnit();
  const [name, setName] = useState(workout?.name || '');
  const [description, setDescription] = useState(workout?.description || '');
  const [items, setItems] = useState(
    (workout?.items || []).map((item) => ({
      key: `existing-${item.id}`,
      exercise_id: item.exercise_id,
      exercise_name: item.exercise_name,
      category: item.category,
      equipment: item.equipment,
      target_sets: item.target_sets,
      target_reps: item.target_reps,
      load_type: item.target_band || isBandExercise(item.equipment) ? 'band' : 'weight',
      // Saved targets keep their own unit, so show them in the current one.
      target_weight:
        item.target_weight === null || item.target_weight === undefined
          ? ''
          : convert(item.target_weight, item.target_weight_unit || unit, unit),
      target_band: item.target_band ?? '',
      hold_seconds: item.hold_seconds ?? '',
      notes: item.notes || '',
    }))
  );

  const [library, setLibrary] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]); // empty means all
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Random generator: which areas to draw from, and how deep to go in each.
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorCategories, setGeneratorCategories] = useState([]);
  const [generatorTargets, setGeneratorTargets] = useState([]);
  const [exercisesPerCategory, setExercisesPerCategory] = useState(1);

  useEffect(() => {
    api
      .exercises()
      .then(setLibrary)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // The generator draws from the strength library, whose categories are their
  // own list - it never picks rehab work, so those categories are not offered.
  useEffect(() => {
    api.categories().then(setGeneratorCategories).catch(() => setGeneratorCategories([]));
  }, []);

  const categories = useMemo(
    () => sortCategories([...new Set(library.map((exercise) => exercise.category))]),
    [library]
  );

  /** What the workout currently in the builder trains, updated as you add to it. */
  const mix = useMemo(() => {
    const counts = {};
    for (const item of items) {
      const category = item.category || 'custom';
      counts[category] = (counts[category] || 0) + 1;
    }
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return library.filter((exercise) => {
      if (selectedCategories.length && !selectedCategories.includes(exercise.category)) {
        return false;
      }
      if (term && !exercise.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [library, search, selectedCategories]);

  const addExercise = (exercise) => {
    setItems((current) => [...current, blankItem(exercise)]);
  };

  const addCustom = () => {
    const term = search.trim();
    if (!term) return;
    setItems((current) => [
      ...current,
      {
        key: `custom-${Date.now()}`,
        exercise_id: null,
        exercise_name: term,
        category: 'custom',
        equipment: 'none',
        target_sets: 3,
        target_reps: 10,
        load_type: 'weight',
        target_weight: '',
        target_band: '',
        hold_seconds: '',
        notes: '',
      },
    ]);
    setSearch('');
  };

  const updateItem = (key, field, value) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );
  };

  const removeItem = (key) => {
    setItems((current) => current.filter((item) => item.key !== key));
  };

  const moveItem = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Give the workout a name.');
      return;
    }
    if (!items.length) {
      setError('Add at least one exercise.');
      return;
    }

    const payload = {
      name: name.trim(),
      description,
      items: items.map((item) => ({
        exercise_id: item.exercise_id ?? undefined,
        exercise_name: item.exercise_id ? undefined : item.exercise_name,
        target_sets: Number(item.target_sets) || 1,
        target_reps: Number(item.target_reps) || 1,
        target_weight:
          item.load_type === 'weight' && item.target_weight !== ''
            ? Number(item.target_weight)
            : null,
        target_weight_unit:
          item.load_type === 'weight' && item.target_weight !== '' ? unit : null,
        target_band: item.load_type === 'band' && item.target_band ? item.target_band : null,
        hold_seconds: item.hold_seconds === '' ? null : Number(item.hold_seconds),
        notes: item.notes,
      })),
    };

    setSaving(true);
    setError(null);
    try {
      const saved = workout
        ? await api.updateWorkout(workout.id, payload)
        : await api.createWorkout(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const fillFromGenerator = async () => {
    setError(null);
    try {
      const picks = await api.generate(generatorTargets, exercisesPerCategory);
      const byName = new Map(library.map((exercise) => [exercise.name, exercise]));
      // Carry each pick's reps alongside its library entry: dropping unknown
      // names first and indexing afterwards would pair reps with the wrong
      // exercise as soon as one pick is missing from the library.
      const generated = picks
        .map((pick) => ({ pick, exercise: byName.get(pick.name) }))
        .filter(({ exercise }) => exercise)
        .map(({ pick, exercise }, index) => ({
          ...blankItem(exercise),
          key: `gen-${index}-${Date.now()}`,
          target_reps: pick.target_reps ?? 10,
        }));

      if (!generated.length) {
        setError('The generator came back empty. Try selecting another area.');
        return;
      }

      setItems(generated);
      if (!name.trim()) setName(generatedName(generatorTargets));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="builder" onSubmit={handleSave}>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <BandOptions bands={BANDS} />

      <div className="field-row">
        <label className="field">
          <span>Workout name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Push Day A"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Notes</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional description"
          />
        </label>
      </div>

      <div className="builder-grid">
        <section className="builder-library">
          <div className="builder-head">
            <h3>Exercise library</h3>
            <button
              type="button"
              className="link-btn"
              onClick={() => setGeneratorOpen((open) => !open)}
              aria-expanded={generatorOpen}
            >
              {generatorOpen ? 'close' : 'surprise me'}
            </button>
          </div>

          {generatorOpen && (
            <div className="generator">
              <p className="muted small-text">
                Pick the areas to train. Leave it on full body to draw from all of them.
              </p>

              <CategoryChips
                options={generatorCategories}
                selected={generatorTargets}
                onChange={setGeneratorTargets}
                allLabel="Full body"
                label="Areas to train"
              />

              <div className="generator-controls">
                <label className="field">
                  <span>Exercises per area</span>
                  <select
                    value={exercisesPerCategory}
                    onChange={(event) => setExercisesPerCategory(Number(event.target.value))}
                  >
                    {PER_CATEGORY_CHOICES.map((choice) => (
                      <option key={choice} value={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary-btn" onClick={fillFromGenerator}>
                  {items.length ? 'Replace with random picks' : 'Generate'}
                </button>
              </div>
            </div>
          )}

          <input
            className="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search exercises"
          />

          <CategoryChips
            options={categories}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            allLabel="All"
            label="Filter the library by category"
          />

          {loading ? (
            <Loading label="Loading exercises" />
          ) : (
            <ul className="library-list">
              {filtered.map((exercise) => (
                <li key={exercise.id} style={categoryStyle(exercise.category)}>
                  <button type="button" onClick={() => addExercise(exercise)}>
                    <span className="library-name">{exercise.name}</span>
                    <span className="tag">{exercise.category}</span>
                  </button>
                </li>
              ))}
              {!filtered.length && (
                <li className="library-empty">
                  <p>No match for “{search}”.</p>
                  {search.trim() && (
                    <button type="button" className="secondary-btn" onClick={addCustom}>
                      Add “{search.trim()}” as a custom exercise
                    </button>
                  )}
                </li>
              )}
            </ul>
          )}
        </section>

        <section className="builder-items">
          <h3>
            This workout <span className="muted">({items.length})</span>
          </h3>

          <MixBar mix={mix} />

          {!items.length && <p className="muted">Pick exercises from the library to start.</p>}

          <ul className="item-list">
            {items.map((item, index) => (
              <li key={item.key} className="builder-item" style={categoryStyle(item.category)}>
                <div className="builder-item-head">
                  <strong>{item.exercise_name}</strong>
                  <div className="builder-item-actions">
                    <button
                      type="button"
                      className="mode-btn"
                      onClick={() =>
                        updateItem(
                          item.key,
                          'load_type',
                          item.load_type === 'band' ? 'weight' : 'band'
                        )
                      }
                      title="Switch between a weight target and a band target"
                    >
                      {item.load_type === 'band' ? 'band' : unit}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => moveItem(index, 1)}
                      disabled={index === items.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => removeItem(item.key)}
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="target-row">
                  <label>
                    <span>Sets</span>
                    <input
                      type="number"
                      min="1"
                      value={item.target_sets}
                      onChange={(event) => updateItem(item.key, 'target_sets', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Reps</span>
                    <input
                      type="number"
                      min="1"
                      value={item.target_reps}
                      onChange={(event) => updateItem(item.key, 'target_reps', event.target.value)}
                    />
                  </label>
                  {item.load_type === 'band' ? (
                    <label>
                      <span>Band</span>
                      <input
                        list="band-options"
                        value={item.target_band}
                        placeholder="Medium"
                        onChange={(event) =>
                          updateItem(item.key, 'target_band', event.target.value)
                        }
                      />
                    </label>
                  ) : (
                    <label>
                      <span>Weight ({unit})</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.target_weight}
                        placeholder="—"
                        onChange={(event) =>
                          updateItem(item.key, 'target_weight', event.target.value)
                        }
                      />
                    </label>
                  )}
                  <label>
                    <span>Hold (s)</span>
                    <input
                      type="number"
                      min="0"
                      value={item.hold_seconds}
                      placeholder="—"
                      onChange={(event) => updateItem(item.key, 'hold_seconds', event.target.value)}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="builder-footer">
        <button type="button" className="secondary-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-btn" disabled={saving}>
          {saving ? 'Saving…' : workout ? 'Save changes' : 'Create workout'}
        </button>
      </div>
    </form>
  );
}
