import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { gate, type SearchParams, one } from '@/app/admin/_lib/gate';
import { getBooking } from '@/lib/booking';
import { displayAppointment } from '@/lib/booking/notifications';
import { PageHeader, Card } from '@/components/admin/ui';
import { ActionForm } from '@/lib/communications/form';
import { Field, Hidden } from '@/lib/communications/admin-ui';
import { changeAppointment } from '@/app/admin/_actions/appointments';
export default async function Appointments({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const g = await gate('appointments:read');
  if (!g.ok) return g.view;
  const s = await (await getBooking()).read(),
    p = await searchParams,
    from = one(p.from) || new Date().toISOString().slice(0, 10),
    to = one(p.to) || '',
    status = one(p.status) || '',
    service = one(p.service) || '',
    resource = one(p.resource) || '',
    mode = one(p.mode) || 'test';
  const rows = s.bookings
    .filter(
      (b) =>
        b.mode === mode &&
        b.startsAt.slice(0, 10) >= from &&
        (!to || b.startsAt.slice(0, 10) <= to) &&
        (!status || b.status === status) &&
        (!service || b.serviceId === service) &&
        (!resource || b.resourceId === resource),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const qs = new URLSearchParams({ from, to, status, service, resource, mode });
  return (
    <>
      <PageHeader
        title="Appointments"
        actions={
          <>
            {g.can('appointments:configure') ? (
              <Link className="a-btn" href="/admin/appointments/settings">
                Configure booking
              </Link>
            ) : null}
            <a className="a-btn" href={`/admin/appointments/export?${qs}`}>
              Export CSV
            </a>
            <Link className="a-btn" href="/book">
              View booking page
            </Link>
          </>
        }
      />
      <form className="a-card a-row" method="get">
        <Field name="from" label="From (UTC date)" type="date" value={from} />
        <Field name="to" label="Through (UTC date)" type="date" value={to} />
        <label>
          Status
          <select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {['confirmed', 'cancelled', 'completed', 'no_show'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Service
          <select name="service" defaultValue={service}>
            <option value="">All services</option>
            {s.services.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Resource
          <select name="resource" defaultValue={resource}>
            <option value="">All resources</option>
            {s.resources.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Message mode
          <select name="mode" defaultValue={mode}>
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
        </label>
        <button className="a-btn">Filter appointments</button>
      </form>
      <Card title="Calendar">
        <p className="a-muted">
          {rows.length} appointment(s). Times are shown in each appointment’s
          business timezone.
        </p>
        <div className="interaction-calendar">
          {[...new Set(rows.map((b) => b.startsAt.slice(0, 10)))].map(
            (date) => (
              <section key={date}>
                <h3>{date} (UTC grouping)</h3>
                {rows
                  .filter((b) => b.startsAt.startsWith(date))
                  .map((b) => (
                    <p key={b.id}>
                      <a href={`#appointment-${b.id}`}>
                        {displayAppointment(b)} · {b.serviceName} · {b.status}
                      </a>
                    </p>
                  ))}
              </section>
            ),
          )}
        </div>
      </Card>
      <Card title="Appointment list">
        {!rows.length ? (
          <p>No appointments match these filters.</p>
        ) : (
          rows.map((b) => (
            <details id={`appointment-${b.id}`} key={b.id} className="a-card">
              <summary>
                {b.reference} · {b.name} · {b.serviceName} ·{' '}
                {displayAppointment(b)} · {b.status}
              </summary>
              <p>
                {b.timezone} ·{' '}
                {s.resources.find((r) => r.id === b.resourceId)?.name}
              </p>
              <p>Email: {b.email}</p>
              <p>{b.notes}</p>
              {b.customerId ? (
                <Link href={`/admin/customers/${b.customerId}`}>
                  Customer history
                </Link>
              ) : null}
              {g.can('appointments:manage') && b.status === 'confirmed' ? (
                <ActionForm
                  action={changeAppointment}
                  label="Update appointment"
                >
                  <Hidden name="id" value={b.id} />
                  <Hidden name="version" value={b.version} />
                  <Hidden name="requestId" value={randomUUID()} />
                  <label>
                    Action
                    <select name="action">
                      <option value="cancel">Cancel</option>
                      <option value="reschedule">Reschedule</option>
                      <option value="completed">Mark completed</option>
                      <option value="no_show">Mark no-show</option>
                    </select>
                  </label>
                  <label>
                    Resource
                    <select name="resourceId" defaultValue={b.resourceId}>
                      {s.resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    name="startsAt"
                    label="New start for rescheduling (UTC ISO, for example 2026-12-01T16:00:00.000Z)"
                    value={b.startsAt}
                  />
                  <Field
                    name="reason"
                    label="Reason for change / cutoff override"
                    required
                  />
                </ActionForm>
              ) : null}
            </details>
          ))
        )}
      </Card>
    </>
  );
}
