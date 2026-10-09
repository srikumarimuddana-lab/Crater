import type { Metadata } from 'next';
import { getAdmin, requireAdmin, type Capability } from '@/lib/admin';
import { DateCell, EmptyState, PageHeader, Pagination, StatusBadge, Tabs, TableWrap } from '@/components/admin/ui';
import { authFailureView, gate, one, type SearchParams } from '../../_lib/gate';

export const metadata: Metadata = { title: 'Event log' };

const OUTCOME = {
  PROCESSED: { tone: 'success', shape: 'check-circle', label: 'Processed' },
  DUPLICATE: { tone: 'neutral', shape: 'circle', label: 'Duplicate' },
  REJECTED: { tone: 'critical', shape: 'octagon-x', label: 'Rejected' },
  FAILED: { tone: 'critical', shape: 'octagon-x', label: 'Failed' },
} as const;

const fmtValue = (v: unknown) => (v === null || v === undefined ? '–' : typeof v === 'string' ? v : JSON.stringify(v));

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  let caps: Capability[] = [];
  try {
    caps = (await requireAdmin()).capabilities;
  } catch (e) {
    return authFailureView(e);
  }
  const canHooks = caps.includes('events:read');
  const canAudit = caps.includes('audit:read');
  const tab = one(sp.tab) === 'audit' ? 'audit' : one(sp.tab) === 'webhooks' ? 'webhooks' : canHooks ? 'webhooks' : 'audit';
  const g = await gate(tab === 'audit' ? 'audit:read' : 'events:read');
  if (!g.ok) return g.view;
  const admin = await getAdmin();
  const tabs = [
    ...(canHooks ? [{ label: 'Webhooks', href: '/admin/events?tab=webhooks', current: tab === 'webhooks' }] : []),
    ...(canAudit ? [{ label: 'Audit', href: '/admin/events?tab=audit', current: tab === 'audit' }] : []),
  ];

  return (
    <>
      <PageHeader title="Event log" />
      <Tabs label="Event log" items={tabs} />
      {tab === 'webhooks' ? <Webhooks events={await admin.events.webhooks({ first: 50 })} tz={g.tz} /> : <Audit after={one(sp.after) ?? null} tz={g.tz} />}
    </>
  );
}

function Webhooks({ events, tz }: { events: Awaited<ReturnType<Awaited<ReturnType<typeof getAdmin>>['events']['webhooks']>>; tz: string }) {
  if (events.length === 0) {
    return (
      <div className="a-tablewrap">
        <EmptyState>No payment events received yet.</EmptyState>
      </div>
    );
  }
  return (
    <TableWrap label="Payment webhook events">
      <table className="a-table">
        <caption className="a-sr">Payment webhook events, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Received</th>
            <th scope="col">Type</th>
            <th scope="col">Event id</th>
            <th scope="col">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const o = OUTCOME[e.outcome];
            return (
              <tr key={e.id}>
                <th scope="row">
                  <DateCell value={e.receivedAt} tz={tz} />
                </th>
                <td>{e.type}</td>
                <td>{e.id}</td>
                <td>
                  <StatusBadge tone={o.tone} shape={o.shape} label={o.label} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

async function Audit({ after, tz }: { after: string | null; tz: string }) {
  const result = await (await getAdmin()).events.audit({ first: 25, after });
  if (result.nodes.length === 0) {
    return (
      <div className="a-tablewrap">
        <EmptyState>No audit entries yet.</EmptyState>
      </div>
    );
  }
  return (
    <>
      <TableWrap label="Audit log">
        <table className="a-table">
          <caption className="a-sr">Audit log, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">Changes</th>
            </tr>
          </thead>
          <tbody>
            {result.nodes.map((a) => (
              <tr key={a.id}>
                <th scope="row">
                  <DateCell value={a.at} tz={tz} />
                </th>
                <td>{a.actor?.email ?? 'System'}</td>
                <td>{a.action}</td>
                <td>{a.target ? `${a.target.type} ${a.target.id.slice(a.target.id.lastIndexOf('/') + 1)}` : null}</td>
                <td>
                  {Object.entries(a.changes).map(([k, c]) => (
                    <div key={k}>
                      {k}: {fmtValue(c.from)} {'→'} {fmtValue(c.to)}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination basePath="/admin/events" params={{ tab: 'audit' }} endCursor={result.pageInfo.endCursor} hasNext={result.pageInfo.hasNextPage} isFirst={!after} />
    </>
  );
}
