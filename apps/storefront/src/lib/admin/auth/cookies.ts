/**
 * Cookie access for the sign-in provider. Kept behind a tiny interface so the provider can be unit-tested
 * without Next.js; `nextCookieJar` adapts `next/headers`.
 *
 * Both cookies are HttpOnly, SameSite=Strict, Path=/. With Secure on they carry the `__Host-` prefix (the
 * browser then also refuses a Domain attribute or a non-root path); on plain http (local development) the
 * prefix is dropped because browsers reject `__Host-` cookies that are not Secure.
 */
export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, options: { maxAgeSeconds: number }): void;
  delete(name: string): void;
}

export type CookieNames = { session: string; pending: string };

export const cookieNames = (secure: boolean): CookieNames =>
  secure ? { session: '__Host-crater_admin', pending: '__Host-crater_admin_pending' } : { session: 'crater_admin', pending: 'crater_admin_pending' };

export async function nextCookieJar(secure: boolean): Promise<CookieJar> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const base = { httpOnly: true, sameSite: 'strict' as const, path: '/', secure };
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, { maxAgeSeconds }) => store.set(name, value, { ...base, maxAge: maxAgeSeconds }),
    delete: (name) => store.set(name, '', { ...base, maxAge: 0, expires: new Date(0) }),
  };
}
