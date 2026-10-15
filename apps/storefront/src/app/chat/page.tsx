import { PageShell } from '@/components/page-shell';
import { getChat } from '@/lib/chat';
import { getBooking } from '@/lib/booking';
import { ChatPanel } from '@/components/chat/panel';
export const dynamic = 'force-dynamic';
export default async function ChatPage() {
  const config = await (await getChat()).published();
  return (
    <PageShell>
      <section className="interaction-page">
        <p className="interaction-eyebrow">Here to help</p>
        <h1>{config?.title || 'Contact our team'}</h1>
        {config ? (
          <ChatPanel
            config={config}
            bookingEnabled={
              (await (await getBooking()).read()).settings.enabled
            }
          />
        ) : (
          <p>
            Automatic chat is not available yet.{' '}
            <a href="/contact">Send our team a message</a>.
          </p>
        )}
        <noscript>
          <p>
            Automatic chat needs JavaScript. You can{' '}
            <a href="/contact">request an email reply using the contact form</a>
            .
          </p>
        </noscript>
      </section>
    </PageShell>
  );
}
