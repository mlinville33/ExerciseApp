import type { Band, WeightUnit } from '../types';

/**
 * Weight and band handling, ported from the server's units.py.
 *
 * Weight is stored exactly as it was entered, alongside the unit it was entered
 * in, so switching the display preference never rewrites history. Anything that
 * adds weights together converts to kilograms first.
 */

export const KG_PER_LB = 0.45359237;
export const UNITS: readonly WeightUnit[] = ['kg', 'lb'];
export const DEFAULT_UNIT: WeightUnit = 'lb';

/** Band strengths are ordered so progression can be tracked the way weight is. */
export const BANDS: Band[] = [
  { level: 1, name: 'Extra Light', common_color: 'yellow' },
  { level: 2, name: 'Light', common_color: 'red' },
  { level: 3, name: 'Medium', common_color: 'green' },
  { level: 4, name: 'Heavy', common_color: 'blue' },
  { level: 5, name: 'Extra Heavy', common_color: 'black' },
];

const BAND_LEVELS = new Map(BANDS.map((band) => [band.name.toLowerCase(), band.level]));

export function normaliseUnit(unit: string | null | undefined): WeightUnit {
  return UNITS.includes(unit as WeightUnit) ? (unit as WeightUnit) : DEFAULT_UNIT;
}

/**
 * Rows written before units were recorded have a null unit. They are read as
 * DEFAULT_UNIT, matching what the server does, so the same row never means two
 * different weights.
 */
export function toKg(weight: number | null | undefined, unit: string | null | undefined) {
  if (weight === null || weight === undefined) return null;
  return normaliseUnit(unit) === 'lb' ? weight * KG_PER_LB : weight;
}

export function fromKg(kilograms: number | null | undefined, unit: WeightUnit) {
  if (kilograms === null || kilograms === undefined) return null;
  const value = normaliseUnit(unit) === 'lb' ? kilograms / KG_PER_LB : kilograms;
  return Math.round(value * 10) / 10;
}

export function convert(
  weight: number | null | undefined,
  fromUnit: string | null | undefined,
  toUnit: WeightUnit
) {
  return fromKg(toKg(weight, fromUnit), toUnit);
}

/** Map a band label onto the ladder, or null for a custom label. */
export function bandLevel(name: string | null | undefined): number | null {
  if (!name) return null;
  return BAND_LEVELS.get(String(name).trim().toLowerCase()) ?? null;
}

/**
 * An exercise is treated as band work when its equipment says so, which makes
 * the rehab protocols log correctly without the user changing the mode by hand.
 */
export function isBandExercise(equipment: string | null | undefined) {
  return Boolean(equipment) && String(equipment).toLowerCase().includes('band');
}

/**
 * reps x weight for one logged set, in kilograms, as a SQL expression.
 *
 * The unit factor is applied in SQL rather than in JavaScript so that summing
 * volume stays a single query instead of pulling every set into memory.
 *
 * `alias` is the table alias the set_logs columns are behind, e.g. 'l' inside a
 * join. It is a column prefix, never user input.
 */
export function volumeKgSql(alias = '') {
  const column = alias ? `${alias}.` : '';
  return `COALESCE(${column}reps, 0) * COALESCE(${column}weight, 0.0) *
    CASE WHEN COALESCE(${column}weight_unit, '${DEFAULT_UNIT}') = 'lb'
         THEN ${KG_PER_LB} ELSE 1.0 END`;
}

/** Epley estimate, close enough for tracking trends under about ten reps. */
export function estimateOneRepMax(
  weightKg: number | null | undefined,
  reps: number | null | undefined
) {
  if (!weightKg || !reps) return null;
  return weightKg * (1 + reps / 30);
}

export function utcNowIso() {
  return new Date().toISOString();
}
