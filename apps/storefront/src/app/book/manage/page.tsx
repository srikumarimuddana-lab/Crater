import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { PageShell } from '@/components/page-shell';
import { getBooking } from '@/lib/booking';
import { displayAppointment } from '@/lib/booking/notifications';
import { localParts } from '@/lib/booking/availability';
import { getOperationsStore } from '@/lib/operations/store';
import { ManagementLink } from '@/components/booking/management-link';
export const dynamic = 'force-dynamic';
export const metadata = {
  robots: { index: false, follow: false },
  referrer: 'same-origin' as const,
};
export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams,
    jar = await cookies(),
    [id, token] = (jar.get('crater_booking')?.value ?? '').split('.'),
    engine = await getBooking();
  let booking;
  try {
    if (id && token) booking = await engine.getManaged(id, token);
  } catch {}
  const s = await engine.read(),
    date =
      p.date ||
      (booking
        ? localParts(new Date(booking.startsAt), booking.timezone).date
        : ''),
    resource = p.resourceId || booking?.resourceId || '',
    slots =
      booking && booking.status === 'confirmed'
        ? await engine.slots(booking.serviceId, resource, date)
        : [];
  const jobs = booking
    ? (await (await getOperationsStore()).read()).jobs.filter(
        (j) => j.source?.id === booking.id && j.recipient === booking.email,
      )
    : [];
  return (
    <PageShell>
      <section className="interaction-page">
        <ManagementLink />
        <p className="interaction-eyebrow">Your appointment</p>
        <h1>Manage your booking</h1>
        {!booking ? (
          <>
            <p>
              Open the link from your appointment email, or paste your complete
              management code. No account is needed.
            </p>
            <form
              className="interaction-form"
              method="post"
              action="/api/booking/manage"
            >
              <input type="hidden" name="action" value="exchange" />
              <label>
                Management code
                <input
                  name="code"
                  required
                  autoComplete="off"
                  maxLength={200}
                />
              </label>
              <button className="interaction-primary">Open appointment</button>
            </form>
          </>
        ) : (
          <>
            <h2>{booking.serviceName}</h2>
            <p>
              <strong>{booking.reference}</strong> · {booking.status}
            </p>
            <p>
              {displayAppointment(booking)} ({booking.timezone})
            </p>
            <p>
              Appointment emails:{' '}
              {jobs.length
                ? jobs
                    .map(
                      (j) =>
                        `${j.templateKey.replace('booking_', '')}: ${j.status}`,
                    )
                    .join(' · ')
                : 'Awaiting email queue recovery'}
              . Delivery status does not change your reservation.
            </p>
            {booking.status === 'confirmed' ? (
              <>
                <details>
                  <summary>Reschedule appointment</summary>
                  <form method="get" className="interaction-form">
                    <label>
                      New date
                      <input
                        type="date"
                        name="date"
                        required
                        defaultValue={date}
                      />
                    </label>
                    <label>
                      Team / resource
                      <select name="resourceId" defaultValue={resource}>
                        {s.resources
                          .filter(
                            (r) =>
                              r.active &&
                              s.services
                                .find((v) => v.id === booking!.serviceId)
                                ?.resourceIds.includes(r.id),
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button className="interaction-secondary">
                      Find replacement times
                    </button>
                  </form>
                  <form
                    className="interaction-form"
                    method="post"
                    action="/api/booking/manage"
                  >
                    <input name="action" type="hidden" value="reschedule" />
                    <input
                      name="expectedVersion"
                      type="hidden"
                      value={booking.version}
                    />
                    <input
                      name="requestId"
                      type="hidden"
                      value={randomUUID()}
                    />
                    <input name="resourceId" type="hidden" value={resource} />
                    <label>
                      New time
                      <select name="startsAt" required>
                        {slots.map((slot) => (
                          <option key={slot.startsAt} value={slot.startsAt}>
                            {displayAppointment(slot)} ({slot.timezone})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="interaction-primary"
                      disabled={!slots.length}
                    >
                      Confirm new time
                    </button>
                    <p>
                      Your existing time stays reserved until the new time is
                      confirmed.
                    </p>
                  </form>
                </details>
                <details>
                  <summary>Cancel appointment</summary>
                  <form
                    method="post"
                    className="interaction-form"
                    action="/api/booking/manage"
                  >
                    <input name="action" type="hidden" value="cancel" />
                    <input
                      name="expectedVersion"
                      type="hidden"
                      value={booking.version}
                    />
                    <input
                      name="requestId"
                      type="hidden"
                      value={randomUUID()}
                    />
                    <p>
                      Cancellation releases your reserved time. Changes must
                      meet our configured notice period.
                    </p>
                    <button className="interaction-secondary">
                      Confirm cancellation
                    </button>
                  </form>
                </details>
              </>
            ) : null}
            <details>
              <summary>Save your management code</summary>
              <p>
                Keep this code private. Anyone with it can manage this
                appointment.
              </p>
              <code className="interaction-code">
                {id}.{token}
              </code>
            </details>
          </>
        )}
        <p>
          <a href="/contact">Contact our team</a>
        </p>
      </section>
    </PageShell>
  );
}
