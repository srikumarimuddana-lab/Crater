import 'server-only';
import type { Store } from './store';
import type { BookingState, Booking } from '@/lib/booking/types';
import type { ChatState } from '@/lib/chat/types';
export function interactionReport(
  bookings: Booking[],
  mode: 'test' | 'live',
  from: string,
  to: string,
) {
  const rows = bookings.filter(
    (b) =>
      b.mode === mode &&
      b.startsAt.slice(0, 10) >= from &&
      b.startsAt.slice(0, 10) <= to,
  );
  return {
    confirmed: rows.filter((b) => b.status === 'confirmed').length,
    cancelled: rows.filter((b) => b.status === 'cancelled').length,
    completed: rows.filter((b) => b.status === 'completed').length,
    noShow: rows.filter((b) => b.status === 'no_show').length,
  };
}
const scrub = (b: Booking, at: string) => {
  b.name = 'Anonymized customer';
  b.email = '[removed]';
  b.notes = '';
  b.tokenHash = '';
  b.encryptedToken = '';
  b.tokenExpiresAt = at;
  b.anonymizedAt = at;
};
export async function anonymizeInteractionStores(
  bookings: Store<BookingState>,
  chat: Store<ChatState>,
  customerIds: string[],
  emails: string[],
  now = () => new Date(),
  bookingIds: string[] = [],
) {
  const at = now().toISOString(),
    ids = await bookings.mutate((s) => {
      const affected = new Set(
        s.bookings
          .filter(
            (b) =>
              bookingIds.includes(b.id) ||
              (b.customerId && customerIds.includes(b.customerId)) ||
              emails.includes(b.email),
          )
          .map((b) => b.id),
      );
      for (const b of s.bookings) if (affected.has(b.id)) scrub(b, at);
      for (const e of s.events)
        if (affected.has(e.bookingId)) scrub(e.snapshot, at);
      for (const r of s.requests)
        if (affected.has(r.bookingId)) scrub(r.result, at);
      s.audit.push({
        actor: 'privacy-worker',
        action: 'booking.anonymized',
        target: String(affected.size),
        at,
      });
      return [...affected];
    });
  await chat.mutate((s) => {
    const sessionIds = new Set(
      s.handoffs
        .filter(
          (h) =>
            (h.customerId && customerIds.includes(h.customerId)) ||
            emails.includes(h.email),
        )
        .map((h) => h.sessionId),
    );
    s.sessions = s.sessions.filter((v) => !sessionIds.has(v.id));
    s.handoffs = s.handoffs.filter((h) => !sessionIds.has(h.sessionId));
  });
  return ids;
}
