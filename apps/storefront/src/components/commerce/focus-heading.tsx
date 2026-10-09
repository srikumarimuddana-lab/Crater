'use client';

import { useEffect, useRef } from 'react';

/** A heading that takes focus once on load (confirmation page). */
export function FocusHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={`${className ?? ''} focus:outline-none`}>
      {children}
    </h1>
  );
}
