import { it, expect, beforeEach } from 'vitest';
import { GET as slots } from '@/app/api/booking/slots/route';
import { POST as manage } from '@/app/api/booking/manage/route';
import { resetRepositoryForTests } from '@/lib/commerce/repository-factory';
beforeEach(() => {
  resetRepositoryForTests();
  process.env.SITE_URL = 'http://localhost:3100';
  process.env.COMMERCE_DB = 'memory';
});
it('offers no private records and rejects foreign or forged management requests', async () => {
  const result = await slots(
    new Request(
      'http://localhost:3100/api/booking/slots?date=2026-12-01&serviceId=nope&resourceId=nope',
    ),
  );
  expect(await result.json()).toEqual({ slots: [] });
  expect(result.headers.get('cache-control')).toContain('no-store');
  const r = await manage(
    new Request('http://localhost:3100/api/booking/manage', {
      method: 'POST',
      headers: {
        origin: process.env.SITE_URL!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'exchange', code: 'not-a-token' }),
    }),
  );
  expect(r.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(await r.json())).not.toContain('tokenHash');
});
