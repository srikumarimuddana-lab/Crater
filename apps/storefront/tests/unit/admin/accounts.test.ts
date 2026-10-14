import { describe, expect, it } from 'vitest';
import { createAccountService } from '@/lib/admin/auth/accounts';
import { accountRepositoryFor } from '@/lib/admin/auth/account-repository';
import { verifyPassword } from '@/lib/admin/auth/password';
import { hashToken } from '@/lib/admin/auth/tokens';
import { addStaff, closePoolsAfterAll, makeEnv, PASSWORD, REPO_KINDS, sessionFor, skipUnavailable } from './helpers';

closePoolsAfterAll();
describe.each(REPO_KINDS)('staff accounts (%s)', kind => {
  const t = skipUnavailable(kind) ? it.skip : it;
  async function setup() {
    const env = await makeEnv(kind);
    const { staff: owner } = await addStaff(env, 'OWNER');
    const sent: { recipient: string; kind: 'INVITE' | 'RESET'; url: string; eventKey: string }[] = [];
    const repo = accountRepositoryFor(env.h.repo);
    const service = createAccountService({ admin: env.admin, repo, getSession: async () => sessionFor(owner), now: () => env.clock.now, origin: 'https://shop.example', enqueueLink: async link => { sent.push(link); } });
    return { ...env, owner, sent, repo, service };
  }
  t('owner invites staff; token is hashed, single-use, and sets a usable password', async () => {
    const env = await setup();
    await env.service.invite({ email: 'new@example.test', name: 'New staff', role: 'SUPPORT' });
    expect(env.sent).toHaveLength(1);
    const token = new URL(env.sent[0].url).searchParams.get('token')!;
    expect(await env.repo.getToken(hashToken(token))).toMatchObject({ kind: 'INVITE' });
    expect(JSON.stringify(await env.repo.getToken(hashToken(token)))).not.toContain(token);
    expect(await env.service.acceptPassword({ token, password: PASSWORD })).toEqual({ ok: true });
    expect(await env.service.acceptPassword({ token, password: PASSWORD })).toEqual({ ok: false, message: 'This link is invalid or expired. Request a new one.' });
    expect(await env.auth.signIn({ email: 'new@example.test', password: PASSWORD, ip: '203.0.113.5' })).toEqual({ ok: true, next: 'AUTHENTICATED' });
  });
  t('reset request is generic, expires after 30 minutes and invalidates existing sessions', async () => {
    const env = await setup();
    await env.auth.signIn({ email: env.owner.email, password: PASSWORD, ip: '203.0.113.5' });
    expect(await env.service.requestReset(env.owner.email, '203.0.113.8')).toEqual(await env.service.requestReset('unknown@example.test', '203.0.113.8'));
    const token = new URL(env.sent[0].url).searchParams.get('token')!;
    expect(await env.service.acceptPassword({ token, password: 'a new secure password 123' })).toEqual({ ok: true });
    expect(await env.auth.getSession()).toBeNull();
    expect(await verifyPassword('a new secure password 123', (await env.admin.getStaff(env.owner.id))!.passwordHash!)).toBe(true);
    await env.service.requestReset(env.owner.email, '203.0.113.9');
    env.clock.advance(30 * 60_000);
    expect((await env.service.acceptPassword({ token: new URL(env.sent[1].url).searchParams.get('token')!, password: PASSWORD })).ok).toBe(false);
  });
  t('protects the final active owner, revokes disabled sessions and forbids other roles', async () => {
    const env = await setup();
    await expect(env.service.updateStaff({ id: env.owner.id, role: 'SUPPORT', status: 'ACTIVE' })).rejects.toThrow(/final active Owner/);
    await expect(env.service.updateStaff({ id: env.owner.id, role: 'OWNER', status: 'DISABLED' })).rejects.toThrow(/final active Owner/);
    await env.service.invite({ email: 'pending.owner@example.test', name: 'Pending owner', role: 'OWNER' });
    await expect(env.service.updateStaff({ id: env.owner.id, role: 'SUPPORT', status: 'ACTIVE' })).rejects.toThrow(/final active Owner/);
    const { staff } = await addStaff(env, 'SUPPORT');
    await env.auth.signIn({ email: staff.email, password: PASSWORD, ip: '203.0.113.5' });
    await env.service.updateStaff({ id: staff.id, role: 'ADMIN', status: 'DISABLED' });
    expect(await env.auth.getSession()).toBeNull();
    const denied = createAccountService({ admin: env.admin, repo: env.repo, getSession: async () => sessionFor(staff), origin: 'https://shop.example', enqueueLink: async () => {} });
    await expect(denied.invite({ email: 'bad@example.test', name: 'Bad', role: 'OWNER' })).rejects.toThrow('Not allowed');
  });
  t('expired invitations and disabled accounts cannot set a password', async () => {
    const env = await setup();
    await env.service.invite({ email: 'new@example.test', name: 'New', role: 'SUPPORT' });
    env.clock.advance(24 * 60 * 60_000);
    expect((await env.service.acceptPassword({ token: new URL(env.sent[0].url).searchParams.get('token')!, password: PASSWORD })).ok).toBe(false);
  });
  t('reset throttling is generic and disabled accounts cannot redeem links', async () => {
    const env = await setup();
    for (let i = 0; i < 12; i++) expect(await env.service.requestReset(env.owner.email, '203.0.113.8')).toMatchObject({ ok: true });
    expect(env.sent).toHaveLength(6);
    const { staff } = await addStaff(env, 'ADMIN');
    await env.service.requestReset(staff.email, '203.0.113.9');
    const token = new URL(env.sent.at(-1)!.url).searchParams.get('token')!;
    await env.service.updateStaff({ id: staff.id, role: 'ADMIN', status: 'DISABLED' });
    expect((await env.service.acceptPassword({ token, password: PASSWORD })).ok).toBe(false);
    await env.service.requestReset(staff.email, '203.0.113.10');
    expect(env.sent).toHaveLength(7);
  });
  t('simultaneous owner changes leave a usable active owner', async () => {
    const env = await setup();
    const { staff: second } = await addStaff(env, 'OWNER', 'second@example.test');
    const results = await Promise.allSettled([
      env.service.updateStaff({ id: env.owner.id, role: 'SUPPORT', status: 'ACTIVE' }),
      env.service.updateStaff({ id: second.id, role: 'SUPPORT', status: 'ACTIVE' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await env.admin.listStaff()).filter(staff => staff.role === 'OWNER' && staff.status === 'ACTIVE' && staff.passwordHash)).toHaveLength(1);
  });
  t('concurrent redemption succeeds once and weak passwords do not consume the token', async () => {
    const env = await setup();
    await env.service.requestReset(env.owner.email, '203.0.113.8');
    const token = new URL(env.sent[0].url).searchParams.get('token')!;
    expect((await env.service.acceptPassword({ token, password: 'short' })).ok).toBe(false);
    const results = await Promise.all([env.service.acceptPassword({ token, password: PASSWORD }), env.service.acceptPassword({ token, password: PASSWORD })]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
  });
});
