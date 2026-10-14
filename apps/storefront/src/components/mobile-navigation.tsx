'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
/** Native disclosure remains usable without JavaScript. */
export function MobileNavigation({ children }: {
    children: ReactNode;
}) {
    const ref = useRef<HTMLDetailsElement>(null);
    const pathname = usePathname();
    useEffect(() => { if (ref.current)
        ref.current.open = false; }, [pathname]);
    return <details ref={ref} className="r-mobile-menu" onClick={event => {
            if ((event.target as Element).closest('a') && ref.current)
                ref.current.open = false;
        }} onKeyDown={event => {
            if (event.key === 'Escape' && ref.current?.open) {
                ref.current.open = false;
                ref.current.querySelector('summary')?.focus();
            }
        }}><summary aria-label="Open navigation">☰</summary>{children}</details>;
}
