import 'server-only';
import { randomUUID } from 'node:crypto';
import { memoryStore, type Store } from '@/lib/public-interactions/store';
import {
  hash,
  opaque,
  text,
  integer,
  publicLink,
  requestKey,
  InteractionError,
} from '@/lib/public-interactions/validation';
import { normalizeEmail, createCrm } from '@/lib/crm/service';
import type { OperationsStore } from '@/lib/operations/types';
import type { ChatState, ChatConfig } from './types';
export const initialChat = (): ChatState => ({
  draft: null,
  published: null,
  version: 0,
  sessions: [],
  handoffs: [],
  audit: [],
});
export const createMemoryChatStore = () => memoryStore(initialChat);
function validate(c: ChatConfig): ChatConfig {
  if (
    typeof c.enabled !== 'boolean' ||
    !Array.isArray(c.questions) ||
    c.questions.length > 30 ||
    !Array.isArray(c.allowedPaths)
  )
    throw new InteractionError('Invalid chat configuration.');
  const questions = c.questions.map((q) => ({
    id: text(q.id, 80),
    label: text(q.label, 120),
    answer: text(q.answer, 4000),
    href: q.href ? publicLink(q.href) : null,
  }));
  if (new Set(questions.map((q) => q.id)).size !== questions.length)
    throw new InteractionError('Question IDs must be unique.');
  return {
    ...c,
    title: text(c.title, 120),
    greeting: text(c.greeting, 1000),
    fallback: text(c.fallback, 1000),
    followUpLabel: text(c.followUpLabel, 120),
    retentionDays: integer(c.retentionDays, 1, 3650),
    allowedPaths: c.allowedPaths.map(publicLink),
    questions,
  };
}
export function createChat(store: Store<ChatState>, now = () => new Date()) {
  const enabled = (s: ChatState) => {
    if (!s.published?.enabled)
      throw new InteractionError('Chat is currently unavailable.', 503);
    return s.published;
  };
  const session = (s: ChatState, token: string) => {
    const v = s.sessions.find(
      (v) => v.tokenHash === hash(token) && v.expiresAt > now().toISOString(),
    );
    if (!v) throw new InteractionError('Start a new chat session.', 401);
    return v;
  };
  return {
    read: () => store.read(),
    async published() {
      const s = await store.read();
      return s.published?.enabled ? s.published : null;
    },
    async save(config: ChatConfig, expected: number, actor: string) {
      const c = validate(config);
      return store.mutate((s) => {
        if (s.version !== expected)
          throw new InteractionError(
            'Chat changed. Reload before saving.',
            409,
          );
        s.draft = c;
        s.version++;
        s.audit.push({ actor, action: 'chat.draft', at: now().toISOString() });
      });
    },
    async publish(expected: number, actor: string) {
      return store.mutate((s) => {
        if (s.version !== expected)
          throw new InteractionError(
            'Chat changed. Reload before publishing.',
            409,
          );
        if (!s.draft) throw new InteractionError('Save a draft first.');
        s.published = validate(s.draft);
        s.version++;
        s.audit.push({
          actor,
          action: 'chat.publish',
          at: now().toISOString(),
        });
      });
    },
    async start() {
      return store.mutate((s) => {
        const c = enabled(s),
          token = opaque();
        s.sessions.push({
          id: randomUUID(),
          tokenHash: hash(token),
          expiresAt: new Date(
            now().getTime() + Math.min(7, c.retentionDays) * 86400000,
          ).toISOString(),
          messages: [],
        });
        return token;
      });
    },
    async messages(token: string) {
      return session(await store.read(), token).messages;
    },
    async ask(token: string, key: string, questionId?: string, body = '') {
      requestKey(key);
      text(body, 4000, true);
      return store.mutate((s) => {
        const c = enabled(s),
          v = session(s, token);
        if (v.messages.some((m) => m.requestId === key)) return v.messages;
        const q = c.questions.find(
          (q) =>
            q.id === questionId ||
            (!questionId &&
              q.label.toLowerCase() === body.trim().toLowerCase()),
        );
        const at = now().toISOString();
        v.messages.push(
          {
            id: randomUUID(),
            sessionId: v.id,
            requestId: key,
            kind: 'question',
            body: q?.label || body || 'Help',
            createdAt: at,
          },
          {
            id: randomUUID(),
            sessionId: v.id,
            requestId: key,
            kind: q ? 'answer' : 'fallback',
            body: q?.answer || c.fallback,
            href: q?.href,
            createdAt: at,
          },
        );
        return v.messages;
      });
    },
    async handoff(
      token: string,
      input: {
        requestId: string;
        name: string;
        email: string;
        message: string;
      },
    ) {
      requestKey(input.requestId);
      const email = normalizeEmail(input.email),
        name = text(input.name, 150),
        body = text(input.message, 4000);
      return store.mutate((s) => {
        enabled(s);
        const v = session(s, token),
          id = `${v.id}:${input.requestId}`;
        if (s.handoffs.some((e) => e.id === id))
          return { received: true as const };
        s.handoffs.push({
          id,
          sessionId: v.id,
          email,
          name,
          body,
          createdAt: now().toISOString(),
          processed: false,
        });
        v.messages.push({
          id: randomUUID(),
          sessionId: v.id,
          requestId: input.requestId,
          kind: 'handoff',
          body: 'Your message has been saved. Our team will follow up by email.',
          createdAt: now().toISOString(),
        });
        return { received: true as const };
      });
    },
    async reconcile(operations: OperationsStore) {
      let recovered = 0;
      for (const e of (await store.read()).handoffs
        .filter((e) => !e.processed)
        .slice(0, 100)) {
        await createCrm(operations, now).inbound({
          eventId: `chat-handoff:${e.id}`,
          channel: 'email',
          recipient: e.email,
          subject: 'Website chat follow-up',
          body: `${e.name}\n\n${e.body}`,
          occurredAt: e.createdAt,
        });
        const customer = (await operations.read()).customers.find(
          (c) => c.email === e.email,
        );
        await store.mutate((s) => {
          const v = s.handoffs.find((v) => v.id === e.id);
          if (v) {
            v.processed = true;
            v.customerId = customer?.id;
          }
        });
        recovered++;
      }
      return { recovered };
    },
    async retention(operations: OperationsStore) {
      const prior = await store.read(),
        days = prior.published?.retentionDays;
      if (!days) return 0;
      const cutoff = new Date(now().getTime() - days * 86400000).toISOString();
      const expired = prior.handoffs
        .filter((e) => e.createdAt < cutoff)
        .map((e) => `chat-handoff:${e.id}`);
      if (expired.length)
        await operations.mutate((o) => {
          for (const id of expired)
            if (!o.inboundIds.includes(id)) o.inboundIds.push(id);
          for (const thread of o.conversations) {
            thread.messages = thread.messages.filter(
              (m) => !expired.includes(m.id),
            );
            if (!thread.messages.length) thread.status = 'closed';
          }
        });
      return store.mutate((s) => {
        const days = s.published?.retentionDays;
        if (!days) return 0;
        const cutoff = new Date(
          now().getTime() - days * 86400000,
        ).toISOString();
        let removed = 0;
        for (const v of s.sessions) {
          const n = v.messages.length;
          v.messages = v.messages.filter((m) => m.createdAt >= cutoff);
          removed += n - v.messages.length;
        }
        s.sessions = s.sessions.filter(
          (v) => v.expiresAt > now().toISOString(),
        );
        s.handoffs = s.handoffs.filter((e) => e.createdAt >= cutoff);
        return removed;
      });
    },
  };
}
