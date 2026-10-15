import { createHash, randomBytes } from 'node:crypto';
export class InteractionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
export function text(value: unknown, max: number, optional = false): string {
  if (typeof value !== 'string')
    throw new InteractionError('Enter valid text.');
  const s = value.trim();
  if (
    (!s && !optional) ||
    s.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)
  )
    throw new InteractionError(
      `Enter ${optional ? 'up to' : 'between 1 and'} ${max} characters.`,
    );
  return s;
}
export function integer(n: unknown, min: number, max: number) {
  if (!Number.isSafeInteger(n) || Number(n) < min || Number(n) > max)
    throw new InteractionError(
      `Enter a whole number between ${min} and ${max}.`,
    );
  return n as number;
}
export function requestKey(v: unknown) {
  const s = text(v, 100);
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(s))
    throw new InteractionError('Invalid request reference.');
  return s;
}
export function publicLink(value: string) {
  if (
    !/^\/(?!\/)/.test(value) ||
    /[\\\s#?]/.test(value) ||
    /^\/(admin|api|book\/manage)(\/|$)/.test(value)
  )
    throw new InteractionError('Choose a public page path on this site.');
  return value;
}
