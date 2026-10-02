import type { Exercise, GeneratedPick } from '../types';
import { all } from './db';
import { strengthLibrary } from './seed';

/** Ports routers/exercises.py and the category/generate endpoints. */

/**
 * The most exercises the generator will draw from a single category. Every
 * category holds fifteen, so this is a sanity bound on the input rather than a
 * limit of the library.
 */
export const MAX_EXERCISES_PER_CATEGORY = 8;

export interface ExerciseFilters {
  category?: string;
  kind?: string;
  joint?: string;
  search?: string;
}

export async function listExercises(
  { category, kind, joint, search }: ExerciseFilters = {}
): Promise<Exercise[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (kind) {
    conditions.push('kind = ?');
    params.push(kind);
  }
  if (joint) {
    // joints is a comma separated list, so match on a padded copy.
    conditions.push("(',' || joints || ',') LIKE ?");
    params.push(`%,${joint},%`);
  }
  if (search) {
    conditions.push('LOWER(name) LIKE ?');
    params.push(`%${search.toLowerCase()}%`);
  }

  return all<Exercise>(
    `SELECT id, name, category, equipment, description, kind, joints, phases
       FROM exercises
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY category, name;`,
    params
  );
}

/** The strength library's categories, or the exercise names within one. */
export function categories(category?: string): string[] {
  if (category) {
    return (strengthLibrary[category] || []).map((entry) => entry.name);
  }
  return Object.keys(strengthLibrary);
}

function pickRandom<Item>(items: Item[], count: number): Item[] {
  // Fisher-Yates over a copy, then take the first `count`: sampling without
  // replacement, so one exercise cannot be picked twice for the same category.
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[swapIndex]] = [pool[swapIndex], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/**
 * A random routine as structured data the builder can turn into a workout.
 * Ports selector/randomizer.py's randomizer_detailed.
 */
export function generate(
  categoryFilter: string[] | null | undefined,
  perCategory = 1
): GeneratedPick[] {
  const picks: GeneratedPick[] = [];

  for (const [category, items] of Object.entries(strengthLibrary)) {
    if (categoryFilter && categoryFilter.length && !categoryFilter.includes(category)) continue;

    for (const entry of pickRandom(items, perCategory)) {
      picks.push({
        name: entry.name,
        category,
        equipment: entry.equipment || 'none',
        target_sets: 3,
        target_reps: (Math.floor(Math.random() * 3) + 1) * 5,
      });
    }
  }

  return picks;
}
