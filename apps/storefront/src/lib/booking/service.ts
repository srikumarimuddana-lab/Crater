import 'server-only';
import { randomUUID } from 'node:crypto';
import { memoryStore, type Store } from '@/lib/public-interactions/store';
import {
  hash,
  opaque,
  text,
  requestKey,
  InteractionError,
} from '@/lib/public-interactions/validation';
import { normalizeEmail } from '@/lib/crm/service';
import { availableSlots, localParts } from './availability';
import {
  validateSettings,
  validateResource,
  validateService,
} from './validation';
import { encryptToken, decryptToken, tokenMatches } from './tokens';
import type {
  Booking,
  BookingState,
  BookingSettings,
  BookingResource,
  BookingService,
  BookingStatus,
} from './types';
export const initialBooking = (): BookingState => ({
  settings: {
    enabled: false,
    timezone: '',
    heading: 'Appointments',
    intro: 'Choose a service and an available time.',
    staffEmails: [],
    minimumNoticeMinutes: 60,
    horizonDays: 60,
    cancellationNoticeMinutes: 1440,
    reminderMinutes: 1440,
    retentionDays: 90,
    version: 0,
  },
  services: [],
  resources: [],
  bookings: [],
  events: [],
  requests: [],
  audit: [],
});
export const createMemoryBookingStore = () => memoryStore(initialBooking);
export function createBooking(
  store: Store<BookingState>,
  now = () => new Date(),
) {
  const audit = (
    s: BookingState,
    actor: string,
    action: string,
    target: string,
  ) => s.audit.push({ actor, action, target, at: now().toISOString() });
  const event = (
    s: BookingState,
    b: Booking,
    kind: 'confirmed' | 'rescheduled' | 'cancelled',
  ) =>
    s.events.push({
      id: `${b.id}:${b.version}:${kind}`,
      bookingId: b.id,
      version: b.version,
      kind,
      snapshot: structuredClone(b),
      createdAt: now().toISOString(),
    });
  const auth = (s: BookingState, id: string, token: string) => {
    const b = s.bookings.find((b) => b.id === id);
    if (
      !b ||
      b.anonymizedAt ||
      b.tokenExpiresAt <= now().toISOString() ||
      !tokenMatches(token, b.tokenHash)
    )
      throw new InteractionError(
        'This appointment link is invalid or expired.',
        403,
      );
    return b;
  };
  const slot = (
    s: BookingState,
    serviceId: string,
    resourceId: string,
    start: string,
    ignore?: string,
  ) => {
    const service = s.services.find((v) => v.id === serviceId),
      resource = s.resources.find((v) => v.id === resourceId);
    if (!service || !resource || !s.settings.enabled)
      throw new InteractionError(
        'Appointments are currently unavailable.',
        503,
      );
    const date = localParts(new Date(start), s.settings.timezone).date;
    const available = availableSlots({
      service,
      resource,
      settings: s.settings,
      date,
      busy: s.bookings.filter(
        (b) => b.id !== ignore && b.status !== 'cancelled',
      ),
      now: now(),
    }).find((v) => v.startsAt === new Date(start).toISOString());
    if (!available)
      throw new InteractionError(
        'That time is no longer available. Choose another time.',
        409,
      );
    return { available, service };
  };
  return {
    read: () => store.read(),
    async saveSettings(v: BookingSettings, expected: number, actor: string) {
      const next = validateSettings(v);
      return store.mutate((s) => {
        if (s.settings.version !== expected)
          throw new InteractionError(
            'Settings changed. Reload before saving.',
            409,
          );
        if (
          next.enabled &&
          (!s.services.some(
            (v) =>
              v.active &&
              v.resourceIds.some((id) =>
                s.resources.some(
                  (r) => r.id === id && r.active && r.weekly.length,
                ),
              ),
          ) ||
            !next.timezone)
        )
          throw new InteractionError(
            'Configure an active service, resource and availability first.',
          );
        s.settings = { ...next, version: expected + 1 };
        audit(s, actor, 'booking.settings', 'settings');
      });
    },
    async saveResource(v: BookingResource, expected: number, actor: string) {
      validateResource(v);
      return store.mutate((s) => {
        const prior = s.resources.find((r) => r.id === v.id);
        if ((prior?.version ?? 0) !== expected)
          throw new InteractionError(
            'Resource changed. Reload before saving.',
            409,
          );
        s.resources = s.resources.filter((r) => r.id !== v.id);
        s.resources.push({ ...v, version: expected + 1 });
        audit(s, actor, 'booking.resource', v.id);
      });
    },
    async saveService(v: BookingService, expected: number, actor: string) {
      validateService(v);
      return store.mutate((s) => {
        const prior = s.services.find((r) => r.id === v.id);
        if ((prior?.version ?? 0) !== expected)
          throw new InteractionError(
            'Service changed. Reload before saving.',
            409,
          );
        if (v.resourceIds.some((id) => !s.resources.some((r) => r.id === id)))
          throw new InteractionError('Choose existing resources.');
        s.services = s.services.filter((r) => r.id !== v.id);
        s.services.push({ ...v, version: expected + 1 });
        audit(s, actor, 'booking.service', v.id);
      });
    },
    async slots(serviceId: string, resourceId: string, date: string) {
      const s = await store.read(),
        service = s.services.find((v) => v.id === serviceId),
        resource = s.resources.find((v) => v.id === resourceId);
      return service && resource
        ? availableSlots({
            service,
            resource,
            settings: s.settings,
            date,
            busy: s.bookings.filter((b) => b.status !== 'cancelled'),
            now: now(),
          })
        : [];
    },
    async reserve(input: {
      requestId: string;
      visitor: string;
      serviceId: string;
      resourceId: string;
      startsAt: string;
      name: string;
      email: string;
      notes: string;
    }) {
      requestKey(input.requestId);
      const name = text(input.name, 150),
        email = normalizeEmail(input.email),
        notes = text(input.notes, 4000, true),
        visitor = text(input.visitor, 150),
        digest = hash(JSON.stringify({ ...input, name, email, notes }));
      return store.mutate((s) => {
        const key = `${hash(visitor)}:${input.requestId}`,
          prior = s.requests.find((r) => r.key === key);
        if (prior) {
          if (prior.digest !== digest)
            throw new InteractionError(
              'The request changed. Start a new booking.',
              409,
            );
          const b = s.bookings.find((b) => b.id === prior.bookingId);
          if (!b || b.anonymizedAt)
            throw new InteractionError('Booking is no longer available.', 410);
          return {
            booking: prior.result,
            managementToken: decryptToken(b.encryptedToken),
          };
        }
        const { available, service } = slot(
            s,
            input.serviceId,
            input.resourceId,
            input.startsAt,
          ),
          token = opaque(),
          at = now().toISOString(),
          id = randomUUID();
        const booking: Booking = {
          id,
          reference: `APT-${id.slice(0, 8).toUpperCase()}`,
          serviceId: service.id,
          resourceId: input.resourceId,
          startsAt: available.startsAt,
          endsAt: available.endsAt,
          busyStartsAt: new Date(
            Date.parse(available.startsAt) -
              service.bufferBeforeMinutes * 60000,
          ).toISOString(),
          busyEndsAt: new Date(
            Date.parse(available.endsAt) + service.bufferAfterMinutes * 60000,
          ).toISOString(),
          timezone: s.settings.timezone,
          serviceName: service.name,
          name,
          email,
          notes,
          status: 'confirmed',
          mode: process.env.COMMUNICATIONS_MODE === 'live' ? 'live' : 'test',
          version: 1,
          createdAt: at,
          updatedAt: at,
          tokenHash: hash(token),
          encryptedToken: encryptToken(token),
          tokenExpiresAt: new Date(
            Date.parse(available.endsAt) + 30 * 86400000,
          ).toISOString(),
        };
        s.bookings.push(booking);
        event(s, booking, 'confirmed');
        s.requests.push({
          key,
          digest,
          bookingId: id,
          result: structuredClone(booking),
        });
        audit(s, 'visitor', 'booking.created', id);
        return { booking, managementToken: token };
      });
    },
    async getManaged(id: string, token: string) {
      return auth(await store.read(), id, token);
    },
    async cancel(
      id: string,
      token: string,
      input: { requestId: string; expectedVersion: number },
      staff?: { actor: string; reason: string },
    ) {
      requestKey(input.requestId);
      return store.mutate((s) => {
        const b = staff
          ? s.bookings.find((b) => b.id === id)
          : auth(s, id, token);
        if (!b) throw new InteractionError('Appointment not found.', 404);
        if (b.status === 'cancelled') return b;
        if (b.version !== input.expectedVersion)
          throw new InteractionError(
            'Appointment changed. Reload before saving.',
            409,
          );
        if (b.status !== 'confirmed')
          throw new InteractionError(
            'Only a confirmed appointment can be cancelled.',
          );
        if (
          !staff &&
          Date.parse(b.startsAt) - now().getTime() <
            s.settings.cancellationNoticeMinutes * 60000
        )
          throw new InteractionError(
            'The cancellation window has closed. Please contact our team.',
          );
        if (staff) text(staff.reason, 500);
        b.status = 'cancelled';
        b.version++;
        b.updatedAt = now().toISOString();
        event(s, b, 'cancelled');
        audit(
          s,
          staff?.actor ?? 'visitor',
          `booking.cancelled${staff ? `: ${staff.reason}` : ''}`,
          id,
        );
        return b;
      });
    },
    async reschedule(
      id: string,
      token: string,
      input: {
        requestId: string;
        expectedVersion: number;
        resourceId: string;
        startsAt: string;
      },
      staff?: { actor: string; reason: string },
    ) {
      requestKey(input.requestId);
      return store.mutate((s) => {
        const b = staff
          ? s.bookings.find((b) => b.id === id)
          : auth(s, id, token);
        if (!b) throw new InteractionError('Appointment not found.', 404);
        const key = `manage:${id}:${input.requestId}`,
          digest = hash(JSON.stringify(input)),
          prior = s.requests.find((r) => r.key === key);
        if (prior) {
          if (prior.digest !== digest)
            throw new InteractionError(
              'The request changed. Start a new reschedule.',
              409,
            );
          return prior.result;
        }
        if (b.version !== input.expectedVersion)
          throw new InteractionError(
            'Appointment changed. Reload before saving.',
            409,
          );
        if (b.status !== 'confirmed')
          throw new InteractionError(
            'Only confirmed appointments can be moved.',
          );
        if (
          !staff &&
          Date.parse(b.startsAt) - now().getTime() <
            s.settings.cancellationNoticeMinutes * 60000
        )
          throw new InteractionError(
            'The rescheduling window has closed. Please contact our team.',
          );
        if (staff) text(staff.reason, 500);
        const { available, service } = slot(
          s,
          b.serviceId,
          input.resourceId,
          input.startsAt,
          b.id,
        );
        Object.assign(b, {
          resourceId: input.resourceId,
          startsAt: available.startsAt,
          endsAt: available.endsAt,
          timezone: available.timezone,
          busyStartsAt: new Date(
            Date.parse(available.startsAt) -
              service.bufferBeforeMinutes * 60000,
          ).toISOString(),
          busyEndsAt: new Date(
            Date.parse(available.endsAt) + service.bufferAfterMinutes * 60000,
          ).toISOString(),
          tokenExpiresAt: new Date(
            Date.parse(available.endsAt) + 30 * 86400000,
          ).toISOString(),
          updatedAt: now().toISOString(),
          version: b.version + 1,
        });
        event(s, b, 'rescheduled');
        s.requests.push({
          key,
          digest,
          bookingId: id,
          result: structuredClone(b),
        });
        audit(
          s,
          staff?.actor ?? 'visitor',
          `booking.rescheduled${staff ? `: ${staff.reason}` : ''}`,
          id,
        );
        return b;
      });
    },
    async status(
      id: string,
      status: BookingStatus,
      expected: number,
      actor: string,
    ) {
      if (!['completed', 'no_show'].includes(status))
        throw new InteractionError('Choose completed or no-show.');
      return store.mutate((s) => {
        const b = s.bookings.find((b) => b.id === id);
        if (!b || b.version !== expected)
          throw new InteractionError(
            'Appointment changed. Reload before saving.',
            409,
          );
        if (b.status !== 'confirmed' || Date.parse(b.endsAt) > now().getTime())
          throw new InteractionError(
            'Only past confirmed appointments can be completed or marked no-show.',
          );
        b.status = status;
        b.version++;
        audit(s, actor, `booking.${status}`, id);
      });
    },
  };
}
