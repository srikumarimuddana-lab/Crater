'use client';

import { useCallback, useEffect, useState } from 'react';
import { useHydrated } from './use-hydrated';

const buttonClass =
  'focus-ring inline-flex size-11 items-center justify-center rounded-xs border border-espresso/40 text-xl leading-none text-espresso hover:bg-parchment aria-disabled:cursor-not-allowed aria-disabled:border-espresso/15 aria-disabled:text-walnut/50 aria-disabled:hover:bg-transparent';

/**
 * Previous and next buttons for a horizontal scroll-snap list. The list is a plain scrollable list
 * without JavaScript, so the buttons appear only after hydration and only when the list overflows.
 * They page by the visible width, jump instead of animating under reduced motion, and use
 * aria-disabled at either end so keyboard focus is not dropped.
 */
export function CarouselControls({ targetId, previousLabel, nextLabel }: { targetId: string; previousLabel: string; nextLabel: string }) {
  const hydrated = useHydrated();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const update = () => {
      setOverflows(el.scrollWidth > el.clientWidth + 1);
      setAtStart(el.scrollLeft <= 1);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [targetId, hydrated]);

  const page = useCallback(
    (direction: 1 | -1) => {
      const el = document.getElementById(targetId);
      if (!el) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: reduced ? 'auto' : 'smooth' });
    },
    [targetId],
  );

  if (!hydrated || !overflows) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-controls={targetId}
        aria-label={previousLabel}
        aria-disabled={atStart || undefined}
        onClick={() => !atStart && page(-1)}
        className={buttonClass}
      >
        <span aria-hidden="true">←</span>
      </button>
      <button
        type="button"
        aria-controls={targetId}
        aria-label={nextLabel}
        aria-disabled={atEnd || undefined}
        onClick={() => !atEnd && page(1)}
        className={buttonClass}
      >
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
