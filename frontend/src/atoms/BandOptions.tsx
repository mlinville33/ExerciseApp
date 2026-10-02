import type { Band } from '../types';

/**
 * Suggestions for band inputs. A datalist rather than a select so a
 * brand-specific label ("Purple 15kg") can still be typed in.
 */
export function BandOptions({ bands }: { bands: Band[] }) {
  return (
    <datalist id="band-options">
      {bands.map((band) => (
        <option key={band.level} value={band.name}>
          {band.common_color ? `usually ${band.common_color}` : ''}
        </option>
      ))}
    </datalist>
  );
}
