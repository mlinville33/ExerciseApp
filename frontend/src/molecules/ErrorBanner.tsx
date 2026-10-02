/** A dismissible failure message. Rendered nothing when there is no error. */
export function ErrorBanner({
  error, onDismiss,
}: {
  error?: string | null;
  onDismiss?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="error-banner" role="alert">
      <span>{error}</span>
      {onDismiss && (
        <button type="button" className="link-btn" onClick={onDismiss}>
          dismiss
        </button>
      )}
    </div>
  );
}
