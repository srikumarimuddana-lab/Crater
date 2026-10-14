import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AdminSession, Capability } from '@/lib/admin';
import { signOutAction } from '@/app/admin/_actions/auth';
import { ROLE_LABEL } from './format';
import { MobileNav, NavLinks, type NavGroup } from './nav';
import { EnvBadge } from './ui';
import type { Content } from '@/lib/content/cms/schema';

const has = (s: AdminSession, c: Capability) => s.capabilities.includes(c);

/** Navigation filtered by capability: hidden, not disabled. Groups with no visible item disappear. */
export function navFor(s: AdminSession): NavGroup[] {
  const groups: NavGroup[] = [
    { label: null, items: has(s, 'overview:read') ? [{ label: 'Overview', href: '/admin' }] : [] },
    { label: 'Sales', items: [
      ...(has(s, 'orders:read') ? [{ label: 'Orders', href: '/admin/orders' }] : []),
      ...(has(s, 'orders:fulfil') ? [{ label: 'Shipments', href: '/admin/shipments' }] : []),
      ...(has(s, 'products:write') ? [{ label: 'Returns', href: '/admin/returns' }] : []),
      ...(has(s, 'payments:read') ? [{ label: 'Payments', href: '/admin/payments' }] : []),
      ...(has(s, 'finance:read') ? [{ label: 'Ledger & finance', href: '/admin/finance' }] : []),
      ...(has(s, 'analytics:read') ? [{ label: 'Analytics', href: '/admin/analytics' }] : []),
    ] },
    {
      label: 'Catalog',
      items: [
        ...(has(s, 'products:read') ? [{ label: 'Products', href: '/admin/products' }] : []),
        ...(has(s, 'inventory:read') ? [{ label: 'Inventory', href: '/admin/inventory' }] : []),
        ...(has(s, 'products:write') ? [{ label: 'Collections', href: '/admin/collections' }, { label: 'Shipping & discounts', href: '/admin/settings/shipping' }] : []),
        ...(has(s, 'products:write') ? [{ label: 'Suppliers', href: '/admin/suppliers' }] : []),
        ...(has(s, 'inventory:adjust') ? [{ label: 'Purchasing', href: '/admin/purchasing' }] : []),
      ],
    },
    { label: 'Customers', items: [
      ...(has(s, 'customers:read') ? [{ label: 'CRM', href: '/admin/customers' }, { label: 'Inbox', href: '/admin/inbox' }] : []),
      ...(has(s, 'communications:manage') ? [{ label: 'Campaigns', href: '/admin/campaigns' }, { label: 'Message templates', href: '/admin/templates' }] : []),
    ] },
    { label: 'Storefront', items: [
      ...(has(s, 'content:read') ? [{ label: 'Pages & content', href: '/admin/content' }] : []),
      ...(has(s, 'products:write') ? [{ label: 'Media library', href: '/admin/media' }] : []),
    ] },
    {
      label: 'System',
      items: [
        ...(has(s, 'events:read') || has(s, 'audit:read') ? [{ label: 'Event log', href: '/admin/events' }] : []),
        ...(has(s, 'staff:read') ? [{ label: 'Staff', href: '/admin/staff' }] : []),
        ...(has(s, 'overview:read') ? [{ label: 'Settings', href: '/admin/settings' }] : []),
        ...(s.staff.role === 'OWNER' && has(s, 'communications:manage') ? [{ label: 'Integrations', href: '/admin/integrations' }] : []),
      ],
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}

export function AdminShell({ session, env, branding, children }: { branding: Content; session: AdminSession; env: { testMode: boolean; sampleData: boolean }; children: ReactNode }) {
  const groups = navFor(session);
  return (
    <div className="a-app">
      <aside className="a-sidebar" aria-label="Sidebar">
        <Link href="/admin" className="a-brand">
          {branding.logo ? <img src={branding.logo} alt={`${branding.brand} ${branding.brandSecond}`} width={120} height={60} /> : <>{branding.brand}<span style={{ display: 'block', fontFamily: 'Arial', fontSize: 10, letterSpacing: 4, marginTop: 8 }}>{branding.brandSecond} / ADMIN</span></>}
        </Link>
        <NavLinks groups={groups} label="Main" />
      </aside>
      <div className="a-col">
        <div role="banner" className="a-topbar" style={{ position: 'sticky' }}>
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
