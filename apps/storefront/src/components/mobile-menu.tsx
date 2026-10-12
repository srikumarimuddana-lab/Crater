'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The small-screen "Menu": a native <details>, so it opens without JavaScript. When open, its panel slides in
 * from the right over a dimmed page (Nuda) and the <summary> moves to the top-right corner as the close
 * control, so the panel can always be closed, with or without script. Once hydrated, Escape and the backdrop
 * close it too, and client-side navigations close it on any path or query change.
 */
export function MobileMenu({
  children,
  tone = 'light',
  label,
  closeLabel,
}: {
  children: ReactNode;
  tone?: 'light' | 'green';
  label: string;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname, search]);

  const close = (returnFocus = false) => {
    const el = ref.current;
    if (!el) return;
    el.open = false;
    if (returnFocus) el.querySelector('summary')?.focus();
  };

  const summaryClass =
    'focus-ring inline-flex min-h-11 cursor-pointer list-none items-center px-2 text-[0.9375rem] font-semibold underline-offset-[0.45em] hover:underline hover:decoration-1 [&::-webkit-details-marker]:hidden ' +
    (tone === 'green' ? 'text-white' : 'text-ink');

  return (
    <details
      ref={ref}
      className="mnav lg:hidden"
      onToggle={(e) => setOpen(e.currentTarget.open)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && ref.current?.open) {
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <summary className={summaryClass} aria-label={open ? closeLabel : undefined}>
        {label}
      </summary>
      <div className="mnav-backdrop" aria-hidden="true" onClick={() => close()} />
      <nav
        aria-label={label}
        className="mnav-panel"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) close();
        }}
      >
        <div className="flex min-h-16 items-center border-b border-ink/10 pl-5 pr-16">
          <span className="font-display text-lg font-bold text-deep">{label}</span>
        </div>
        <div className="px-5 py-5">{children}</div>
      </nav>
    </details>
  );
}
