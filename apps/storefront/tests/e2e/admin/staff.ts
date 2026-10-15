/** Test-only password accounts for the in-memory Playwright server. */
export const ROLES = ['OWNER', 'ADMIN', 'FULFILMENT', 'BOOKKEEPER', 'SUPPORT'] as const;
export type Role = (typeof ROLES)[number];
export const PROJECT_KEYS: Record<string, string> = { 'mobile-390': 'm', 'tablet-768': 't', 'desktop-1440': 'd' };
export const PASSWORD = 'e2e-only-Password-42';

export type TestStaff = { email: string; name: string; role: Role; password: string };

const make = (email: string, name: string, role: Role): TestStaff => ({
  email,
  name,
  role,
  password: PASSWORD,
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
