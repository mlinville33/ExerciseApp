import type { DailyVolume } from '../types';

/** Dependency-free bar chart for a series of daily points. */
export function BarChart({
  data, valueKey = 'volume', label = 'Volume',
}: {
  data: DailyVolume[];
  valueKey?: 'volume' | 'sets' | 'sessions';
  label?: string;
}) {
  const max = Math.max(...data.map((point) => point[valueKey]), 1);

  return (
    <div className="chart" role="img" aria-label={`${label} over the last ${data.length} days`}>
      {data.map((point) => {
        const value = point[valueKey];
        const height = value > 0 ? Math.max((value / max) * 100, 4) : 0;
        return (
          <div className="chart-col" key={point.date} title={`${point.date}: ${value}`}>
            <div className="chart-bar-track">
              <div
                className={`chart-bar${value > 0 ? '' : ' chart-bar-empty'}`}
                style={{ height: `${height}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
