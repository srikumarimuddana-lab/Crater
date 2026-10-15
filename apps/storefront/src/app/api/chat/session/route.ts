import { getChat } from '@/lib/chat';
import { requireSubmissionOrigin } from '@/lib/communications/public-forms';
import {
  cookie,
  json,
  setCookie,
  errorResponse,
} from '@/lib/public-interactions/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSubmissionOrigin(request);
    const chat = await getChat(),
      existing = cookie(request, 'crater_chat');
    if (existing) {
      try {
        await chat.messages(existing);
        return json({ ready: true });
      } catch {}
    }
    const token = await chat.start();
    return json({ ready: true }, 200, {
      'Set-Cookie': setCookie('crater_chat', token),
    });
  } catch (e) {
    return errorResponse(request, e, '/chat');
  }
}
export async function GET(request: Request) {
  try {
    const chat = await getChat();
    return json({
      messages: await chat.messages(cookie(request, 'crater_chat')),
    });
  } catch (e) {
    return errorResponse(request, e, '/chat');
  }
}
