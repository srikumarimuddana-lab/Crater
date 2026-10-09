import { createHash } from 'node:crypto';
import { base32Encode } from './totp';

/**
 * TEST-ONLY staff for the e2e web server (ADMIN_DEV_STAFF, COMMERCE_DB=memory). Single source for
 * playwright.config.ts and the specs. Secrets are derived from the email, so they are fixed and worthless.
 *
 * Why so many accounts: a TOTP step can be used once per staff member, and the three viewport projects run in
 * parallel against one server. Every (role, project) pair gets its own account, plus one extra owner per
 * project for the interactive sign-in specs.
 */
export const ROLES = ['OWNER', 'ADMIN', 'FULFILMENT', 'BOOKKEEPER', 'SUPPORT'] as const;
export type Role = (typeof ROLES)[number];
export const PROJECT_KEYS: Record<string, string> = { 'mobile-390': 'm', 'tablet-768': 't', 'desktop-1440': 'd' };
export const PASSWORD = 'e2e-only-Password-42';

export type TestStaff = { email: string; name: string; role: Role; password: string; totpSecret: string };

const make = (email: string, name: string, role: Role): TestStaff => ({
  email,
  name,
  role,
  password: PASSWORD,
  totpSecret: base32Encode(createHash('sha256').update(`crater-e2e-totp:${email}`).digest().subarray(0, 20)),
});

export const sessionStaff = (role: Role, projectName: string): TestStaff => {
  const key = PROJECT_KEYS[projectName] ?? 'x';
  return make(`${role.toLowerCase()}.${key}@example.test`, `Test ${role.toLowerCase()} ${key}`, role);
};
/** Owner used by the sign-in / sign-out specs (they complete the real UI flow). */
export const uiOwner = (projectName: string): TestStaff => {
  const key = PROJECT_KEYS[projectName] ?? 'x';
  return make(`ui.owner.${key}@example.test`, `Test UI owner ${key}`, 'OWNER');
};

export function allTestStaff(): TestStaff[] {
  const out: TestStaff[] = [];
  for (const project of Object.keys(PROJECT_KEYS)) {
    for (const role of ROLES) out.push(sessionStaff(role, project));
    out.push(uiOwner(project));
  }
  return out;
}

/** TEST-ONLY 32 random bytes, base64 (crypto.randomBytes). Never reuse outside the e2e server. */
export const TEST_ADMIN_SECRET_KEY = 'sifyS8rGnJG+PY46Mxj0ju+I9R7+R92px+6ReMfUivo=';
