import { describe, it, expect } from 'vitest';
import { createMemoryChatStore, createChat } from '@/lib/chat/service';
import { createMemoryOperationsStore } from '@/lib/operations/store';
const config = {
  enabled: true,
  title: 'Help',
  greeting: 'Welcome',
  fallback: 'Please contact our team',
  followUpLabel: 'Email our team',
  allowedPaths: ['/'],
  retentionDays: 30,
  questions: [
    { id: 'hours', label: 'Hours?', answer: 'By appointment', href: '/book' },
  ],
};
describe('guided chat', () => {
  it('publishes separately from drafts and rejects stale versions', async () => {
    const s = createChat(createMemoryChatStore());
    expect(await s.published()).toBeNull();
    await s.save(config, 0, 'owner');
    await s.publish(1, 'owner');
    await s.save({ ...config, greeting: 'Private draft' }, 2, 'owner');
    expect((await s.published())?.greeting).toBe('Welcome');
    await expect(s.save(config, 1, 'owner')).rejects.toThrow('changed');
  });
  it('isolates sessions and makes question retries idempotent', async () => {
    const s = createChat(createMemoryChatStore());
    await s.save(config, 0, 'o');
    await s.publish(1, 'o');
    const a = await s.start(),
      b = await s.start();
    await s.ask(a, 'request-000000001', 'hours');
    await s.ask(a, 'request-000000001', 'hours');
    expect(await s.messages(a)).toHaveLength(2);
    expect(await s.messages(b)).toEqual([]);
    await expect(s.messages('forged')).rejects.toThrow();
    expect(
      (await s.ask(b, 'request-000000002', undefined, 'Unknown')).at(-1)?.body,
    ).toBe(config.fallback);
  });
  it('durably saves handoffs and replays CRM once without exposing private history', async () => {
    const store = createMemoryChatStore(),
      s = createChat(store),
      ops = createMemoryOperationsStore();
    await s.save(config, 0, 'o');
    await s.publish(1, 'o');
    const token = await s.start();
    await s.handoff(token, {
      requestId: 'handoff-000000001',
      name: 'Visitor',
      email: 'person@example.com',
      message: 'Please reply',
    });
    await s.reconcile(ops);
    await s.reconcile(ops);
    expect((await ops.read()).conversations).toHaveLength(1);
    expect((await ops.read()).customers[0].consent).toEqual([]);
    expect(JSON.stringify(await s.messages(token))).not.toContain('orders');
  });
  it('rejects unsafe links and unavailable public chat', async () => {
    const s = createChat(createMemoryChatStore());
    await expect(s.start()).rejects.toThrow('unavailable');
    await expect(
      s.save(
        {
          ...config,
          questions: [{ ...config.questions[0], href: 'javascript:alert(1)' }],
        },
        0,
        'o',
      ),
    ).rejects.toThrow();
  });
});
it('expires the copy of a chat transcript in the CRM inbox without deleting unrelated history', async () => {
  let date = new Date('2026-10-15T00:00:00Z');
  const s = createChat(createMemoryChatStore(), () => date),
    ops = createMemoryOperationsStore();
  await s.save({ ...config, retentionDays: 1 }, 0, 'o');
  await s.publish(1, 'o');
  const token = await s.start();
  await s.handoff(token, {
    requestId: 'handoff-000000002',
    name: 'Private name',
    email: 'private@example.com',
    message: 'Sensitive transcript',
  });
  await s.reconcile(ops);
  await ops.mutate((o) =>
    o.conversations[0].messages.push({
      id: 'unrelated',
      body: 'Keep this staff note',
      direction: 'out',
      at: date.toISOString(),
    }),
  );
  date = new Date('2026-10-17T00:00:00Z');
  await s.retention(ops);
  const msgs = (await ops.read()).conversations[0].messages;
  expect(msgs.some((m) => m.body.includes('Sensitive transcript'))).toBe(false);
  expect(msgs.some((m) => m.id === 'unrelated')).toBe(true);
});
