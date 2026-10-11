import type { ReactNode } from 'react';

/**
 * Renders `text` with its first occurrence of `word` set as the one italic bronze accent word.
 * The DOM text content is unchanged, so headings keep their accessible names (tests use them as region names).
 */
export function Emphasis({ text, word }: { text: string; word?: string }) {
  const at = word ? text.indexOf(word) : -1;
  if (!word || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="accent-word">{word}</span>
      {text.slice(at + word.length)}
    </>
  );
}

type Props = {
  id: string;
  title: string;
  emphasis?: string;
  /** Short sentence-case label rendered as a pill above the heading (a sibling, never inside it). */
  eyebrow?: string;
  lead?: string;
  as?: 'h1' | 'h2';
  /** Links or controls aligned to the heading's baseline on wide screens. */
  actions?: ReactNode;
  className?: string;
  headingClassName?: string;
};

/** Eyebrow pill, serif heading with one accent word, optional lead and actions. Left-aligned. */
export function SectionHeading({ id, title, emphasis, eyebrow, lead, as = 'h2', actions, className, headingClassName }: Props) {
  const Heading = as;
  return (
    <div className={['flex flex-wrap items-end justify-between gap-x-8 gap-y-4', className].filter(Boolean).join(' ')}>
      <div className="max-w-[40rem]">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <Heading id={id} className={[eyebrow ? 'mt-4' : '', headingClassName].filter(Boolean).join(' ')}>
          <Emphasis text={title} word={emphasis} />
        </Heading>
        {lead ? <p className="text-lead mt-4 max-w-[52ch]">{lead}</p> : null}
      </div>
      {actions ? <div className="flex min-h-11 flex-wrap items-center gap-4">{actions}</div> : null}
    </div>
  );
}
