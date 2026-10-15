import { InteractionError } from './validation';
import {
  SubmissionError,
  isJsonSubmission,
} from '@/lib/communications/public-forms';
export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};
export function cookie(request: Request, name: string) {
  const value = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  try {
    return value ? decodeURIComponent(value) : '';
  } catch {
    return '';
  }
}
export function setCookie(name: string, value: string, maxAge = 604800) {
  const secure = (process.env.SITE_URL ?? '').startsWith('https:');
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
export const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, { status, headers: { ...privateHeaders, ...headers } });
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function errorResponse(
  request: Request,
  error: unknown,
  back = '/book',
) {
  const known =
      error instanceof InteractionError || error instanceof SubmissionError,
    status = known ? error.status : 503,
    message = known
      ? error.message
      : 'We could not complete this request. Please try again shortly.';
  if (
    isJsonSubmission(request) ||
    request.headers.get('accept')?.includes('application/json')
  )
    return json({ error: message }, status);
  return new Response(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Request not completed</title></head><body><main style="max-width:38rem;margin:10vh auto;padding:2rem;font:18px/1.6 system-ui"><h1>Request not completed</h1><p role="alert">${escape(message)}</p><p>Use your browser's Back button to keep the details you entered.</p><a href="${escape(back)}">Return to the form</a></main></body></html>`,
    {
      status,
      headers: {
        ...privateHeaders,
        'Content-Type': 'text/html;charset=utf-8',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
export function redirectPrivate(path: string, cookies: string[] = []) {
  const headers = new Headers({ ...privateHeaders, Location: path });
  cookies.forEach((c) => headers.append('Set-Cookie', c));
  return new Response(null, { status: 303, headers });
}
