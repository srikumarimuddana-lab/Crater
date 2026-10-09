import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type Shape } from './icons';
import { fmtDate } from './format';

export type Tone = 'neutral' | 'success' | 'warning' | 'critical' | 'info';

/** Status = shape + word + tint. Never colour alone. */
export function StatusBadge({ tone = 'neutral', shape, label }: { tone?: Tone; shape: Shape; label: string }) {
  return (
    <span className={`a-badge${tone === 'neutral' ? '' : ` is-${tone}`}`}>
      <Icon shape={shape} />
      {label}
    </span>
  );
}

export function EnvBadge({ children }: { children: ReactNode }) {
  return <span className="a-badge is-env">{children}</span>;
}

export type Crumb = { label: string; href?: string };

export function PageHeader({ title, badges, breadcrumb, actions }: { title: string; badges?: ReactNode; breadcrumb?: Crumb[]; actions?: ReactNode }) {
  return (
    <header className="a-pageheader">
      <div>
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb" className="a-crumbs">
            <ol>
              {breadcrumb.map((c, i) => (
                <li key={c.label} aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>
                  {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <div className="a-titlerow">
          <h1 className="a-title">{title}</h1>
          {badges}
        </div>
      </div>
      {actions ? <div className="a-row a-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, children, id, headingLevel = 2 }: { title?: string; children: ReactNode; id?: string; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className="a-card" id={id} aria-labelledby={title ? `${id ?? title.replace(/\W+/g, '-')}-h` : undefined}>
      {title ? <H id={`${id ?? title.replace(/\W+/g, '-')}-h`}>{title}</H> : null}
      {children}
    </section>
  );
}

export function Notice({ tone = 'info', children, role, title }: { tone?: Exclude<Tone, 'neutral'>; children: ReactNode; role?: 'status' | 'alert'; title?: string }) {
  const shape: Shape = tone === 'critical' ? 'octagon-x' : tone === 'warning' ? 'triangle' : tone === 'success' ? 'check-circle' : 'info';
  return (
    <div className={`a-notice is-${tone}`} role={role}>
      <Icon shape={shape} size={16} />
      <div>
        {title ? <strong>{title}</strong> : null}
        {title ? ' ' : null}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="a-empty">
      <p>{children}</p>
      {action ? <p style={{ marginTop: 12 }}>{action}</p> : null}
    </div>
  );
}

export function Tabs({ label, items }: { label: string; items: { label: string; href: string; current: boolean }[] }) {
  return (
    <nav aria-label={label}>
      <ul className="a-tabs">
        {items.map((i) => (
          <li key={i.label}>
            <Link href={i.href} className="a-tab" aria-current={i.current ? 'page' : undefined}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Pagination({ basePath, params, endCursor, hasNext, isFirst }: { basePath: string; params: Record<string, string | undefined>; endCursor: string | null; hasNext: boolean; isFirst: boolean }) {
  const href = (after: string | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (after) q.set('after', after);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  if (isFirst && !hasNext) return null;
  return (
    <nav aria-label="Pagination" className="a-pager">
      {isFirst ? <span /> : <Link className="a-btn" href={href(null)}>First page</Link>}
      {hasNext && endCursor ? <Link className="a-btn" href={href(endCursor)} rel="next">Next page</Link> : <span className="a-muted">End of list</span>}
    </nav>
  );
}

/** Sortable column header: a link in the th (URL state, no JS), `aria-sort` on the th. */
export function SortTh({ label, field, sort, dir, hrefFor, align }: { label: string; field: string; sort: string; dir: 'asc' | 'desc'; hrefFor: (field: string, dir: 'asc' | 'desc') => string; align?: 'num' }) {
  const active = sort === field;
  const next = active && dir === 'asc' ? 'desc' : 'asc';
  return (
    <th scope="col" className={align === 'num' ? 'a-num' : undefined} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link href={hrefFor(field, next)} className="a-sortlink">
        {label}
        <span aria-hidden="true">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </Link>
    </th>
  );
}

export function DateCell({ value, tz }: { value: string; tz: string }) {
  const d = fmtDate(value, tz);
  return (
    <time dateTime={value} title={d.full}>
      {d.short}
    </time>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="a-kv">
      {items.map((i) => (
        <div key={i.label} style={{ display: 'contents' }}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Forbidden({ capability }: { capability?: string | null }) {
  return (
    <div className="a-card" role="region" aria-labelledby="forbidden-h" style={{ maxWidth: 560 }}>
      <h1 id="forbidden-h" className="a-title">
        403: Not allowed
      </h1>
      <p style={{ margin: '12px 0' }}>Your role does not have access to this page. Ask an owner if you need it.</p>
      {capability ? <p className="a-muted">Permission needed: {capability.replace(':', ' / ')}</p> : null}
      <p style={{ marginTop: 16 }}>
        <Link className="a-btn" href="/admin">
          Back to the console
        </Link>
      </p>
    </div>
  );
}

export function ConfigProblem({ message }: { message: string }) {
  return (
    <div className="a-authwrap">
      <div className="a-card a-authcard" role="alert">
        <h1 className="a-title" style={{ fontSize: 22 }}>
          Admin is not configured
        </h1>
        <p style={{ margin: '12px 0' }}>The console cannot start because of a server setting. No data was exposed.</p>
        <p className="a-code">{message}</p>
        <p className="a-muted" style={{ marginTop: 12 }}>
          Set the value in the server environment (never in browser code) and restart. See docs/admin/plan.md.
        </p>
      </div>
    </div>
  );
}

/** Horizontal scroll container for wide tables: keyboard-focusable so it can be scrolled without a mouse. */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="a-tablewrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
