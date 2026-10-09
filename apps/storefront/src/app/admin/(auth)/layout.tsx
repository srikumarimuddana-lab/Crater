import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="a-authwrap">
      <div className="a-authcard">{children}</div>
    </main>
  );
}
