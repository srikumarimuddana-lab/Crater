'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

export type NavGroup = { label: string | null; items: { label: string; href: string }[] };

function isCurrent(path: string, href: string): boolean {
  return href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`);
}

export function NavLinks({ groups, label }: { groups: NavGroup[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label}>
      {groups.map((g, i) => (
        <div className="a-navgroup" key={g.label ?? `g${i}`}>
          {g.label ? <h2>{g.label}</h2> : null}
          <ul className="a-navlist">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} className="a-navlink" aria-current={isCurrent(path, it.href) ? 'page' : undefined}>
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Disclosure for the sidebar below 1024px. Closes on navigation and on Escape. */
export function MobileNav({ groups }: { groups: NavGroup[] }) {
  // Open for one pathname only: navigating elsewhere closes the menu without an effect.
  const path = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (next: boolean) => setOpenAt(next ? path : null);
  const panel = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <>
      <button type="button" className="a-btn a-menu-btn" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        Menu
      </button>
      {open ? (
        <div id={panel} className="a-mobile-nav" style={{ position: 'absolute', left: 0, right: 0, top: '100%' }}>
          <NavLinks groups={groups} label="Main" />
        </div>
      ) : null}
    </>
  );
}
