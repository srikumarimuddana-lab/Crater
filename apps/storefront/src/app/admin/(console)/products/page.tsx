import type { Metadata } from 'next';
import Link from 'next/link';
import { getAdmin, type AdminProductSummary, type ProductStatus } from '@/lib/admin';
import { fmtAmount, gidSlug } from '@/components/admin/format';
import { ProductStatusBadge } from '@/components/admin/status';
import { EmptyState, PageHeader, SortTh, StatusBadge, TableWrap } from '@/components/admin/ui';
import { gate, one, type SearchParams } from '../../_lib/gate';

export const metadata: Metadata = { title: 'Products' };

const STATUSES: ProductStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
const SORTS = ['title', 'stock', 'variants'] as const;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const g = await gate('products:read');
  if (!g.ok) return g.view;
  const status = STATUSES.find((s) => s === one(sp.status));
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const sort = SORTS.find((s) => s === one(sp.sort)) ?? 'title';
  const dir = one(sp.dir) === 'desc' ? 'desc' : 'asc';
  const m = dir === 'asc' ? 1 : -1;
  const rows = [...(await (await getAdmin()).products.list({ status, query: q || undefined }))].sort((a: AdminProductSummary, b: AdminProductSummary) =>
    sort === 'title' ? m * a.title.localeCompare(b.title) : sort === 'stock' ? m * (a.available - b.available) : m * (a.variantCount - b.variantCount),
  );
  const hrefFor = (field: string, d: 'asc' | 'desc') => {
    const u = new URLSearchParams();
    if (status) u.set('status', status);
    if (q) u.set('q', q);
    u.set('sort', field);
    u.set('dir', d);
    return `/admin/products?${u}`;
  };
  const cur = rows.find((r) => r.priceFrom)?.priceFrom?.currencyCode ?? 'CAD';
  const range = (r: AdminProductSummary) =>
    r.priceFrom ? (r.priceTo && r.priceTo.amount !== r.priceFrom.amount ? `${fmtAmount(r.priceFrom.amount)} – ${fmtAmount(r.priceTo.amount)}` : fmtAmount(r.priceFrom.amount)) : null;

  return (
    <>
      <PageHeader title="Products" />
      <form method="get" action="/admin/products" className="a-filters" role="search" aria-label="Filter products">
        <div className="a-field a-search">
          <label htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={q} />
        </div>
        <div className="a-field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status ?? ''}>
            <option value="">Any</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <button type="submit" className="a-btn">
          Apply
        </button>
        {q || status ? <Link href="/admin/products">Clear filters</Link> : null}
      </form>
      {rows.length === 0 ? (
        <div className="a-tablewrap">
          <EmptyState>{q || status ? 'No products match these filters.' : 'No products yet.'}</EmptyState>
        </div>
      ) : (
        <TableWrap label="Products">
          <table className="a-table">
            <caption className="a-sr">Products</caption>
            <thead>
              <tr>
                <SortTh label="Product" field="title" sort={sort} dir={dir} hrefFor={hrefFor} />
                <th scope="col">Status</th>
                <SortTh label="Variants" field="variants" sort={sort} dir={dir} hrefFor={hrefFor} align="num" />
                <SortTh label="Stock" field="stock" sort={sort} dir={dir} hrefFor={hrefFor} align="num" />
                <th scope="col" className="a-num">
                  Price, {cur}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <Link href={`/admin/products/${gidSlug(p.id)}`}>{p.title}</Link>
                    {p.sample ? (
                      <>
                        {' '}
                        <StatusBadge shape="info" label="Sample" />
                      </>
                    ) : null}
                    <br />
                    <span className="a-muted" style={{ fontWeight: 400 }}>
                      {p.productType}
                    </span>
                  </th>
                  <td>
                    <ProductStatusBadge status={p.status} />
                  </td>
                  <td className="a-num">{p.variantCount}</td>
                  <td className="a-num">{p.available}</td>
                  <td className="a-num">{range(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
