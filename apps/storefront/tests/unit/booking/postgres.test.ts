import { it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { resetDatabase, TEST_DATABASE_URL } from '../helpers/repos';
import { createPostgresBookingStore } from '@/lib/booking/repository';
import { createBooking } from '@/lib/booking/service';
import { postgresDocumentStore } from '@/lib/public-interactions/store';
import { initialChat, createChat } from '@/lib/chat/service';
const pool = TEST_DATABASE_URL
  ? new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 })
  : null;
afterAll(async () => {
  await pool?.end();
});
it.skipIf(!pool)(
  'persists independent adapters and rejects competing SQL reservations',
  async () => {
    await resetDatabase(pool!);
    process.env.BOOKING_TOKEN_ENCRYPTION_KEY = '11'.repeat(32);
    const now = () => new Date('2026-10-15T00:00:00Z'),
      a = createBooking(createPostgresBookingStore(pool!), now),
      b = createBooking(createPostgresBookingStore(pool!), now);
    await a.saveResource(
      {
        id: 'staff',
        name: 'Staff',
        active: true,
        weekly: [{ weekday: 5, startMinute: 540, endMinute: 1020 }],
        exceptions: [],
        version: 0,
      },
      0,
      'o',
    );
    await a.saveService(
      {
        id: 'service',
        name: 'Service',
        description: 'Description',
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 15,
        resourceIds: ['staff'],
        active: true,
        version: 0,
      },
      0,
      'o',
    );
    await a.saveSettings(
      {
        enabled: true,
        timezone: 'Etc/UTC',
        heading: 'Book',
        intro: 'Choose a time',
        staffEmails: [],
        minimumNoticeMinutes: 0,
        horizonDays: 30,
        cancellationNoticeMinutes: 0,
        reminderMinutes: 60,
        retentionDays: 30,
        version: 0,
      },
      0,
      'o',
    );
    const input = {
      requestId: 'reserve-000000001',
      visitor: 'v1',
      serviceId: 'service',
      resourceId: 'staff',
      startsAt: '2026-10-16T10:00:00.000Z',
      name: 'Customer',
      email: 'customer@example.test',
      notes: '',
    };
    const results = await Promise.allSettled([
      a.reserve(input),
      b.reserve({ ...input, requestId: 'reserve-000000002', visitor: 'v2' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await b.read()).bookings).toHaveLength(1);
    expect((await b.read()).events).toHaveLength(1);
    const chat = createChat(postgresDocumentStore(pool!, 'chat', initialChat));
    await chat.save(
      {
        enabled: false,
        title: 'Help',
        greeting: 'Hello',
        fallback: 'Contact us',
        followUpLabel: 'Email',
        allowedPaths: ['/'],
        retentionDays: 30,
        questions: [],
      },
      0,
      'o',
    );
    expect(
      (
        await createChat(
          postgresDocumentStore(pool!, 'chat', initialChat),
        ).read()
      ).version,
    ).toBe(1);
    const grants = await pool!.query(
      "select relname,relrowsecurity from pg_class where relname in ('interaction_documents','booking_records','booking_events')",
    );
    expect(grants.rows).toHaveLength(3);
    expect(grants.rows.every((r) => r.relrowsecurity)).toBe(true);
  },
);
