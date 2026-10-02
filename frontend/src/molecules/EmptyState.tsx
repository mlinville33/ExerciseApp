import type { ReactNode } from 'react';

/** What a list shows before it has anything in it, with a way forward. */
export function EmptyState({
  title, message, action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}
