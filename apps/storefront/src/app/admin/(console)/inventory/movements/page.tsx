import type { Metadata } from 'next';
import { getAdmin } from '@/lib/admin';
import { REASON_LABEL } from '@/components/admin/format';
import { DateCell, EmptyState, PageHeader, Pagination, Tabs, TableWrap } from '@/components/admin/ui';
import { gate, one, type SearchParams } from '../../../_lib/gate';

export const metadata: Metadata = { title: 'Inventory movements' };

export default async function MovementsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const g = await gate('inventory:read');
  if (!g.ok) return g.view;
  const after = one(sp.after) ?? null;
  const result = await (await getAdmin()).inventory.movements({ first: 25, after });
  return (
    <>
      <PageHeader title="Inventory" />
      <Tabs
        label="Inventory views"
        items={[
          { label: 'Levels', href: '/admin/inventory', current: false },
          { label: 'Movements', href: '/admin/inventory/movements', current: true },
        ]}
      />
      {result.nodes.length === 0 ? (
        <div className="a-tablewrap">
          <EmptyState>No stock movements yet. Adjustments and paid orders appear here.</EmptyState>
        </div>
      ) : (
        <TableWrap label="Stock movements">
          <table className="a-table">
            <caption className="a-sr">Stock movements, newest first. Corrections are new rows, never edits.</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">SKU</th>
                <th scope="col" className="a-num">
                  Change
                </th>
                <th scope="col" className="a-num">
                  Available after
                </th>
                <th scope="col">Reason</th>
                <th scope="col">By</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {result.nodes.map((m) => (
                <tr key={m.id}>
                  <th scope="row">
                    <DateCell value={m.at} tz={g.tz} />
                  </th>
                  <td>{m.sku}</td>
                  <td className="a-num">{m.delta > 0 ? `+${m.delta}` : `−${Math.abs(m.delta)}`}</td>
                  <td className="a-num">{m.availableAfter}</td>
                  <td>{REASON_LABEL[m.reason] ?? m.reason}</td>
                  <td>{m.actor ?? 'System'}</td>
                  <td>{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Pagination basePath="/admin/inventory/movements" params={{}} endCursor={result.pageInfo.endCursor} hasNext={result.pageInfo.hasNextPage} isFirst={!after} />
    </>
  );
}
