/** Which measure a set beat, for the badge's tooltip. */
export type PrType = 'weight' | '1rm' | 'reps' | 'band';

const PR_LABELS: Record<PrType, string> = {
  weight: 'Heaviest ever',
  '1rm': 'Best estimated 1RM',
  reps: 'Most reps ever',
  band: 'Strongest band yet',
};

export function PrBadge({ type }: { type: PrType }) {
  return (
    <span className="pr-badge" title={PR_LABELS[type] || 'Personal best'}>
      ★ PR
    </span>
  );
}
