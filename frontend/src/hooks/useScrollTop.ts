import { useEffect, type RefObject } from 'react';

/**
 * Jump back to the top whenever `key` changes.
 *
 * The app has no router, so navigating is a state change inside a page that is
 * already scrolled - picking a joint from the rehab list, moving to the next
 * exercise, switching tabs. Without this you land halfway down the new screen,
 * which reads as a broken page rather than as a preserved scroll position.
 *
 * `behavior: 'auto'` rather than smooth: this is a destination change, not a
 * movement within one, and animating it just delays what you asked for.
 */
export function useScrollTop(key: unknown) {
  useEffect(() => {
    // `scrollTo` on a WebView can land before layout settles after a state
    // change, so the reset is queued for the next frame.
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [key]);
}

/**
 * The same, for a scrollable element rather than the page - a modal body, or
 * any panel with its own overflow.
 */
export function useScrollTopOf(ref: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (ref.current) ref.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [ref, key]);
}
