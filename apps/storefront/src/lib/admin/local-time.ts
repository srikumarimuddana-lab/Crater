/** Store-timezone date maths with Intl only (no dependency). Dates are 'YYYY-MM-DD' strings. */

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(tz, f);
  }
  return f;
}

function wallParts(ms: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}

/** Local calendar date of an instant in `tz`. */
export function localDate(ms: number, tz: string): string {
  const p = wallParts(ms, tz);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Offset of `tz` from UTC at an instant, in ms (positive east). */
function offsetAt(ms: number, tz: string): number {
  const p = wallParts(ms, tz);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instant a local calendar day begins in `tz` (handles DST transitions). */
export function startOfLocalDay(date: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetAt(guess, tz);
  const second = guess - offsetAt(first, tz);
  return new Date(second);
}
