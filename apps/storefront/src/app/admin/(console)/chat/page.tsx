import Link from 'next/link';
import { gate } from '@/app/admin/_lib/gate';
import { getChat } from '@/lib/chat';
import { PageHeader, Card } from '@/components/admin/ui';
import { ActionForm } from '@/lib/communications/form';
import { Field, TextArea, Hidden } from '@/lib/communications/admin-ui';
import { saveChatDraft, publishChat } from '@/app/admin/_actions/chat';
export default async function ChatAdmin() {
  const g = await gate('chat:manage');
  if (!g.ok) return g.view;
  const s = await (await getChat()).read(),
    c = s.draft ?? {
      enabled: false,
      title: 'How can we help?',
      greeting: 'Welcome. Choose a question or leave a message for our team.',
      fallback:
        'Our team can help with that. Leave a message for an email follow-up.',
      followUpLabel: 'Request an email reply',
      allowedPaths: ['/', '/collections', '/chat'],
      retentionDays: 30,
      questions: [],
    };
  const rows = [
    ...c.questions,
    ...Array.from({ length: Math.min(3, 30 - c.questions.length) }, (_, i) => ({
      id: `question-${c.questions.length + i}`,
      label: '',
      answer: '',
      href: null,
    })),
  ];
  return (
    <>
      <PageHeader title="Automated chat" />
      <p className="a-muted">
        Guided answers and email follow-up. Published settings are{' '}
        {s.published?.enabled ? 'enabled' : 'disabled'}. Drafts stay private.
      </p>
      <Card title="Chat settings">
        <ActionForm action={saveChatDraft} label="Save chat draft">
          <Hidden name="version" value={s.version} />
          <label>
            <input type="checkbox" name="enabled" defaultChecked={c.enabled} />{' '}
            Enable chat when this draft is published
          </label>
          <Field name="title" label="Chat title" value={c.title} required />
          <TextArea name="greeting" label="Greeting" value={c.greeting} />
          <TextArea
            name="fallback"
            label="Unknown question response"
            value={c.fallback}
          />
          <Field
            name="followUpLabel"
            label="Follow-up button text"
            value={c.followUpLabel}
          />
          <Field
            name="allowedPaths"
            label="Visible page paths (space separated; leave empty for all public pages)"
            value={c.allowedPaths.join(' ')}
          />
          <Field
            name="retentionDays"
            label="Transcript retention in days"
            type="number"
            value={String(c.retentionDays)}
          />
          <h2>Suggested questions</h2>
          <p>
            Blank rows are ignored. Save to add more rows, up to 30 questions.
          </p>
          {rows.map((q, i) => (
            <fieldset key={q.id} className="a-card">
              <legend>Question {i + 1}</legend>
              <Hidden name={`id${i}`} value={q.id} />
              <Field
                name={`label${i}`}
                label={`Question ${i + 1} label`}
                value={q.label}
              />
              <label>
                Answer
                <textarea
                  name={`answer${i}`}
                  defaultValue={q.answer}
                  maxLength={4000}
                  rows={3}
                />
              </label>
              <Field
                name={`href${i}`}
                label={`Question ${i + 1} page link (optional)`}
                value={q.href ?? ''}
              />
              <label>
                <input type="checkbox" name={`remove${i}`} /> Remove this
                question
              </label>
            </fieldset>
          ))}
        </ActionForm>
      </Card>
      <Card title="Private draft preview">
        <h3>{c.title}</h3>
        <p>{c.greeting}</p>
        {c.questions.map((q) => (
          <details key={q.id}>
            <summary>{q.label}</summary>
            <p>{q.answer}</p>
            {q.href ? <p>{q.href}</p> : null}
          </details>
        ))}
        <p>{c.fallback}</p>
        <p>{c.followUpLabel}</p>
        <ActionForm action={publishChat} label="Publish chat settings">
          <Hidden name="version" value={s.version} />
        </ActionForm>
      </Card>
      <Card title="Follow-up requests">
        <p>
          Saved requests: {s.handoffs.length}. Email replies are handled in the{' '}
          <Link href="/admin/inbox">CRM inbox</Link>.
        </p>
        {s.handoffs
          .slice(-20)
          .reverse()
          .map((h) => (
            <p key={h.id}>
              {h.createdAt.slice(0, 16)} · {h.name} ·{' '}
              {h.processed ? 'In CRM inbox' : 'Awaiting worker recovery'}
            </p>
          ))}
      </Card>
    </>
  );
}
