import { getChat } from '@/lib/chat';
import {
  readSubmission,
  requireSubmissionOrigin,
} from '@/lib/communications/public-forms';
import { cookie, json, errorResponse } from '@/lib/public-interactions/http';
import { consumePublicLimit } from '@/lib/public-interactions/rate-limit';
import { InteractionError } from '@/lib/public-interactions/validation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSubmissionOrigin(request);
    const token = cookie(request, 'crater_chat'),
      chat = await getChat();
    await chat.messages(token);
    if (!(await consumePublicLimit('chat', token, 30)))
      throw new InteractionError(
        'Please wait before sending another message.',
        429,
      );
    const v = await readSubmission(request, 16384);
    return json({
      messages: await chat.ask(
        token,
        String(v.requestId ?? ''),
        typeof v.questionId === 'string' ? v.questionId : undefined,
        typeof v.text === 'string' ? v.text : '',
      ),
    });
  } catch (e) {
    return errorResponse(request, e, '/chat');
  }
}
