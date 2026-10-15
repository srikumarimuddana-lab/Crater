import { requireAdmin } from '@/lib/admin/session';
import { getBookingStore } from '@/lib/booking';
import { privateHeaders } from '@/lib/public-interactions/http';
export async function GET(request: Request) {
  try {
    const session = await requireAdmin('appointments:read'),
      store = await getBookingStore(),
      s = await store.read(),
      p = new URL(request.url).searchParams;
    const rows = s.bookings.filter(
      (b) =>
        b.mode === (p.get('mode') || 'test') &&
        (!p.get('from') || b.startsAt.slice(0, 10) >= p.get('from')!) &&
        (!p.get('to') || b.startsAt.slice(0, 10) <= p.get('to')!) &&
        (!p.get('status') || b.status === p.get('status')) &&
        (!p.get('service') || b.serviceId === p.get('service')) &&
        (!p.get('resource') || b.resourceId === p.get('resource')),
    );
    const cell = (v: string) =>
      `"${(/^[=+@\-\t\r]/.test(v) ? "'" : '') + v.replace(/"/g, '""')}"`;
    const csv = [
      [
        'Reference',
        'Service',
        'Resource',
        'Start UTC',
        'Timezone',
        'Name',
        'Email',
        'Status',
        'Mode',
      ],
      ...rows.map((b) => [
        b.reference,
        b.serviceName,
        b.resourceId,
        b.startsAt,
        b.timezone,
        b.name,
        b.email,
        b.status,
        b.mode,
      ]),
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n');
    await store.mutate((s) => {
      s.audit.push({
        actor: session.staff.id,
        action: 'booking.export',
        target: String(rows.length),
        at: new Date().toISOString(),
      });
    });
    return new Response(csv, {
      headers: {
        ...privateHeaders,
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename="appointments.csv"',
      },
    });
  } catch {
    return new Response('Not authorized', {
      status: 403,
      headers: privateHeaders,
    });
  }
}
