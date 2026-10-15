'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ChatConfig } from '@/lib/chat/types';
import { ChatPanel } from './panel';
export function ChatLauncher({
  config,
  bookingEnabled,
}: {
  config: ChatConfig;
  bookingEnabled: boolean;
}) {
  const path = usePathname(),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    [hidden, setHidden] = useState(false),
    [bottom, setBottom] = useState<number>();
  useEffect(() => {
    let watched: Element | null = null;
    const sizes = new ResizeObserver(() => sync());
    function sync() {
      setHidden(
        Boolean(
          document.querySelector('dialog[open]:not(.interaction-chat-dialog)'),
        ),
      );
      const consent = document.querySelector('.analytics-consent');
      if (consent !== watched) {
        sizes.disconnect();
        watched = consent;
        if (consent) sizes.observe(consent);
      }
      const base = window.innerWidth < 600 ? 92 : 24;
      setBottom(
        Math.max(
          base,
          consent
            ? window.innerHeight - consent.getBoundingClientRect().top + 12
            : 0,
        ),
      );
    }
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    window.addEventListener('resize', sync);
    sync();
    return () => {
      observer.disconnect();
      sizes.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);
  useEffect(() => {
    dialog.current?.close();
  }, [path]);
  if (
    path.startsWith('/admin') ||
    path.startsWith('/book/manage') ||
    path === '/chat' ||
    (config.allowedPaths.length &&
      !config.allowedPaths.some(
        (p) => path === p || (p !== '/' && path.startsWith(`${p}/`)),
      ))
  )
    return null;
  return (
    <>
      <button
        ref={trigger}
        hidden={hidden}
        style={bottom ? { bottom } : undefined}
        className="interaction-launcher"
        data-track="chat.open"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        {config.title}
      </button>
      <dialog
        className="interaction-chat-dialog"
        ref={dialog}
        aria-labelledby="interaction-chat-title"
        onClose={() => trigger.current?.focus()}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const nodes = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),a[href],input,textarea,summary',
            ) ?? [],
          ).filter((n) => n.getClientRects().length);
          if (!nodes.length) return;
          const first = nodes[0],
            last = nodes.at(-1)!;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="interaction-chat-header">
          <h2 id="interaction-chat-title">{config.title}</h2>
          <button
            className="interaction-secondary"
            onClick={() => dialog.current?.close()}
            aria-label="Close chat"
          >
            Close
          </button>
        </div>
        <ChatPanel config={config} bookingEnabled={bookingEnabled} />
      </dialog>
    </>
  );
}
