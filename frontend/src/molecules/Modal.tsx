import { useEffect, useRef, type ReactNode } from 'react';
import { useScrollTopOf } from '../hooks/useScrollTop';

export function Modal({
  title, onClose, children, wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The backdrop is its own scroll container, and it opens over a page that may
  // be scrolled well down. Start it at the top so the title is the first thing
  // you see.
  useScrollTopOf(backdrop, true);

  // While a modal is up, scrolling belongs to it. Locking the page underneath
  // stops the background drifting when the modal is scrolled to its end, which
  // on a touch screen is otherwise constant.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="modal-backdrop" ref={backdrop} onClick={onClose}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
