import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryBookingStore, createBooking } from '@/lib/booking/service';
import { availableSlots } from '@/lib/booking/availability';
import { createMemoryOperationsStore } from '@/lib/operations/store';
import { reconcileBooking } from '@/lib/booking/notifications';
const now = new Date('2026-10-15T12:00:00Z');
const settings = {
  enabled: true,
  timezone: 'America/Regina',
  heading: 'Appointments',
  intro: 'Choose a time',
  staffEmails: ['staff@example.com'],
  minimumNoticeMinutes: 0,
  horizonDays: 60,
  cancellationNoticeMinutes: 60,
  reminderMinutes: 60,
  retentionDays: 90,
  version: 0,
};
const resource = {
  id: 'resource1',
  name: 'Team member',
  active: true,
  weekly: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    startMinute: 480,
    endMinute: 1020,
  })),
  exceptions: [],
  version: 0,
};
const service = {
  id: 'service1',
  name: 'Consultation',
  description: 'Discuss your needs',
  durationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 15,
  resourceIds: ['resource1'],
  active: true,
  version: 0,
};
const input = {
  requestId: 'reserve-000000001',
  visitor: 'visitor-one',
  serviceId: 'service1',
  resourceId: 'resource1',
  startsAt: '2026-10-16T15:00:00.000Z',
  name: 'Person',
  email: 'person@example.com',
  notes: '',
};
beforeEach(() => {
  process.env.BOOKING_TOKEN_ENCRYPTION_KEY = '11'.repeat(32);
});
async function setup() {
  const store = createMemoryBookingStore(),
    s = createBooking(store, () => now);
  await s.saveResource(resource, 0, 'o');
  await s.saveService(service, 0, 'o');
  await s.saveSettings(settings, 0, 'o');
  return { store, s };
}
describe('appointments', () => {
  it('refuses incomplete configuration', async () => {
    const s = createBooking(createMemoryBookingStore(), () => now);
    await expect(s.saveSettings(settings, 0, 'o')).rejects.toThrow();
  });
  it('serializes competing bookings and deduplicates only within visitor identity', async () => {
    const { s } = await setup();
    const result = await Promise.allSettled([
      s.reserve(input),
      s.reserve({
        ...input,
        requestId: 'reserve-000000002',
        visitor: 'visitor-two',
      }),
    ]);
    expect(result.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const a = result.find((x) => x.status === 'fulfilled')!;
    if (a.status !== 'fulfilled') throw Error();
    const replay = await s.reserve(input);
    expect(replay.booking.id).toBe(a.value.booking.id);
    await expect(s.reserve({ ...input, notes: 'Changed' })).rejects.toThrow(
      'changed',
    );
  });
  it('authenticates management and preserves the old slot on failed reschedule', async () => {
    const { s } = await setup();
    const a = await s.reserve(input);
    await s.reserve({
      ...input,
      requestId: 'reserve-000000002',
      visitor: 'v2',
      startsAt: '2026-10-16T16:00:00.000Z',
    });
    await expect(s.getManaged(a.booking.id, 'forged')).rejects.toThrow();
    await expect(
      s.reschedule(a.booking.id, a.managementToken, {
        requestId: 'move-00000000001',
        expectedVersion: 1,
        resourceId: 'resource1',
        startsAt: '2026-10-16T16:00:00.000Z',
      }),
    ).rejects.toThrow('available');
    expect((await s.getManaged(a.booking.id, a.managementToken)).startsAt).toBe(
      input.startsAt,
    );
    await s.cancel(a.booking.id, a.managementToken, {
      requestId: 'cancel-000000001',
      expectedVersion: 1,
    });
    expect((await s.getManaged(a.booking.id, a.managementToken)).status).toBe(
      'cancelled',
    );
  });
  it('queues lifecycle email once, suppresses old reminders and keeps bookings through failures', async () => {
    const { s, store } = await setup();
    const a = await s.reserve(input),
      ops = createMemoryOperationsStore();
    await reconcileBooking(store, ops, () => now);
    await reconcileBooking(store, ops, () => now);
    expect((await ops.read()).jobs).toHaveLength(2);
    const later = () => new Date('2026-10-16T14:15:00Z');
    await reconcileBooking(store, ops, later);
    await s.cancel(a.booking.id, a.managementToken, {
      requestId: 'cancel-000000001',
      expectedVersion: 1,
    });
    await reconcileBooking(store, ops, later);
    expect(
      (await ops.read()).jobs.find((j) => j.templateKey === 'booking_reminder')
        ?.status,
    ).toBe('suppressed');
    expect((await s.getManaged(a.booking.id, a.managementToken)).status).toBe(
      'cancelled',
    );
  });
  it('handles DST gaps, repetitions, exceptions, buffers and non-hour zones', () => {
    const base = {
      service,
      resource,
      settings: { ...settings, timezone: 'America/New_York' },
      date: '2026-11-01',
      busy: [],
      now: new Date('2026-10-30T00:00:00Z'),
    };
    const r = {
      ...resource,
      weekly: [{ weekday: 0, startMinute: 60, endMinute: 240 }],
    };
    const slots = availableSlots({ ...base, resource: r });
    expect(
      slots.some(
        (x) =>
          new Intl.DateTimeFormat('en', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            hourCycle: 'h23',
          }).format(new Date(x.startsAt)) === '01',
      ),
    ).toBe(false);
    expect(
      availableSlots({
        ...base,
        resource: { ...r, exceptions: [{ date: base.date, windows: [] }] },
      }),
    ).toEqual([]);
    expect(
      availableSlots({
        ...base,
        settings: { ...settings, timezone: 'Asia/Kolkata' },
        resource,
        date: '2026-11-02',
      }).length,
    ).toBeGreaterThan(0);
  });
});
it('replays a reschedule request without a second mutation', async () => {
  const { s } = await setup();
  const a = await s.reserve(input),
    move = {
      requestId: 'move-00000000001',
      expectedVersion: 1,
      resourceId: 'resource1',
      startsAt: '2026-10-16T17:00:00.000Z',
    };
  const first = await s.reschedule(a.booking.id, a.managementToken, move);
  expect(
    (await s.reschedule(a.booking.id, a.managementToken, move)).version,
  ).toBe(first.version);
});
it('keeps actual buffer instants inside availability across the spring clock change', () => {
  const slots = availableSlots({
    service: { ...service, bufferAfterMinutes: 120 },
    resource: {
      ...resource,
      weekly: [{ weekday: 0, startMinute: 60, endMinute: 240 }],
    },
    settings: { ...settings, timezone: 'America/New_York' },
    date: '2027-03-14',
    busy: [],
    now: new Date('2027-03-12T00:00:00Z'),
  });
  expect(slots).toEqual([]);
});
