import type { Metadata } from 'next';
import { getAdmin } from '@/lib/admin';
import { ROLE_LABEL } from '@/components/admin/format';
import { DateCell, PageHeader, StatusBadge, TableWrap } from '@/components/admin/ui';
import { gate } from '../../_lib/gate';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { inviteStaffAction, updateStaffAction } from '../../_actions/staff';
import { gidTail } from '@/lib/admin/ids';

const roles = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));

export const metadata: Metadata = { title: 'Staff' };

export default async function StaffPage() {
  const g = await gate('staff:read');
  if (!g.ok) return g.view;
  const staff = await (await getAdmin()).staff.list();
  return (
    <>
      <PageHeader title="Staff" />
      <section className="a-card" style={{ marginBottom: 16 }} aria-label="Invite staff">
        <h2 className="a-subtitle">Invite staff</h2>
        <p className="a-muted">The email invitation lets your colleague set a password. To resend an unused invitation, enter the same email.</p>
        <ActionForm action={inviteStaffAction} label="Invite staff">
          <Field name="name" label="Name" maxLength={120} required />
          <Field name="email" label="Email" type="email" required />
          <Field name="role" label="Role" as="select" options={roles} defaultValue="SUPPORT" />
          <Submit>Send invitation</Submit>
        </ActionForm>
      </section>
      <TableWrap label="Staff and roles">
        <table className="a-table">
          <caption className="a-sr">Staff and roles</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Last sign-in</th>
              <th scope="col">Manage access</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <th scope="row">{s.name}</th>
                <td>{s.email}</td>
                <td>{ROLE_LABEL[s.role] ?? s.role}</td>
                <td>{s.status === 'ACTIVE' ? <StatusBadge tone="success" shape="check-circle" label="Active" /> : <StatusBadge shape="slash-circle" label="Disabled" />}</td>
                <td>{s.lastSignInAt ? <DateCell value={s.lastSignInAt} tz={g.tz} /> : 'Never'}</td>
                <td>
                  <details><summary>Manage {s.name}</summary>
                    <ActionForm action={updateStaffAction} label={`Manage ${s.email}`}>
                      <input type="hidden" name="id" value={gidTail(s.id, 'StaffUser') ?? ''} />
                      <Field name="role" label="Role" as="select" options={roles} defaultValue={s.role} />
                      <Field name="status" label="Access" as="select" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'DISABLED', label: 'Disabled' }]} defaultValue={s.status} />
                      <label><input type="checkbox" name="confirmed" value="yes" /> Confirm role and access change</label>
                      <p className="a-hint">Saving signs this staff member out of existing sessions.</p>
                      <Submit>Save access</Submit>
                    </ActionForm>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
