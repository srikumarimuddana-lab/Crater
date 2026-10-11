import Link from 'next/link';

export type NavItem = { readonly label: string; readonly href: string; readonly pending: boolean };
export type NavColumn = { readonly heading: string; readonly items: readonly NavItem[] };

const linkClass =
  'focus-ring inline-flex min-h-11 flex-wrap items-center gap-x-2 text-base text-espresso hover:underline hover:decoration-1 hover:underline-offset-4';

/**
 * Link columns with a column heading each. Server-rendered; shared by the desktop mega menu and the
 * mobile Menu disclosure. Pending items link to a placeholder page and say so in plain text.
 * `idPrefix` keeps the heading ids unique when the same columns render twice on a page.
 */
export function NavColumns({
  columns,
  pendingSuffix,
  idPrefix,
  className,
}: {
  columns: readonly NavColumn[];
  pendingSuffix: string;
  idPrefix: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {columns.map((col) => {
        const id = `${idPrefix}-${col.heading.toLowerCase()}`;
        return (
          <div key={col.heading}>
            <p id={id} className="font-display text-xl text-forest">
              {col.heading}
            </p>
            <ul aria-labelledby={id} className="mt-1">
              {col.items.map((item) => (
                <li key={item.href + item.label}>
                  <Link href={item.href} className={linkClass}>
                    {item.label}
                    {item.pending ? <span className="text-small whitespace-nowrap text-walnut">{pendingSuffix}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
