'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CommerceMode } from '@/lib/commerce/config';
import { bag, stripeTestModeBanner } from '@/lib/content/shop-copy';
import { CartLines, CartSummary } from './cart-lines';
import { OPEN_BAG_EVENT, type CartView, type OpenBagDetail } from './cart-types';

const subscribe = () => () => {};
/** False during server render and hydration, true afterwards. */
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

function BagIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 8h14l-1 12H6L5 8Z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Header bag trigger plus the cart drawer (native modal <dialog>).
 * Before hydration, and on /cart itself, the trigger is a plain link to /cart.
 */
export function BagControls({ cart, mode }: { cart: CartView | null; mode: CommerceMode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const hydrated = useHydrated();
  const pathname = usePathname();
  const onCartPage = pathname === '/cart';
  const count = cart?.totalQuantity ?? 0;
  /** Adjustments reported by the add that opened the drawer (for example a clamped quantity). */
  const [notices, setNotices] = useState<string[]>([]);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setNotices((e as CustomEvent<OpenBagDetail | undefined>).detail?.notices ?? []);
      open();
    };
    window.addEventListener(OPEN_BAG_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_BAG_EVENT, onOpen);
  }, [open]);

  // Navigating from inside the drawer (product link) closes it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }, [pathname]);

  const close = () => dialogRef.current?.close();

  const triggerClass =
    'focus-ring relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 text-eyebrow text-ivory hover:text-gold-light';
  const triggerInner = (
    <>
      <BagIcon />
      <span className="hidden sm:inline">Bag</span>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-xs font-bold text-forest-deep"
        >
          {count}
        </span>
      ) : null}
    </>
  );

  return (
    <>
      {hydrated && !onCartPage ? (
        <button
          type="button"
          ref={(el) => {
            triggerRef.current = el;
          }}
          onClick={open}
          aria-haspopup="dialog"
          aria-label={bag.openLabel(count)}
          className={triggerClass}
        >
          {triggerInner}
        </button>
      ) : (
        <Link
          href="/cart"
          ref={(el) => {
            triggerRef.current = el;
          }}
          aria-label={bag.openLabel(count)}
          className={triggerClass}
        >
          {triggerInner}
        </Link>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="bag-drawer-title"
        onClose={() => {
          setNotices([]);
          triggerRef.current?.focus();
        }}
        onClick={(e) => {
          // Only the backdrop targets the dialog element itself (it has no padding).
          if (e.target === e.currentTarget) close();
        }}
        className="bag-dialog on-light bg-ivory text-espresso"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-gold-deep/40 px-5 py-3">
            <h2 id="bag-drawer-title" tabIndex={-1} className="text-2xl focus:outline-none md:text-3xl">
              {bag.title}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={bag.closeLabel}
              className="focus-ring inline-flex size-11 items-center justify-center text-2xl leading-none hover:bg-parchment"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {mode === 'stripe-test' ? (
              <p role="note" className="text-small mb-4 rounded-xs bg-espresso px-3 py-2 font-semibold text-gold-light">
                {stripeTestModeBanner}
              </p>
            ) : null}
            {notices.length > 0 ? (
              <div role="status" className="mb-4 space-y-2">
                {notices.map((text) => (
                  <p key={text} className="text-small rounded-xs border border-gold-deep bg-parchment px-3 py-2">
                    {text}
                  </p>
                ))}
              </div>
            ) : null}
            <CartLines cart={cart} focusId="bag-drawer-title" onContinue={close} />
            {cart && cart.lines.length > 0 ? <p className="text-small mt-4 text-walnut">{bag.sampleNote}</p> : null}
          </div>

          {cart && cart.lines.length > 0 ? (
            <div className="border-t border-gold-deep/40 bg-parchment px-5 py-4">
              <CartSummary cart={cart} />
              <Link href="/cart" className="focus-ring text-small mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                {bag.viewFullBag}
              </Link>
            </div>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
