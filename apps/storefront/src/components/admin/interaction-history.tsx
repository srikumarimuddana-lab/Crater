import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/session';
import { getBookingStore } from '@/lib/booking';
import { getChatStore } from '@/lib/chat';
import { getOperationsStore } from '@/lib/operations/store';
import { Card } from './ui';
import { displayAppointment } from '@/lib/booking/notifications';
export async function interactionExport(customerId: string) {
  await requireAdmin('customers:read');
  const o = await (await getOperationsStore()).read(),
    ids = new Set([customerId]);
  for (let n = 0; n < o.customers.length; n++)
    for (const c of o.customers)
      if (c.mergedIntoId && ids.has(c.mergedIntoId)) ids.add(c.id);
  const bookings = (await (await getBookingStore()).read()).bookings
    .filter((b) => b.customerId && ids.has(b.customerId))
    .map(({ tokenHash: _hash, encryptedToken: _encrypted, ...b }) => {
      void _hash;
      void _encrypted;
      return b;
    });
  const handoffs = (await (await getChatStore()).read()).handoffs.filter(
    (h) => h.customerId && ids.has(h.customerId),
  );
  return { bookings, chatHandoffs: handoffs };
}
export async function InteractionHistory({
  customerId,
}: {
  customerId: string;
}) {
  const history = await interactionExport(customerId),
    state = await (await getOperationsStore()).read(),
    pending = state.privacyRequests?.some(
      (r) => r.customerIds.includes(customerId) && r.status === 'pending',
    );
  return (
    <Card title="Appointments and chat">
      {pending ? (
        <p role="status">
          Interaction anonymization is queued. Run the communications worker to
          complete it.
        </p>
      ) : null}
      {history.bookings.length ? (
        history.bookings.map((b) => (
          <p key={b.id}>
            <a
              href={`/admin/appointments?from=${b.startsAt.slice(0, 10)}&mode=${b.mode}#appointment-${b.id}`}
            >
              {b.reference}
            </a>{' '}
            · {b.serviceName} · {displayAppointment(b)} · {b.status}
          </p>
        ))
      ) : (
        <p>No linked appointments.</p>
      )}
      {history.chatHandoffs.map((h) => (
        <p key={h.id}>
          Chat follow-up · {h.createdAt.slice(0, 16)} ·{' '}
          <Link href="/admin/inbox">Open inbox</Link>
        </p>
      ))}
    </Card>
  );
}
