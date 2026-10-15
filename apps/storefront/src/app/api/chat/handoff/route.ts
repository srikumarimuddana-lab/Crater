import { getChat } from '@/lib/chat';
import { getOperationsStore } from '@/lib/operations/store';
import {
  readSubmission,
  requireSubmissionOrigin,
} from '@/lib/communications/public-forms';
import { cookie, json, errorResponse } from '@/lib/public-interactions/http';
import { consumePublicLimit } from '@/lib/public-interactions/rate-limit';
import { InteractionError } from '@/lib/public-interactions/validation';
import { normalizeEmail } from '@/lib/crm/service';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSubmissionOrigin(request);
    const v = await readSubmission(request, 16384),
      chat = await getChat(),
      token = cookie(request, 'crater_chat');
    await chat.messages(token);
    const email = normalizeEmail(String(v.email ?? ''));
    if (!(await consumePublicLimit('chat-handoff', email, 5)))
      throw new InteractionError(
        'Please wait before requesting another follow-up.',
        429,
      );
    const result = await chat.handoff(token, {
      requestId: String(v.requestId ?? ''),
      name: String(v.name ?? ''),
      email,
      message: String(v.message ?? ''),
    });
    try {
      await chat.reconcile(await getOperationsStore());
    } catch {
      /* Durable source is retried by maintenance. */
    }
    return json(result);
  } catch (e) {
    return errorResponse(request, e, '/chat');
  }
}
