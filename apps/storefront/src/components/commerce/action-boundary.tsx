'use client';

import { useRouter } from 'next/navigation';
import { Component, useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { recovery } from '@/lib/content/shop-copy';
import { OPEN_BAG_EVENT, type OpenBagDetail } from './cart-types';

type Kind = 'add' | 'bag';

/**
 * Inline recovery for bag Server Actions that never reached the server (offline, dropped connection).
 * A rejected action is rethrown during the form transition, so a class error boundary can catch it.
 * The wrapped `<form action={serverAction}>` is untouched, so posting without JavaScript still works.
 * The boundary renders the notice above its children, which remount with fresh state: controls are enabled
 * again and nothing is replayed.
 */
export class ActionBoundary extends Component<{ kind: Kind; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  private wrapper = { current: null as HTMLDivElement | null };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  private reset = () => {
    this.setState({ failed: false }, () => {
      // The button that was pressed is gone; put focus back on the form's primary action.
      this.wrapper.current?.querySelector<HTMLElement>('button[type=submit]')?.focus();
    });
  };

  render() {
    return (
      <div ref={(el) => { this.wrapper.current = el; }}>
        {this.state.failed ? <Recovery kind={this.props.kind} onRetry={this.reset} /> : null}
        {this.props.children}
      </div>
    );
  }
}

function Recovery({ kind, onRetry }: { kind: Kind; onRetry: () => void }) {
  const router = useRouter();
  const retry = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Refetch the bag so what is shown is what the server holds. Never replay the action: an add may have landed.
    // Offline, a refresh would fall back to a hard navigation to the browser error page, so skip it then.
    if (navigator.onLine !== false) router.refresh();
    retry.current?.focus();
  }, [router]);

  const openBag = () => {
    const detail: OpenBagDetail = { notices: [] };
    window.dispatchEvent(new CustomEvent(OPEN_BAG_EVENT, { detail }));
  };

  return (
    <div className="mb-5 space-y-3 rounded-xs border border-espresso/40 bg-parchment px-4 py-3" data-testid="action-recovery">
      <div role="alert" className="space-y-2">
        <p className="font-semibold text-espresso">{recovery.networkError}</p>
        {kind === 'add' ? <p className="text-small text-espresso">{recovery.addUncertain}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Button ref={retry} variant="secondary" onClick={onRetry}>
          {recovery.retry}
        </Button>
        {kind === 'add' ? (
          <button
            type="button"
            onClick={openBag}
            className="focus-ring inline-flex min-h-11 items-center font-semibold text-espresso underline underline-offset-4"
          >
            {recovery.checkBag}
          </button>
        ) : null}
      </div>
    </div>
  );
}
