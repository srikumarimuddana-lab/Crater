import { describe, expect, it } from 'vitest';
import { V } from '../helpers/harness';
import { REPO_KINDS, closePoolsAfterAll, makeEnv, makeProductPublishable, makeServices, skipUnavailable } from './helpers';
import { REASON_SIGN } from '@/lib/admin/permissions';
import { DEFAULT_TIMEZONE, readAdminConfig } from '@/lib/admin/config';

closePoolsAfterAll();

describe('owner decisions in configuration', () => {
  it('the default store timezone is America/Regina', () => {
    expect(DEFAULT_TIMEZONE).toBe('America/Regina');
    const key = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 251)).toString('base64');
    expect(readAdminConfig({ ADMIN_SECRET_KEY: key }).timezone).toBe('America/Regina');
    expect(readAdminConfig({ ADMIN_SECRET_KEY: key, TIMEZONE: 'America/Toronto' }).timezone).toBe('America/Toronto');
  });
  it('sign rules follow docs/tax.md', () => {
    expect(REASON_SIGN).toEqual({
      RECEIVED: '+', RETURN_RESTOCK: '+', DAMAGED: '-', EXPIRED: '-', SAMPLES_GIFTS: '-', LOST_STOLEN: '-', COUNT_CORRECTION: '±', OTHER: '±',
    });
  });
});

describe.each(REPO_KINDS)('tax-era admin rules (%s repository)', (kind) => {
  const t = skipUnavailable(kind) ? it.skip : it;
  async function setup() {
    const env = await makeEnv(kind);
    return { env, svc: await makeServices(env) };
  }

  t('stock reasons: sign rules, OTHER needs a note, and ledger rows keep the new reasons', async () => {
    const { svc } = await setup();
    svc.as('ADMIN');
    const adj = (reason: string, delta: number, note?: string) => svc.inventory.adjust({ variantId: V.hero30, delta, reason: reason as never, note });
    for (const [reason, wrong] of [['RECEIVED', -1], ['RETURN_RESTOCK', -1], ['DAMAGED', 1], ['EXPIRED', 1], ['SAMPLES_GIFTS', 1], ['LOST_STOLEN', 1]] as const) {
      expect(await adj(reason, wrong), reason).toMatchObject({ data: null, userErrors: [{ code: 'INVALID', field: ['delta'] }] });
    }
    expect(await adj('EXPIRED', -2)).toMatchObject({ data: { reason: 'EXPIRED', delta: -2, availableAfter: 38 } });
    expect(await adj('SAMPLES_GIFTS', -1)).toMatchObject({ data: { reason: 'SAMPLES_GIFTS', availableAfter: 37 } });
    expect(await adj('LOST_STOLEN', -1)).toMatchObject({ data: { availableAfter: 36 } });
    expect(await adj('COUNT_CORRECTION', 4)).toMatchObject({ data: { availableAfter: 40 } });
    expect(await adj('COUNT_CORRECTION', -3)).toMatchObject({ data: { availableAfter: 37 } });
    expect(await adj('OTHER', -1)).toMatchObject({ userErrors: [{ code: 'INVALID', field: ['note'] }] });
    expect(await adj('OTHER', 1, 'found one')).toMatchObject({ data: { reason: 'OTHER', availableAfter: 38 } });
    expect(await adj('NONSENSE', 1)).toMatchObject({ userErrors: [{ code: 'INVALID', field: ['reason'] }] });
    expect((await svc.inventory.movements({ variantId: V.hero30 })).nodes.map((m) => m.reason)).toContain('LOST_STOLEN');
  });

  t('Fulfilment may use RECEIVED, COUNT_CORRECTION, DAMAGED and EXPIRED only', async () => {
    const { svc } = await setup();
    svc.as('FULFILMENT');
    for (const [reason, delta] of [['RECEIVED', 1], ['COUNT_CORRECTION', -1], ['DAMAGED', -1], ['EXPIRED', -1]] as const) {
      expect((await svc.inventory.adjust({ variantId: V.hero30, delta, reason })).userErrors, reason).toEqual([]);
    }
    for (const [reason, delta] of [['RETURN_RESTOCK', 1], ['SAMPLES_GIFTS', -1], ['LOST_STOLEN', -1], ['OTHER', 1]] as const) {
      expect(await svc.inventory.adjust({ variantId: V.hero30, delta, reason, note: 'because' }), reason).toMatchObject({ userErrors: [{ code: 'FORBIDDEN', field: ['reason'] }] });
    }
  });

  t('HAS_COST: every sellable variant needs a cost before a product can go live', async () => {
    const { env, svc } = await setup();
    svc.as('ADMIN');
    const sample = (await svc.products.get('gid://crater/Product/11'))!;
    expect(sample.publishChecks.find((c) => c.key === 'HAS_COST')?.passed).toBe(true); // sample costs are seeded
    const id = await makeProductPublishable(env, 'peppermint-ginger-extract');
    const draft = (await svc.products.get(id))!;
    expect(draft.publishChecks.find((c) => c.key === 'HAS_COST')?.passed).toBe(true);
    const cleared = await svc.products.update({ id, expectedUpdatedAt: draft.updatedAt, variants: [{ id: draft.variants[0].id, cost: null }] });
    expect(cleared.userErrors).toEqual([]);
    const cur = (await svc.products.get(id))!;
    expect(cur.publishChecks.filter((c) => !c.passed).map((c) => c.key)).toEqual(['HAS_COST']);
    const blocked = await svc.products.setStatus({ id, status: 'ACTIVE', expectedUpdatedAt: cur.updatedAt });
    expect(blocked.userErrors).toMatchObject([{ code: 'PUBLISH_BLOCKED' }]);
    expect(blocked.userErrors[0].message).toContain('HAS_COST');
    const fixed = await svc.products.update({ id, expectedUpdatedAt: cur.updatedAt, variants: [{ id: cur.variants[0].id, cost: '8.00' }] });
    expect(fixed.userErrors).toEqual([]);
    const next = (await svc.products.get(id))!;
    expect((await svc.products.setStatus({ id, status: 'ACTIVE', expectedUpdatedAt: next.updatedAt })).data!.status).toBe('ACTIVE');
  });

  t('sample costs are about 30-40% of price on every seeded variant', async () => {
    const { env } = await setup();
    const products = await env.h.repo.listProducts({ includeInactive: true });
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(p.sample).toBe(true);
      for (const v of p.variants) {
        expect(v.costMinor, v.sku).not.toBeNull();
        const ratio = (v.costMinor as number) / v.priceMinor;
        expect(ratio, v.sku).toBeGreaterThanOrEqual(0.3);
        expect(ratio, v.sku).toBeLessThanOrEqual(0.4);
      }
    }
  });

  t('settings.get: read-only, needs overview:read, reports the store timezone and the tax table', async () => {
    const { svc } = await setup();
    svc.as(null);
    await expect(svc.settings.get()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    svc.as('FULFILMENT');
    await expect(svc.settings.get()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const role of ['OWNER', 'ADMIN', 'BOOKKEEPER', 'SUPPORT'] as const) {
      svc.as(role);
      const s = await svc.settings.get();
      expect(s).toMatchObject({ timezone: 'America/Regina', currency: 'CAD', tax: { registrations: ['CA_GST', 'SK_PST'] } });
      expect(s.tax.provinces.find((p) => p.code === 'ON')!.lines).toEqual([{ key: 'CA_HST_ON', title: 'HST (Ontario)', ratePercent: '13' }]);
    }
  });
});
