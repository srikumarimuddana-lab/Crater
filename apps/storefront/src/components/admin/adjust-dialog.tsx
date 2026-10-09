'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Modal dialog opened by `?adjust=<variant>`. Server-rendered open (so it works before hydration), upgraded to
 * a real modal on mount: focus trapped and background inert by the platform, Escape closes, and focus goes back
 * to the row's Adjust link. Closing navigates to `closeHref`.
 */
export function AdjustDialog({ title, closeHref, triggerKey, children }: { title: string; closeHref: string; triggerKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => {
      router.replace(closeHref, { scroll: false });
      setTimeout(() => document.querySelector<HTMLElement>(`[data-adjust-trigger="${CSS.escape(triggerKey)}"]`)?.focus(), 80);
    };
    if (d.open) d.close(); // drop the server-rendered non-modal state, then show as a modal
    d.showModal();
    d.addEventListener('close', onClose);
    return () => {
      d.removeEventListener('close', onClose);
      if (d.open) d.close();
    };
  }, [closeHref, router, triggerKey]);

  return (
    <dialog ref={ref} open className="a-dialog" aria-labelledby={titleId}>
      <div className="a-dialog-body">
        <h2 id={titleId} style={{ fontSize: 18, lineHeight: '24px', marginBottom: 12 }}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

export function CloseButton({ label = 'Cancel' }: { label?: string }) {
  return (
    <button type="button" className="a-btn" onClick={(e) => e.currentTarget.closest('dialog')?.close()}>
      {label}
    </button>
  );
}
