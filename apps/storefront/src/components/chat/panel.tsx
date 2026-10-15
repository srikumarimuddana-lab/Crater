'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ChatConfig, ChatMessage } from '@/lib/chat/types';
export function ChatPanel({
  config,
  bookingEnabled = false,
}: {
  config: ChatConfig;
  bookingEnabled?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [status, setStatus] = useState(''),
    [pending, setPending] = useState(false);
  const session = useRef(false),
    lastRequest = useRef<{ payload: string; id: string } | null>(null);
  async function send(path: string, body: Record<string, string>) {
    setPending(true);
    setStatus('');
    try {
      if (!session.current) {
        const r = await fetch('/api/chat/session', {
          method: 'POST',
          headers: { Accept: 'application/json' },
        });
        if (!r.ok) {
          const v = await r.json();
          throw Error(v.error || 'Chat is unavailable.');
        }
        session.current = true;
      }
      const payload = JSON.stringify(body);
      if (lastRequest.current?.payload !== payload)
        lastRequest.current = { payload, id: crypto.randomUUID() };
      const r = await fetch(`/api/chat/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, requestId: lastRequest.current!.id }),
      });
      const v = await r.json();
      if (!r.ok) {
        if (r.status === 401) session.current = false;
        throw Error(v.error || 'Please try again.');
      }
      if (v.messages) setMessages(v.messages);
      if (v.received)
        setStatus('Your message was saved. Our team will follow up by email.');
      lastRequest.current = null;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="interaction-chat-content">
      <p className="interaction-eyebrow">Automated assistant</p>
      <p>{config.greeting}</p>
      <div className="interaction-questions">
        {config.questions.map((q) => (
          <button
            className="interaction-secondary"
            key={q.id}
            disabled={pending}
            onClick={() => send('message', { questionId: q.id })}
          >
            {q.label}
          </button>
        ))}
      </div>
      <div
        className="interaction-transcript"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        {messages.map((m) => (
          <div className={`interaction-message is-${m.kind}`} key={m.id}>
            <span>{m.kind === 'question' ? 'You' : 'Assistant'}</span>
            <p>{m.body}</p>
            {m.href && (!m.href.startsWith('/book') || bookingEnabled) ? (
              <Link href={m.href}>View page</Link>
            ) : null}
          </div>
        ))}
      </div>
      <form
        className="interaction-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void send('message', { text: String(f.get('question') || '') });
        }}
      >
        <label>
          Your question
          <input name="question" maxLength={4000} required />
        </label>
        <button className="interaction-primary" disabled={pending}>
          {pending ? 'Working…' : 'Ask a question'}
        </button>
      </form>
      {bookingEnabled ? (
        <Link
          className="interaction-secondary"
          href="/book"
          data-track="booking.start"
        >
          Book an appointment
        </Link>
      ) : null}
      <details>
        <summary>{config.followUpLabel}</summary>
        <p>Leave a message for an email reply. This is not live staff chat.</p>
        <form
          className="interaction-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send('handoff', {
              name: String(f.get('name') || ''),
              email: String(f.get('email') || ''),
              message: String(f.get('message') || ''),
            });
          }}
        >
          <label>
            Your name
            <input name="name" required maxLength={150} autoComplete="name" />
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>
          <label>
            Message
            <textarea name="message" required maxLength={4000} rows={4} />
          </label>
          <button className="interaction-primary" disabled={pending}>
            {pending ? 'Saving…' : 'Request email follow-up'}
          </button>
        </form>
      </details>
      <p role="status">{status}</p>
    </div>
  );
}
