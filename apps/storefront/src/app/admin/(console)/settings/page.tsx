import type { Metadata } from 'next';
import { getAdmin } from '@/lib/admin';
import { Card, KeyValue, Notice, PageHeader, TableWrap } from '@/components/admin/ui';
import { gate } from '../../_lib/gate';

export const metadata: Metadata = { title: 'Settings' };

const REGISTRATION_LABEL: Record<string, string> = {
  CA_GST: 'GST (federal)',
  SK_PST: 'Saskatchewan PST',
};

/** Read-only store settings: time zone, currency and the tax rate table. Configuration lives in code (docs/tax.md). */
export default async function SettingsPage() {
  const g = await gate('overview:read');
  if (!g.ok) return g.view;
  const settings = await (await getAdmin()).settings.get();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="a-stack">
        <Notice tone="info">Read-only. These values are set in the software configuration; changing them needs a developer.</Notice>
        <Card title="Store" id="store">
          <KeyValue
            items={[
              { label: 'Store time zone', value: settings.timezone },
              { label: 'Currency', value: settings.currency },
              {
                label: 'Tax registrations',
                value: settings.tax.registrations.length ? settings.tax.registrations.map((r) => REGISTRATION_LABEL[r] ?? r).join(', ') : 'None',
              },
            ]}
          />
        </Card>
        <Card title="Sales tax by ship-to province" id="tax">
          <p className="a-muted" style={{ marginBottom: 12 }}>
            The shopper picks the province in the bag. These are the rates Crater charges there.
          </p>
          <TableWrap label="Tax rates by province">
            <table className="a-table">
              <caption className="a-sr">Tax charged for each ship-to province</caption>
              <thead>
                <tr>
                  <th scope="col">Province</th>
                  <th scope="col">Code</th>
                  <th scope="col">Tax charged</th>
                </tr>
              </thead>
              <tbody>
                {settings.tax.provinces.map((p) => (
                  <tr key={p.code} data-province={p.code}>
                    <th scope="row">{p.name}</th>
                    <td>{p.code}</td>
                    <td>{p.lines.length ? p.lines.map((l) => `${l.title} ${l.ratePercent}%`).join(' + ') : 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="a-muted" style={{ marginTop: 12 }}>
            Source: {settings.tax.source}
          </p>
        </Card>
        <Notice tone="warning" title="Not tax advice.">
          {settings.tax.notice}
        </Notice>
      </div>
    </>
  );
}
