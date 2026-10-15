/** Fixed vocabulary: no DOM text, form values, URL queries or arbitrary metadata. */
export const CLIENT_EVENTS = ['page_view', 'product_view', 'collection_view', 'cta_click', 'add_to_cart'] as const;
export type ClientEventName = typeof CLIENT_EVENTS[number];
export type EventName = ClientEventName | 'begin_checkout' | 'purchase';
export const CLICK_IDS = ['home.hero.shop', 'home.hero.story', 'home.ritual.shop', 'home.journal.read', 'nav.shop', 'nav.about', 'nav.cart', 'product.add_to_cart', 'cart.checkout', 'footer.contact', 'footer.newsletter','chat.open','booking.start'] as const;
export type ClickId = typeof CLICK_IDS[number];
export type Device = 'mobile' | 'tablet' | 'desktop';
export type Source = 'direct' | 'search' | 'social' | 'email' | 'referral' | 'internal';
export type Mode = 'fixture' | 'stripe-test' | 'stripe-live';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CONSENT_COOKIE = 'crater_analytics';
export const SESSION_COOKIE = 'crater_analytics_session';
const STATIC_PATHS = new Set(['/chat', '/book', '/', '/about', '/cart', '/checkout/success', '/contact', '/journal', '/shipping-returns', '/ingredients-sourcing', '/privacy', '/terms', '/collections']);
/** Dynamic resources are grouped, preventing user-chosen slugs becoming personal data. */
export function analyticsPath(path: string): string | null {
  if (path.includes('?') || path.includes('#') || path.length > 200) return null;
  if (STATIC_PATHS.has(path)) return path;
  if (/^\/products\/[^/]+$/.test(path)) return '/products/[product]';
  if (/^\/collections\/[^/]+$/.test(path)) return '/collections/[collection]';
  if (/^\/journal\/[^/]+$/.test(path)) return '/journal/[article]';
  return null;
}
export type ClientEvent = { id: string; sessionId: string; consent: true; name: ClientEventName; path: string; device: Device; source: Source; clickId: ClickId | null };
export type StoredEvent = Omit<ClientEvent, 'name' | 'consent'> & { name: EventName; mode: Mode; occurredAt: string; orderId: number | null };
export type Validation = { ok: true; event: ClientEvent } | { ok: false; error: string };
export function validateEvent(value: unknown): Validation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Invalid event.' };
  const v = value as Record<string, unknown>;
  const keys = ['id', 'sessionId', 'consent', 'name', 'path', 'device', 'source', 'clickId'];
  if (Object.keys(v).some(k => !keys.includes(k))) return { ok: false, error: 'Unknown event field.' };
  if (v.consent !== true) return { ok: false, error: 'Analytics consent is required.' };
  if (typeof v.id !== 'string' || !UUID.test(v.id) || typeof v.sessionId !== 'string' || !UUID.test(v.sessionId)) return { ok: false, error: 'Invalid anonymous identifier.' };
  if (!CLIENT_EVENTS.includes(v.name as ClientEventName)) return { ok: false, error: 'Unknown event name.' };
  if (typeof v.path !== 'string' || analyticsPath(v.path) !== v.path) return { ok: false, error: 'Unsupported page.' };
  if (!['mobile', 'tablet', 'desktop'].includes(String(v.device)) || !['direct', 'search', 'social', 'email', 'referral', 'internal'].includes(String(v.source))) return { ok: false, error: 'Invalid dimensions.' };
  if (v.clickId !== null && v.clickId !== undefined && !CLICK_IDS.includes(v.clickId as ClickId)) return { ok: false, error: 'Unknown click identifier.' };
  if (v.name === 'cta_click' && !v.clickId) return { ok: false, error: 'Click identifier is required.' };
  return { ok: true, event: { id: v.id, sessionId: v.sessionId, consent: true, name: v.name as ClientEventName, path: v.path, device: v.device as Device, source: v.source as Source, clickId: (v.clickId as ClickId | undefined) ?? null } };
}
export function coarseSource(referrer: string, origin: string): Source {
  if (!referrer) return 'direct';
  try {
    const u = new URL(referrer);
    if (u.origin === origin) return 'internal';
    if (/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(u.hostname)) return 'search';
    if (/(^|\.)(facebook\.com|instagram\.com|t\.co|pinterest\.com|linkedin\.com)$/.test(u.hostname)) return 'social';
    return 'referral';
  } catch { return 'direct'; }
}
