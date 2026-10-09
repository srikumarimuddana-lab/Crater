'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

const subscribe = () => () => {};
/** False during server render and hydration, true afterwards. */
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

const triggerClass =
  'focus-ring inline-flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 text-[0.9375rem] font-semibold text-espresso underline-offset-[0.45em] hover:underline hover:decoration-1 [&::-webkit-details-marker]:hidden';
const panelClass = 'absolute inset-x-0 top-full z-30 border-b border-espresso/15 bg-ivory shadow-sm';

/**
 * Desktop "Shop" mega menu. Before hydration it is a native <details> (opens without JavaScript);
 * afterwards a disclosure button with aria-expanded. Escape closes it and returns focus to the button;
 * so do an outside click, tabbing out, and any navigation. The panel is positioned against the header.
 */
export function ShopMenu({ label, panelLabel, children }: { label: string; panelLabel: string; children: ReactNode }) {
  const hydrated = useHydrated();
  // The menu is open for exactly one location: any navigation (including Back and Forward) closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  const here = `${pathname}?${search}`;
  const open = openAt === here;
  const setOpen = useCallback((v: boolean) => setOpenAt(v ? here : null), [here]);

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) buttonRef.current?.focus();
    },
    [setOpen],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, setOpen]);

  if (!hydrated) {
    return (
      <details className="hidden lg:block">
        <summary className={triggerClass}>{label}</summary>
        <nav aria-label={panelLabel} className={panelClass}>
          {children}
        </nav>
      </details>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="hidden lg:block"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close(true);
        }
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (open && next && wrapRef.current && !wrapRef.current.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={triggerClass}
      >
        {label}
        <svg aria-hidden="true" viewBox="0 0 10 6" className={`h-1.5 w-2.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <nav
        id={panelId}
        aria-label={panelLabel}
        hidden={!open}
        className={panelClass}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        {children}
      </nav>
    </div>
  );
}
