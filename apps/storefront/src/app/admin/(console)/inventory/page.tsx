import type { Metadata } from 'next';
import Link from 'next/link';
import { allowedAdjustReasons, getAdmin, type InventoryLevel } from '@/lib/admin';
import { gidFrom, gidSlug, REASON_LABEL } from '@/components/admin/format';
import { AdjustDialog, CloseButton } from '@/components/admin/adjust-dialog';
import { FocusOnMount } from '@/components/admin/focus';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { EmptyState, Notice, PageHeader, SortTh, StatusBadge, Tabs } from '@/components/admin/ui';
import { adjustStockAction } from '../../_actions/inventory';
import { gate, one, type SearchParams } from '../../_lib/gate';

export const metadata: Metadata = { title: 'Inventory' };

const SORTS = ['default', 'product', 'available', 'onhand'] as const;

function stockBadge(l: InventoryLevel) {
  if (!l.tracked) return <StatusBadge shape="circle" label="Not tracked" />;
  if (l.available === 0) return <StatusBadge tone="critical" shape="octagon-x" label="Out of stock" />;
  if (l.low) return <StatusBadge tone="warning" shape="triangle" label="Low stock" />;
  return <StatusBadge tone="success" shape="check-circle" label="In stock" />;
}

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const g = await gate('inventory:read');
  if (!g.ok) return g.view;
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const onlyLow = one(sp.low) === '1';
  const sort = SORTS.find((s) => s === one(sp.sort)) ?? 'default';
  const dir = one(sp.dir) === 'desc' ? 'desc' : 'asc';
  const adjustSlug = one(sp.adjust);
  const canAdjust = g.can('inventory:adjust');

  let levels = await (await getAdmin()).inventory.levels({ query: q || undefined, onlyLow });
  if (sort !== 'default') {
    const m = dir === 'asc' ? 1 : -1;
    levels = [...levels].sort((a, b) =>
      sort === 'product' ? m * `${a.productTitle} ${a.variantTitle}`.localeCompare(`${b.productTitle} ${b.variantTitle}`) : m * (((sort === 'available' ? a.available : a.onHand) ?? -1) - ((sort === 'available' ? b.available : b.onHand) ?? -1)),
    );
  }

  const base = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/admin/inventory?${s}` : '/admin/inventory';
  };
  const keep = { q: q || undefined, low: onlyLow ? '1' : undefined, sort: sort === 'default' ? undefined : sort, dir: sort === 'default' ? undefined : dir };
  const hrefFor = (field: string, d: 'asc' | 'desc') => base({ q: keep.q, low: keep.low, sort: field, dir: d });

  const target = adjustSlug && canAdjust ? levels.find((l) => gidSlug(l.variantId) === adjustSlug && l.tracked) : undefined;
  const reasons = allowedAdjustReasons(g.session.staff.role);
  const adjusted = one(sp.adjusted);

  return (
    <>
      <PageHeader title="Inventory" />
      <Tabs
        label="Inventory views"
        items={[
          { label: 'Levels', href: '/admin/inventory', current: true },
          { label: 'Movements', href: '/admin/inventory/movements', current: false },
        ]}
      />
      {adjusted ? (
        <FocusOnMount>
          <Notice tone="success">
            Stock adjusted for {adjusted} ({one(sp.change) ?? ''}). The change is in the <Link href="/admin/inventory/movements">movements list</Link>.
          </Notice>
        </FocusOnMount>
      ) : null}
      <form method="get" action="/admin/inventory" className="a-filters" role="search" aria-label="Filter inventory">
        <div className="a-field a-search">
          <label htmlFor="q">Search product or SKU</label>
          <input id="q" name="q" type="search" defaultValue={q} />
        </div>
        <div className="a-field" style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}>
          <input id="low" name="low" type="checkbox" value="1" defaultChecked={onlyLow} style={{ width: 20, height: 20 }} />
          <label htmlFor="low">Low stock only</label>
        </div>
        <button type="submit" className="a-btn">
          Apply
        </button>
        {q || onlyLow ? <Link href="/admin/inventory">Clear filters</Link> : null}
      </form>

      {levels.length === 0 ? (
        <div className="a-tablewrap">
          <EmptyState>{q || onlyLow ? 'No variants match these filters.' : 'No variants yet.'}</EmptyState>
        </div>
      ) : (
        <div className="a-tablewrap">
          <table className="a-table">
            <caption className="a-sr">Stock levels{onlyLow ? ', low stock only' : ''}. Low stock first.</caption>
            <thead>
              <tr>
                <SortTh label="Product" field="product" sort={sort} dir={dir} hrefFor={hrefFor} />
                <th scope="col">SKU</th>
                <SortTh label="Available" field="available" sort={sort} dir={dir} hrefFor={hrefFor} align="num" />
                <th scope="col" className="a-num">
                  Committed
                </th>
                <SortTh label="On hand" field="onhand" sort={sort} dir={dir} hrefFor={hrefFor} align="num" />
                <th scope="col" className="a-num">
                  Low-stock at
                </th>
                <th scope="col">Status</th>
                {canAdjust ? (
                  <th scope="col">
                    <span className="a-sr">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.variantId} className={l.low ? 'is-low' : undefined}>
                  <th scope="row">
                    {l.productTitle}
                    <br />
                    <span className="a-muted" style={{ fontWeight: 400 }}>
                      {l.variantTitle}
                    </span>
                  </th>
                  <td>{l.sku}</td>
                  <td className="a-num">{l.tracked ? l.available : 'Not tracked'}</td>
                  <td className="a-num">{l.tracked ? l.committed : null}</td>
                  <td className="a-num">{l.tracked ? l.onHand : null}</td>
                  <td className="a-num">{l.tracked ? l.lowStockThreshold : null}</td>
                  <td>{stockBadge(l)}</td>
                  {canAdjust ? (
                    <td>
                      {l.tracked ? (
                        <Link href={base({ ...keep, adjust: gidSlug(l.variantId) })} data-adjust-trigger={gidSlug(l.variantId)} aria-label={`Adjust stock for ${l.productTitle}, ${l.variantTitle}`} scroll={false}>
                          Adjust
                        </Link>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {target ? (
        <AdjustDialog title={`Adjust stock: ${target.productTitle}, ${target.variantTitle}`} closeHref={base(keep)} triggerKey={gidSlug(target.variantId)}>
          <ActionForm action={adjustStockAction} label="Adjust stock">
            <input type="hidden" name="variantId" value={gidFrom('ProductVariant', gidSlug(target.variantId)) ?? target.variantId} />
            <input type="hidden" name="sku" value={target.sku} />
            <p className="a-muted" style={{ marginBottom: 12 }}>
              SKU {target.sku}. Available now: <strong>{target.available}</strong>. Committed to paid orders: {target.committed}.
            </p>
            <Field name="delta" label="Change by" required autoComplete="off" hint="Use a minus sign to remove stock, for example -2. It cannot take stock below 0." />
            <Field name="reason" label="Reason" as="select" required options={[{ value: '', label: 'Choose a reason' }, ...reasons.map((r) => ({ value: r, label: REASON_LABEL[r] ?? r }))]} />
            <Field name="note" label="Note" as="textarea" rows={2} maxLength={300} hint="Required for Other (3 or more characters). Not copied to the audit log." />
            <div className="a-dialog-actions">
              <CloseButton />
              <Submit pendingText="Saving…">Save adjustment</Submit>
            </div>
          </ActionForm>
        </AdjustDialog>
      ) : null}
    </>
  );
}
