'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Moves focus to a status message after a redirect, so keyboard and screen-reader users land on the result. */
export function FocusOnMount({ children, role = 'status' }: { children: ReactNode; role?: 'status' | 'alert' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1} role={role} style={{ marginBottom: 12 }}>
      {children}
    </div>
  );
}
