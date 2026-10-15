import { it, expect } from 'vitest';
import { createMemoryBookingStore } from '@/lib/booking/service';
import { createMemoryChatStore } from '@/lib/chat/service';
import {
  anonymizeInteractionStores,
  interactionReport,
} from '@/lib/public-interactions/privacy';
it('erases linked interaction contact and management tokens while preserving aggregate counts', async () => {
  const bookings = createMemoryBookingStore(),
    chat = createMemoryChatStore();
  await bookings.mutate((s) => {
    s.bookings.push({
      id: 'b',
      customerId: 'c',
      name: 'Person',
      email: 'person@example.com',
      notes: 'private',
      tokenHash: 'secret',
      encryptedToken: 'secret',
      anonymizedAt: undefined,
      status: 'completed',
      mode: 'test',
      startsAt: '2026-10-01T00:00:00Z',
    } as never);
  });
  await anonymizeInteractionStores(
    bookings,
    chat,
    ['c'],
    ['person@example.com'],
  );
  const b = (await bookings.read()).bookings[0];
  expect(b.name).toBe('Anonymized customer');
  expect(b.tokenHash).toBe('');
  expect(b.notes).toBe('');
  expect(
    interactionReport(
      (await bookings.read()).bookings,
      'test',
      '2026-10-01',
      '2026-10-31',
    ).completed,
  ).toBe(1);
  expect(
    JSON.stringify(
      interactionReport(
        (await bookings.read()).bookings,
        'live',
        '2026-10-01',
        '2026-10-31',
      ),
    ),
  ).not.toContain('email');
});
it('retains future reservations for the same email when an older appointment expires', async () => {
  const bookings = createMemoryBookingStore(),
    chat = createMemoryChatStore();
  await bookings.mutate((s) => {
    for (const id of ['old', 'future'])
      s.bookings.push({
        id,
        email: 'same@example.com',
        name: 'Person',
        notes: 'Keep future notes',
        tokenHash: 'secret',
        encryptedToken: 'secret',
      } as never);
  });
  await anonymizeInteractionStores(bookings, chat, [], [], () => new Date(), [
    'old',
  ]);
  expect(
    (await bookings.read()).bookings.find((b) => b.id === 'future')?.name,
  ).toBe('Person');
  expect(
    (await bookings.read()).bookings.find((b) => b.id === 'old')?.name,
  ).toBe('Anonymized customer');
});
it('does not reconstruct anonymized CRM contact from a stale chat reconciliation snapshot', async () => {
  const { createCrm } = await import('@/lib/crm/service');
  const { createMemoryOperationsStore } = await import(
    '@/lib/operations/store'
  );
  const ops = createMemoryOperationsStore(),
    crm = createCrm(ops, () => new Date('2026-10-15T12:00:00Z'));
  await crm.inbound({
    eventId: 'initial',
    channel: 'email',
    recipient: 'private@example.com',
    subject: 'Contact',
    body: 'Private',
  });
  const id = (await ops.read()).customers[0].id;
  await crm.anonymize(id, 'owner');
  await crm.inbound({
    eventId: 'chat-handoff:delayed',
    channel: 'email',
    recipient: 'private@example.com',
    subject: 'Delayed',
    body: 'Old private message',
    occurredAt: '2026-10-14T00:00:00Z',
  });
  expect(
    (await ops.read()).customers.some((c) => c.email === 'private@example.com'),
  ).toBe(false);
  expect(
    (await ops.read()).conversations.some((c) =>
      c.messages.some((m) => m.body === 'Old private message'),
    ),
  ).toBe(false);
});
it('removes personal data from email subjects during customer anonymization', async () => {
  const { createCrm } = await import('@/lib/crm/service');
  const { createMemoryOperationsStore } = await import(
    '@/lib/operations/store'
  );
  const ops = createMemoryOperationsStore(),
    crm = createCrm(ops);
  await crm.inbound({
    eventId: 'contact',
    channel: 'email',
    recipient: 'private@example.com',
    subject: 'Private person',
    body: 'Message',
  });
  const id = (await ops.read()).customers[0].id;
  await ops.mutate((o) => {
    o.jobs.push({
      id: 'j',
      customerId: id,
      subject: 'Private person appointment',
      body: 'Private body',
      recipient: 'private@example.com',
      status: 'pending',
    } as never);
  });
  await crm.anonymize(id, 'owner');
  expect((await ops.read()).jobs[0].subject).toBe('[removed]');
});
it('blocks old booking outbox content atomically while allowing later intentional contact', async () => {
  const { createCommunications } = await import('@/lib/communications/service');
  const { createCrm } = await import('@/lib/crm/service');
  const { createMemoryOperationsStore } = await import(
    '@/lib/operations/store'
  );
  const { hash } = await import('@/lib/public-interactions/validation');
  const ops = createMemoryOperationsStore();
  await ops.mutate((o) => {
    o.interactionPrivacy = [
      { emailHash: hash('private@example.com'), at: '2026-10-15T00:00:00Z' },
    ];
    o.templates.push({
      key: 'booking_confirmed',
      channel: 'email',
      subject: 'Hello {{name}}',
      body: '{{name}}',
      version: 1,
      updatedAt: '2026-10-01T00:00:00Z',
    });
  });
  const job = await createCommunications(ops).enqueueNotification({
    eventKey: 'stale-event',
    channel: 'email',
    recipient: 'staff@example.com',
    templateKey: 'booking_confirmed',
    variables: { name: 'Private person' },
    mode: 'test',
    source: {
      kind: 'booking',
      id: 'old',
      version: 1,
      event: 'confirmed',
      emailHash: hash('private@example.com'),
      createdAt: '2026-10-14T00:00:00Z',
    },
  });
  expect(job.status).toBe('suppressed');
  expect(job.body).toBe('[removed]');
  expect(job.subject).not.toContain('Private person');
  await createCrm(ops).inbound({
    eventId: 'new-intentional-contact',
    channel: 'email',
    recipient: 'private@example.com',
    subject: 'New request',
    body: 'New message',
    occurredAt: '2026-10-16T00:00:00Z',
  });
  expect(
    (await ops.read()).customers.some((c) => c.email === 'private@example.com'),
  ).toBe(true);
});
it('does not retain a customer email in a late suppressed outbox record',async()=>{const {createCommunications}=await import('@/lib/communications/service');const {createMemoryOperationsStore}=await import('@/lib/operations/store');const {hash}=await import('@/lib/public-interactions/validation');const ops=createMemoryOperationsStore();await ops.mutate(o=>{o.interactionPrivacy=[{emailHash:hash('private@example.com'),at:'2026-10-15T00:00:00Z'}];});const j=await createCommunications(ops).enqueueNotification({eventKey:'late-customer',channel:'email',recipient:'private@example.com',templateKey:'support_reply',variables:{message:'private'},mode:'test',source:{kind:'booking',id:'b',version:1,event:'confirmed',emailHash:hash('private@example.com'),createdAt:'2026-10-14T00:00:00Z'}});expect(j.recipient).toBe('[removed]');});
