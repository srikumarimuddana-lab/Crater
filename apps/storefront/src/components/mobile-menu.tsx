'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

const summaryClass =
  'focus-ring inline-flex min-h-11 cursor-pointer list-none items-center px-2 text-[0.9375rem] font-semibold text-espresso underline-offset-[0.45em] hover:underline hover:decoration-1 [&::-webkit-details-marker]:hidden';

/**
 * The small-screen "Menu" disclosure. A native <details>, so it opens without JavaScript, and a full
 * page load starts it closed. Once hydrated, client-side navigations keep this header mounted, so it is
 * closed on a link click and whenever the path or query changes (including Back and Forward).
 */
export function MobileMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname, search]);

  return (
    <details ref={ref} className="relative lg:hidden">
      <summary className={summaryClass}>Menu</summary>
      <nav
        aria-label="Menu"
        className="absolute left-0 z-20 mt-2 max-h-[calc(100dvh-8rem)] w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto border border-espresso/15 bg-ivory p-2 shadow-sm"
        onClick={(e) => {
          // Same-page links (a #fragment or the current query) change neither path nor search.
          if ((e.target as HTMLElement).closest('a') && ref.current) ref.current.open = false;
        }}
      >
        {children}
      </nav>
    </details>
  );
}
