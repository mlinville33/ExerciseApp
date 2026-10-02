import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { UNITS, convert } from '../data/units';
import type { WeightUnit } from '../types';

/**
 * The unit everything is displayed and entered in.
 *
 * Only the preference lives here. The conversion maths belongs to the data
 * layer (data/units.ts), because history is stored in the unit it was entered
 * in and the same arithmetic has to hold whether it runs in a component or in
 * a SQL aggregate.
 */

const STORAGE_KEY = 'exerciseapp.unit';

interface UnitContextValue {
  unit: WeightUnit;
  setUnit: (next: WeightUnit) => void;
  /** Render a weight that was logged in `loggedUnit` using the current preference. */
  formatWeight: (value: number | null | undefined, loggedUnit?: string | null) => string | null;
}

const UnitContext = createContext<UnitContextValue | null>(null);

export function UnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && UNITS.includes(stored as WeightUnit)) return stored as WeightUnit;
    } catch {
      /* storage can be unavailable; fall through to the default */
    }
    return 'lb';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, unit);
    } catch {
      /* the preference just will not persist */
    }
  }, [unit]);

  const setUnit = useCallback((next: WeightUnit) => {
    if (UNITS.includes(next)) setUnitState(next);
  }, []);

  const formatWeight = useCallback(
    (value: number | null | undefined, loggedUnit?: string | null) => {
      if (value === null || value === undefined) return null;
      return `${convert(value, loggedUnit || unit, unit)} ${unit}`;
    },
    [unit]
  );

  const value = useMemo(
    () => ({ unit, setUnit, formatWeight }),
    [unit, setUnit, formatWeight]
  );

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnit(): UnitContextValue {
  const context = useContext(UnitContext);
  if (!context) throw new Error('useUnit must be used inside a UnitProvider');
  return context;
}
