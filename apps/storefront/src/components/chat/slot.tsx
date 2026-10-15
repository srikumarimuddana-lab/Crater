import { getChat } from '@/lib/chat';
import { getBooking } from '@/lib/booking';
import { ChatLauncher } from './launcher';
export async function ChatSlot() {
  const c = await (await getChat()).published();
  if (!c) return null;
  const b = await (await getBooking()).read();
  return <ChatLauncher config={c} bookingEnabled={b.settings.enabled} />;
}
