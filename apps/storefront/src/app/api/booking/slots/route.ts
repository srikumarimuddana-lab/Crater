import { getBooking } from '@/lib/booking';
import { json, errorResponse } from '@/lib/public-interactions/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    return json({
      slots: await (
        await getBooking()
      ).slots(
        p.get('serviceId') ?? '',
        p.get('resourceId') ?? '',
        p.get('date') ?? '',
      ),
    });
  } catch (e) {
    return errorResponse(request, e);
  }
}
