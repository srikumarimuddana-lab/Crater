import { validBookingVisitor } from '@/lib/booking/tokens';
import { getBooking } from '@/lib/booking';
import { getBookingStore } from '@/lib/booking';
import { reconcileBooking } from '@/lib/booking/notifications';
import { getOperationsStore } from '@/lib/operations/store';
import {
  readSubmission,
  requireSubmissionOrigin,
  isJsonSubmission,
} from '@/lib/communications/public-forms';
import {
  cookie,
  json,
  errorResponse,
  setCookie,
  redirectPrivate,
} from '@/lib/public-interactions/http';
import { InteractionError } from '@/lib/public-interactions/validation';
import { consumePublicLimit } from '@/lib/public-interactions/rate-limit';
import { normalizeEmail } from '@/lib/crm/service';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSubmissionOrigin(request);
    const v = await readSubmission(request, 16384),
      email = normalizeEmail(String(v.email ?? '')),
      visitor = String(
        v.visitorKey || cookie(request, 'crater_booking_visitor'),
      );
    if (!validBookingVisitor(visitor))
      throw new InteractionError(
        'Reload the booking form before reserving.',
        403,
      );
    if (!(await consumePublicLimit('booking-reserve', email, 5)))
      throw new InteractionError(
        'Please wait before submitting another appointment.',
        429,
      );
    const result = await (
      await getBooking()
    ).reserve({
      requestId: String(v.requestId ?? ''),
      visitor,
      serviceId: String(v.serviceId ?? ''),
      resourceId: String(v.resourceId ?? ''),
      startsAt: String(v.startsAt ?? ''),
      name: String(v.name ?? ''),
      email,
      notes: String(v.notes ?? ''),
    });
    const cookies = [
      setCookie('crater_booking_visitor', visitor),
      setCookie(
        'crater_booking',
        `${result.booking.id}.${result.managementToken}`,
      ),
    ];
    try {
      await reconcileBooking(
        await getBookingStore(),
        await getOperationsStore(),
      );
    } catch {
      /* Committed notification source is recovered by worker. */
    }
    if (isJsonSubmission(request)) {
      const response = json({
        reference: result.booking.reference,
        managePath: '/book/manage',
        status: result.booking.status,
      });
      cookies.forEach((c) => response.headers.append('Set-Cookie', c));
      return response;
    }
    return redirectPrivate('/book/manage', cookies);
  } catch (e) {
    return errorResponse(request, e);
  }
}
