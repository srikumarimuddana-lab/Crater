import 'server-only';
import { getChat, getChatStore } from '@/lib/chat';
import { getBookingStore } from '@/lib/booking';
import { getOperationsStore } from '@/lib/operations/store';
import { reconcileBooking } from '@/lib/booking/notifications';
import { anonymizeInteractionStores } from './privacy';
import { getRepository } from '@/lib/commerce/repository-factory';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
export async function runInteractionMaintenance() {
  const operations = await getOperationsStore(),
    booking = await getBookingStore(),
    chatStore = await getChatStore(),
    chat = await getChat();
  for (const r of (await operations.read()).privacyRequests ?? []) {
    if (r.status === 'complete') continue;
    const ids = await anonymizeInteractionStores(
      booking,
      chatStore,
      r.customerIds,
      r.emails,
    );
    await operations.mutate((s) => {
      for (const job of s.jobs)
        if (job.source?.kind === 'booking' && ids.includes(job.source.id)) {
          job.recipient = '[removed]';
          job.body = '[removed]';
          job.subject = '[removed]';
          if (job.status === 'pending') job.status = 'suppressed';
        }
      const request = s.privacyRequests?.find((v) => v.id === r.id);
      if (request) {
        request.status = 'complete';
        request.emails = [];
      }
    });
  }
  const handoffs = await chat.reconcile(operations),
    notifications = await reconcileBooking(booking, operations),
    chatDeleted = await chat.retention(operations);
  const s = await booking.read(),
    expired = s.bookings.filter(
      (b) =>
        !b.anonymizedAt &&
        Date.parse(b.endsAt) + s.settings.retentionDays * 86400000 < Date.now(),
    );
  if (expired.length) {
    const ids = await anonymizeInteractionStores(
      booking,
      chatStore,
      [],
      [],
      () => new Date(),
      expired.map((b) => b.id),
    );
    await operations.mutate((o) => {
      for (const j of o.jobs)
        if (j.source && ids.includes(j.source.id)) {
          j.body = '[removed]';
          j.subject = '[removed]';
          j.recipient = '[removed]';
          if (j.status === 'pending') j.status = 'suppressed';
        }
    });
  }
  const repo = await getRepository();
  if (repo.kind === 'postgres')
    await pgPoolOf(repo).query(
      'delete from commerce.interaction_limits where start_ms<$1',
      [Date.now() - 86400000],
    );
  return {
    handoffs,
    notifications,
    chatDeleted,
    bookingsAnonymized: expired.length,
  };
}
