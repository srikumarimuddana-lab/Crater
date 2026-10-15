import { getBooking } from '@/lib/booking';
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
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSubmissionOrigin(request);
    const v = await readSubmission(request, 16384),
      booking = await getBooking(),
      code =
        v.action === 'exchange'
          ? String(v.code ?? '')
          : cookie(request, 'crater_booking');
    const [id, token] = code.split('.');
    if (!id || !token)
      throw new InteractionError(
        'Enter the complete appointment management code.',
        403,
      );
    if (!(await consumePublicLimit('booking-manage', id, 20)))
      throw new InteractionError('Please wait before trying again.', 429);
    await booking.getManaged(id, token);
    if (v.action === 'exchange') {
    } else if (v.action === 'cancel')
      await booking.cancel(id, token, {
        requestId: String(v.requestId ?? ''),
        expectedVersion: Number(v.expectedVersion),
      });
    else if (v.action === 'reschedule')
      await booking.reschedule(id, token, {
        requestId: String(v.requestId ?? ''),
        expectedVersion: Number(v.expectedVersion),
        resourceId: String(v.resourceId ?? ''),
        startsAt: String(v.startsAt ?? ''),
      });
    else throw new InteractionError('Choose a valid appointment action.');
    if (isJsonSubmission(request))
      return json({ received: true, managePath: '/book/manage' }, 200, {
        'Set-Cookie': setCookie('crater_booking', code),
      });
    return redirectPrivate('/book/manage', [setCookie('crater_booking', code)]);
  } catch (e) {
    return errorResponse(request, e, '/book/manage');
  }
}
