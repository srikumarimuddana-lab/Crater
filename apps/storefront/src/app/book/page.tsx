import { issueBookingVisitor } from '@/lib/booking/tokens';
import { randomUUID } from 'node:crypto';
import { PageShell } from '@/components/page-shell';
import { getBooking } from '@/lib/booking';
import { localParts } from '@/lib/booking/availability';
import { displayAppointment } from '@/lib/booking/notifications';
import { ReservationForm } from '@/components/booking/reservation-form';
export const dynamic = 'force-dynamic';
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const engine = await getBooking(),
    s = await engine.read(),
    p = await searchParams,
    c = s.settings,
    service =
      s.services.find((v) => v.id === p.serviceId && v.active) ||
      s.services.find((v) => v.active),
    resources = s.resources.filter(
      (r) => r.active && service?.resourceIds.includes(r.id),
    ),
    resource = resources.find((r) => r.id === p.resourceId) || resources[0],
    date =
      p.date ||
      (c.timezone
        ? localParts(new Date(), c.timezone).date
        : new Date().toISOString().slice(0, 10)),
    slots =
      service && resource && c.enabled
        ? await engine.slots(service.id, resource.id, date)
        : [],
    selected = slots.find((slot) => slot.startsAt === p.startsAt);
  return (
    <PageShell>
      <section className="interaction-page">
        <p className="interaction-eyebrow">Make time for you</p>
        <h1>{c.heading}</h1>
        <p>{c.intro}</p>
        {!c.enabled ? (
          <p>
            Online appointments are not available yet.{' '}
            <a href="/contact">Contact our team</a> for help.
          </p>
        ) : (
          <>
            <p>
              All times shown in <strong>{c.timezone}</strong>.
            </p>
            <form className="interaction-form interaction-picker" method="get">
              <label>
                Service
                <select name="serviceId" defaultValue={service?.id}>
                  {s.services
                    .filter((v) => v.active)
                    .map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.name} · {v.durationMinutes} minutes
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Team / resource
                <select name="resourceId" defaultValue={resource?.id}>
                  {resources.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" name="date" defaultValue={date} required />
              </label>
              <button className="interaction-secondary">
                Find available times
              </button>
            </form>
            {service ? <p>{service.description}</p> : null}
            <h2>Available times</h2>
            {!slots.length ? (
              <p>No available times on this date. Choose another date.</p>
            ) : (
              <div className="interaction-slots">
                {slots.map((slot) => {
                  const q = new URLSearchParams({
                    serviceId: slot.serviceId,
                    resourceId: slot.resourceId,
                    date,
                    startsAt: slot.startsAt,
                  });
                  return (
                    <a
                      className={`interaction-secondary${selected?.startsAt === slot.startsAt ? ' is-selected' : ''}`}
                      key={slot.startsAt}
                      href={`/book?${q}#reserve`}
                    >
                      {new Intl.DateTimeFormat('en-CA', {
                        timeZone: c.timezone,
                        hour: 'numeric',
                        minute: '2-digit',
                      }).format(new Date(slot.startsAt))}
                    </a>
                  );
                })}
              </div>
            )}
            {selected ? (
              <div className="interaction-reservation" id="reserve">
                <h2>Your appointment</h2>
                <p>
                  {service?.name} · {displayAppointment(selected)} ({c.timezone}
                  )
                </p>
                <ReservationForm
                  visitorKey={issueBookingVisitor()}
                  serviceId={selected.serviceId}
                  resourceId={selected.resourceId}
                  startsAt={selected.startsAt}
                  requestId={randomUUID()}
                />
              </div>
            ) : null}
            <p>
              <a href="/book/manage">Manage an existing appointment</a>
            </p>
          </>
        )}
      </section>
    </PageShell>
  );
}
