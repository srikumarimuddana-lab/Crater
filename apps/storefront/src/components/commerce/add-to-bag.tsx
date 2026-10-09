'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { addToCart } from '@/app/actions/cart';
import { formatMoney } from '@/lib/commerce/money';
import type { MoneyV2 } from '@/lib/commerce/types';
import { buttonClassName } from '@/components/ui/button';
import {
  addToBag,
  bag,
  cartErrors,
  cartWarnings,
  productPage,
  quantity as quantityCopy,
  recovery,
} from '@/lib/content/shop-copy';
import { initialCartActionState, MAX_LINE_QUANTITY, OPEN_BAG_EVENT, type OpenBagDetail } from './cart-types';

const QUANTITY_CODES = new Set(['LESS_THAN', 'GREATER_THAN', 'INVALID_QUANTITY']);

/**
 * Quantity and Add to bag. The form posts to a Server Action, so it works before hydration;
 * useActionState supplies pending, added and error states, announced in one polite live region.
 */
export function AddToBag({
  variantId,
  productHandle,
  productTitle,
  variantTitle,
  available,
  price,
}: {
  variantId: string;
  productHandle: string;
  productTitle: string;
  variantTitle: string;
  available: boolean;
  price: MoneyV2;
}) {
  const [state, action, pending] = useActionState(addToCart, initialCartActionState);
  const [qty, setQty] = useState('1');
  const [dismissedTs, setDismissedTs] = useState(0);
  const handled = useRef(0);
  const mainButton = useRef<HTMLButtonElement>(null);
  const [mainOffscreen, setMainOffscreen] = useState(false);

  // Small screens: a sticky bar offers Add to bag once the main button has scrolled up out of view.
  useEffect(() => {
    const el = mainButton.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // Only once the shopper has scrolled past it (button above the viewport), not before they reach it.
    const io = new IntersectionObserver(([entry]) =>
      setMainOffscreen(!entry.isIntersecting && entry.boundingClientRect.top < 0),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const added = state.status === 'added';
  const showAdded = added && state.ts !== dismissedTs;

  useEffect(() => {
    if (!added || handled.current === state.ts) return;
    handled.current = state.ts;
    const detail: OpenBagDetail = { notices: state.warnings.map((w) => cartWarnings[w.code](w.title)) };
    window.dispatchEvent(new CustomEvent(OPEN_BAG_EVENT, { detail }));
    const timer = window.setTimeout(() => setDismissedTs(state.ts), 2000);
    return () => window.clearTimeout(timer);
  }, [added, state]);

  const quantityErrors = state.errors.filter((c) => QUANTITY_CODES.has(c));
  const otherErrors = state.errors.filter((c) => !QUANTITY_CODES.has(c));
  const feedback: string[] = [];
  if (added) feedback.push(addToBag.announceAdded(productTitle, variantTitle, state.addedQuantity));
  if (state.serverError) feedback.push(recovery.serverError);
  for (const c of otherErrors) feedback.push(cartErrors[c]);
  for (const w of state.warnings) feedback.push(cartWarnings[w.code](w.title));
  const quantityMessage = quantityErrors.map((c) => cartErrors[c]).join(' ');

  const step = (delta: number) => {
    const n = Number.parseInt(qty, 10);
    const base = Number.isFinite(n) ? n : 1;
    setQty(String(Math.min(MAX_LINE_QUANTITY, Math.max(1, base + delta))));
  };

  const label = !available
    ? addToBag.unavailable
    : pending
      ? addToBag.pending
      : showAdded
        ? addToBag.added
        : `${addToBag.idle} — ${formatMoney(price)}`;

  const stepper =
    'focus-ring inline-flex size-11 items-center justify-center text-xl leading-none hover:bg-parchment';

  return (
    <>
    <form
      id="add-to-bag-form"
      action={action}
      // The browser would otherwise block out-of-range values before the server can answer with copy.
      noValidate
      onSubmit={(e) => {
        if (pending) e.preventDefault();
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="merchandiseId" value={variantId} />
      <input type="hidden" name="productHandle" value={productHandle} />

      <div>
        <label htmlFor="quantity" className="text-small block font-semibold">
          {productPage.quantityLabel}
        </label>
        <div className="mt-2 inline-flex items-center rounded-xs border border-espresso/40">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={quantityCopy.decrease(productTitle, variantTitle)}
            className={stepper}
          >
            <span aria-hidden="true">−</span>
          </button>
          <input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_LINE_QUANTITY}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-invalid={quantityMessage ? true : undefined}
            aria-describedby={quantityMessage ? 'quantity-error' : 'quantity-hint'}
            className="focus-ring h-11 w-14 [appearance:textfield] bg-transparent text-center font-semibold tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={quantityCopy.increase(productTitle, variantTitle)}
            className={stepper}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
        <p id="quantity-hint" className="text-small mt-1 text-walnut">
          {productPage.quantityHint(MAX_LINE_QUANTITY)}
        </p>
        {quantityMessage ? (
          <p id="quantity-error" className="text-small mt-1 font-semibold text-espresso">
            {quantityMessage}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        ref={mainButton}
        disabled={!available}
        aria-busy={pending || undefined}
        aria-disabled={pending || undefined}
        onClick={(e) => {
          if (pending) e.preventDefault();
        }}
        className={buttonClassName('primary', 'w-full disabled:cursor-not-allowed disabled:bg-walnut/80 disabled:text-ivory')}
      >
        {label}
      </button>

      <p className="text-small -mt-2 text-walnut">{bag.taxShippingNote}</p>

      <div role="status" aria-live="polite" aria-atomic="true" className="min-h-6">
        {feedback.map((text) => (
          <p key={text} className="text-small text-espresso">
            {text}
          </p>
        ))}
      </div>
    </form>

    {available && mainOffscreen ? (
      <div data-testid="sticky-add-to-bag" className="fixed inset-x-0 bottom-0 z-30 border-t border-espresso/15 bg-ivory p-3 lg:hidden">
        <button
          type="submit"
          form="add-to-bag-form"
          aria-disabled={pending || undefined}
          onClick={(e) => {
            if (pending) e.preventDefault();
          }}
          className={buttonClassName('primary', 'w-full')}
        >
          {label}
        </button>
      </div>
    ) : null}
    </>
  );
}
