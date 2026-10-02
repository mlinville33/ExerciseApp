/** A plain "still working" line. Used while any page loads its data. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="loading">{label}…</div>;
}
