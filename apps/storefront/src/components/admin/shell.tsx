import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AdminSession, Capability } from '@/lib/admin';
import { signOutAction } from '@/app/admin/_actions/auth';
import { ROLE_LABEL } from './format';
import { MobileNav, NavLinks, type NavGroup } from './nav';
import { EnvBadge } from './ui';

const has = (s: AdminSession, c: Capability) => s.capabilities.includes(c);

/** Navigation filtered by capability: hidden, not disabled. Groups with no visible item disappear. */
export function navFor(s: AdminSession): NavGroup[] {
  const groups: NavGroup[] = [
    { label: null, items: has(s, 'overview:read') ? [{ label: 'Overview', href: '/admin' }] : [] },
    { label: 'Sales', items: has(s, 'orders:read') ? [{ label: 'Orders', href: '/admin/orders' }] : [] },
    {
      label: 'Catalog',
      items: [
        ...(has(s, 'products:read') ? [{ label: 'Products', href: '/admin/products' }] : []),
        ...(has(s, 'inventory:read') ? [{ label: 'Inventory', href: '/admin/inventory' }] : []),
      ],
    },
    {
      label: 'System',
      items: [
        ...(has(s, 'events:read') || has(s, 'audit:read') ? [{ label: 'Event log', href: '/admin/events' }] : []),
        ...(has(s, 'staff:read') ? [{ label: 'Staff', href: '/admin/staff' }] : []),
        ...(has(s, 'overview:read') ? [{ label: 'Settings', href: '/admin/settings' }] : []),
      ],
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}

export function AdminShell({ session, env, children }: { session: AdminSession; env: { testMode: boolean; sampleData: boolean }; children: ReactNode }) {
  const groups = navFor(session);
  return (
    <div className="a-app">
      <aside className="a-sidebar" aria-label="Sidebar">
        <Link href="/admin" className="a-brand">
          Crater admin
        </Link>
        <NavLinks groups={groups} label="Main" />
      </aside>
      <div className="a-col">
        <div className="a-topbar" style={{ position: 'sticky' }}>
          <MobileNav groups={groups} />
          <span className="a-spacer" />
          {env.testMode ? <EnvBadge>Test mode</EnvBadge> : null}
          {env.sampleData ? <EnvBadge>Sample data</EnvBadge> : null}
          <details className="a-usermenu">
            <summary className="a-btn">
              {session.staff.name}
              <span className="a-muted"> ({ROLE_LABEL[session.staff.role] ?? session.staff.role})</span>
            </summary>
            <div className="a-usermenu-panel">
              <p>
                <strong>{session.staff.name}</strong>
                <br />
                <span className="a-muted">{session.staff.email}</span>
              </p>
              <form action={signOutAction}>
                <button type="submit" className="a-btn" style={{ width: '100%' }}>
                  Sign out
                </button>
              </form>
            </div>
          </details>
        </div>
        <main id="main" tabIndex={-1} className="a-main">
          {children}
        </main>
      </div>
    </div>
  );
}
