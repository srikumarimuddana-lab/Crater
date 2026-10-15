import 'server-only';
import { hash } from '@/lib/public-interactions/validation';
import type { Store } from '@/lib/public-interactions/store';
import { createCommunications } from '@/lib/communications/service';
import { upsertCustomer } from '@/lib/crm/service';
import type { OperationsStore, Notification } from '@/lib/operations/types';
import { decryptToken } from './tokens';
import type { BookingState, Booking } from './types';
export function displayAppointment(b: Pick<Booking, 'startsAt' | 'timezone'>) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: b.timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(b.startsAt));
}
export async function bookingSendGuard(
  store: Store<BookingState>,
  job: Notification,
  now = () => new Date(),
) {
  if (job.source?.kind !== 'booking') return { send: true };
  const b = (await store.read()).bookings.find((b) => b.id === job.source!.id);
  const valid = Boolean(
    b &&
      !b.anonymizedAt &&
      b.version === job.source.version &&
      (job.source.event === 'cancelled'
        ? b.status === 'cancelled'
        : b.status === 'confirmed') &&
      (job.source.event !== 'reminder' || b.startsAt > now().toISOString()),
  );
  return {
    send: valid,
    reason: valid
      ? undefined
      : 'Appointment changed, ended or contact was removed.',
  };
}
export async function reconcileBooking(
  store: Store<BookingState>,
  operations: OperationsStore,
  now = () => new Date(),
) {
  await store.mutate((s) => {
    const at = now().toISOString(),
      offset = s.settings.reminderMinutes;
    for (const b of s.bookings) {
      if (
        !offset ||
        b.status !== 'confirmed' ||
        b.anonymizedAt ||
        b.startsAt <= at ||
        Date.parse(b.startsAt) - offset * 60000 > now().getTime()
      )
        continue;
      const id = `${b.id}:${b.version}:reminder`;
      if (!s.events.some((e) => e.id === id))
        s.events.push({
          id,
          bookingId: b.id,
          version: b.version,
          kind: 'reminder',
          snapshot: structuredClone(b),
          createdAt: at,
        });
    }
  });
  const s = await store.read();
  await operations.mutate((o) => {
    for (const kind of ['confirmed', 'rescheduled', 'cancelled', 'reminder']) {
      const key = `booking_${kind}`;
      if (!o.templates.some((t) => t.key === key && t.channel === 'email'))
        o.templates.push({
          key,
          channel: 'email',
          subject: `Appointment ${kind}: {{service}}`,
          body: `Hello {{name}},\nYour appointment is ${kind}.\n{{service}}\n{{appointment_time}} ({{timezone}})\nReference: {{booking_reference}}\nManage appointment: {{manage_link}}`,
          version: 1,
          updatedAt: now().toISOString(),
        });
    }
    for (const job of o.jobs) {
      if (job.status !== 'pending' || job.source?.kind !== 'booking') continue;
      const b = s.bookings.find((b) => b.id === job.source!.id);
      if (
        !b ||
        b.anonymizedAt ||
        b.version !== job.source.version ||
        (job.source.event === 'reminder' &&
          (b.status !== 'confirmed' || b.startsAt <= now().toISOString()))
      ) {
        job.status = 'suppressed';
        job.error = 'Appointment changed or reminder expired.';
        job.history.push({
          at: now().toISOString(),
          status: 'suppressed',
          detail: job.error,
        });
      }
    }
  });
  const comm = createCommunications(operations, now);
  let queued = 0;
  for (const e of s.events.filter((e) => !e.processed).slice(0, 100)) {
    const current = s.bookings.find((b) => b.id === e.bookingId);
    if (
      !current ||
      current.anonymizedAt ||
      current.version !== e.version ||
      (e.kind !== 'cancelled' && current.status !== 'confirmed')
    ) {
      await store.mutate((s) => {
        const v = s.events.find((v) => v.id === e.id);
        if (v) v.processed = true;
      });
      continue;
    }
    const b = e.snapshot;
    if (e.kind === 'reminder' && b.startsAt <= now().toISOString()) {
      await store.mutate((s) => {
        const v = s.events.find((v) => v.id === e.id);
        if (v) v.processed = true;
      });
      continue;
    }
    const customer = await operations.mutate((o) =>
      o.interactionPrivacy?.some(
        (p) => p.emailHash === hash(b.email) && b.createdAt <= p.at,
      )
        ? null
        : upsertCustomer(o, b.email, now().toISOString(), b.name),
    );
    if (!customer) {
      await store.mutate((s) => {
        const v = s.events.find((v) => v.id === e.id);
        if (v) v.processed = true;
      });
      continue;
    }
    await store.mutate((state) => {
      const booking = state.bookings.find((v) => v.id === b.id);
      if (booking) booking.customerId = customer.id;
    });
    const site = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
    const token = decryptToken(current.encryptedToken);
    const link = site
      ? `${new URL(site).origin}/book/manage#${b.id}.${token}`
      : 'Open the appointment management page and paste your management code.';
    for (const recipient of [
      b.email,
      ...s.settings.staffEmails.filter((v) => v !== b.email),
    ]) {
      const j = await comm.enqueueNotification({
        eventKey: `booking:${b.id}:v${b.version}:${e.kind}:${hash(recipient)}`,
        channel: 'email',
        recipient,
        templateKey: `booking_${e.kind}`,
        variables: {
          name: recipient === b.email ? b.name : 'Team',
          service: b.serviceName,
          appointment_time: displayAppointment(b),
          timezone: b.timezone,
          booking_reference: b.reference,
          manage_link:
            recipient === b.email ? link : `${site}/admin/appointments`,
        },
        mode: b.mode,
        customerId: recipient === b.email ? customer.id : undefined,
        source: {
          kind: 'booking',
          id: b.id,
          version: b.version,
          event: e.kind,
          emailHash: hash(b.email),
          createdAt: b.createdAt,
        },
      });
      if (j.status === 'pending') queued++;
    }
    await store.mutate((s) => {
      const v = s.events.find((v) => v.id === e.id);
      if (v) v.processed = true;
    });
  }
  return { queued };
}
