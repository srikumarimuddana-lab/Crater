import { it, expect, beforeEach } from 'vitest';
import { POST as start } from '@/app/api/chat/session/route';
import { POST as message } from '@/app/api/chat/message/route';
import { resetRepositoryForTests } from '@/lib/commerce/repository-factory';
import { getChat } from '@/lib/chat';
beforeEach(() => {
  resetRepositoryForTests();
  process.env.SITE_URL = 'http://localhost:3100';
  process.env.COMMERCE_DB = 'memory';
});
it('rejects foreign origins and does not accept caller-supplied identity', async () => {
  expect(
    (
      await start(
        new Request('http://localhost:3100/api/chat/session', {
          method: 'POST',
          headers: { origin: 'https://evil.test' },
        }),
      )
    ).status,
  ).toBe(403);
  const chat = await getChat();
  await chat.save(
    {
      enabled: true,
      title: 'Help',
      greeting: 'Hello',
      fallback: 'Ask us',
      followUpLabel: 'Follow up',
      allowedPaths: ['/'],
      retentionDays: 30,
      questions: [],
    },
    0,
    'owner',
  );
  await chat.publish(1, 'owner');
  const res = await start(
    new Request('http://localhost:3100/api/chat/session', {
      method: 'POST',
      headers: { origin: process.env.SITE_URL! },
    }),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get('set-cookie')).toContain('HttpOnly');
  const bad = await message(
    new Request('http://localhost:3100/api/chat/message', {
      method: 'POST',
      headers: {
        origin: process.env.SITE_URL!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'another-person',
        requestId: 'request-000000001',
        text: 'help',
      }),
    }),
  );
  expect(bad.status).toBe(401);
});
