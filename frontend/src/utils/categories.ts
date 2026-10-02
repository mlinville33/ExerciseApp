import type { CSSProperties } from 'react';

/**
 * Every category carries a hue. Colour is used as an accent only - a rail, a
 * dot, a chip border - never as a full background, so six hues can sit on one
 * screen without it turning into a paint chart.
 *
 * Hues are spaced around the wheel but pinned to the same saturation and
 * lightness band, which is what keeps them reading as one family against the
 * navy rather than as six unrelated colours.
 */
const CATEGORY_HUES: Record<string, number> = {
  chest: 6, // coral
  back: 222, // indigo
  shoulders: 272, // violet
  legs: 36, // amber
  core: 190, // cyan
  arms: 152, // emerald
  rehab: 210, // slate, deliberately the quietest of the set
  custom: 300, // magenta
};

const SATURATION = 72;
const LIGHTNESS = 64;

/** Rehab is support work, not a training area, so it stays desaturated. */
const MUTED_CATEGORIES = new Set<string>(['rehab']);

/**
 * An unknown category still gets a stable colour rather than a grey default,
 * so custom exercises are distinguishable from each other at a glance.
 */
function hueFor(category: string): number {
  const known = CATEGORY_HUES[category];
  if (known !== undefined) return known;

  let hash = 0;
  for (let index = 0; index < (category || '').length; index += 1) {
    hash = (hash * 31 + category.charCodeAt(index)) % 360;
  }
  return hash;
}

/**
 * Inline custom properties for a category. Spread onto a `style` prop and the
 * element's CSS can then reference var(--cat) without a class per category.
 */
export function categoryStyle(category: string): CSSProperties {
  const hue = hueFor(category);
  const saturation = MUTED_CATEGORIES.has(category) ? 18 : SATURATION;

  // Custom properties are not part of CSSProperties, so the cast is what lets
  // a category's hue ride along on an ordinary style prop.
  return {
    '--cat': `hsl(${hue} ${saturation}% ${LIGHTNESS}%)`,
    '--cat-soft': `hsl(${hue} ${saturation}% ${LIGHTNESS}% / 0.16)`,
    '--cat-line': `hsl(${hue} ${saturation}% ${LIGHTNESS}% / 0.5)`,
  } as CSSProperties;
}

/** Order categories the way a body is trained: push, pull, then the rest. */
const CATEGORY_ORDER: string[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'rehab', 'custom'];

export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const left = CATEGORY_ORDER.indexOf(a);
    const right = CATEGORY_ORDER.indexOf(b);
    if (left === -1 && right === -1) return a.localeCompare(b);
    if (left === -1) return 1;
    if (right === -1) return -1;
    return left - right;
  });
}
