import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_KEYS, sessionStaff, type Role, type TestStaff } from './staff';
import { totpCode } from './totp';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Complete the real sign-in UI: password, then the TOTP code (retrying on the next 30 s step if this one was used). */
export async function signInUi(page: Page, staff: TestStaff) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(staff.email);
  await page.getByLabel('Password').fill(staff.password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByLabel('6-digit code').fill(totpCode(staff.totpSecret));
    await page.getByRole('button', { name: 'Sign in' }).click();
    try {
      await page.waitForURL((u) => !u.pathname.endsWith('/admin/mfa'), { timeout: 8000 });
      return;
    } catch {
      // A code (or a later one) was already used for this account: wait for the next time step.
      await sleep(30_000 - (Date.now() % 30_000) + 300);
    }
  }
  throw new Error(`could not sign in as ${staff.email}`);
}

const authDir = path.join(process.cwd(), 'test-results', '.admin-auth');
const validated = new Set<string>();

async function validState(browser: Browser, baseURL: string, file: string): Promise<boolean> {
  const ctx = await browser.newContext({ baseURL, storageState: file });
  try {
    const res = await ctx.request.get('/admin/403', { maxRedirects: 0 });
    return res.status() === 200;
  } finally {
    await ctx.close();
  }
}

/**
 * One signed-in storage state per (role, viewport project), created once per run by whichever worker needs it
 * first (a TOTP step can be used once per account, so concurrent sign-ins would collide).
 */
async function ensureSession(browser: Browser, baseURL: string, role: Role, projectName: string): Promise<string> {
  fs.mkdirSync(authDir, { recursive: true });
  const key = `${role}-${PROJECT_KEYS[projectName] ?? 'x'}`;
  const file = path.join(authDir, `${key}.json`);
  const lock = `${file}.lock`;
  if (validated.has(key) && fs.existsSync(file)) return file;
  for (let i = 0; i < 400; i++) {
    if (fs.existsSync(file) && !fs.existsSync(lock)) {
      if (await validState(browser, baseURL, file)) {
        validated.add(key);
        return file;
      }
      fs.rmSync(file, { force: true }); // stale: the server restarted since it was saved
    }
    try {
      fs.mkdirSync(lock);
    } catch {
      await sleep(250);
      continue;
    }
    try {
      if (!fs.existsSync(file)) {
        const ctx = await browser.newContext({ baseURL });
        const page = await ctx.newPage();
        await signInUi(page, sessionStaff(role, projectName));
        await ctx.storageState({ path: file });
        await ctx.close();
      }
    } finally {
      fs.rmSync(lock, { recursive: true, force: true });
    }
  }
  throw new Error(`session for ${key} was not created`);
}

type Fixtures = { role: Role | null };

/** `test.use({ role: 'FULFILMENT' })` signs the test in as that role (per-project account, cached session). */
export const test = base.extend<Fixtures>({
  role: [null, { option: true }],
  storageState: async ({ role, browser, baseURL }, provide, testInfo) => {
    if (!role) return provide(undefined);
    await provide(await ensureSession(browser, baseURL as string, role, testInfo.project.name));
  },
});
export { expect };

/** Below 1024px the sidebar is behind a Menu button. */
export async function openNav(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) {
    if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
  }
  return page.getByRole('navigation', { name: 'Main' });
}

export async function serious(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

export const projectKey = (name: string) => PROJECT_KEYS[name] ?? 'x';
