import type { Metadata } from 'next';
import { getAdmin } from '@/lib/admin';
import { ROLE_LABEL } from '@/components/admin/format';
import { DateCell, Notice, PageHeader, StatusBadge } from '@/components/admin/ui';
import { gate } from '../../_lib/gate';

export const metadata: Metadata = { title: 'Staff' };

export default async function StaffPage() {
  const g = await gate('staff:read');
  if (!g.ok) return g.view;
  const staff = await (await getAdmin()).staff.list();
  return (
    <>
      <PageHeader title="Staff" />
      <div style={{ marginBottom: 12 }}>
        <Notice tone="info">Read-only for now. Roles are fixed in code; inviting staff and changing roles come in a later release.</Notice>
      </div>
      <div className="a-tablewrap">
        <table className="a-table">
          <caption className="a-sr">Staff and roles</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Two-step sign-in</th>
              <th scope="col">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <th scope="row">{s.name}</th>
                <td>{s.email}</td>
                <td>{ROLE_LABEL[s.role] ?? s.role}</td>
                <td>{s.status === 'ACTIVE' ? <StatusBadge tone="success" shape="check-circle" label="Active" /> : <StatusBadge shape="slash-circle" label="Disabled" />}</td>
                <td>{s.mfaEnrolled ? 'Set up' : 'Not set up'}</td>
                <td>{s.lastSignInAt ? <DateCell value={s.lastSignInAt} tz={g.tz} /> : 'Never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
