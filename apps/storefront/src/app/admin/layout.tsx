import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './admin.css';

// Every admin page reads the session cookie, so it is dynamic and private. Never indexed.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Crater admin', template: '%s | Crater admin' },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <div data-admin>{children}</div>;
}
