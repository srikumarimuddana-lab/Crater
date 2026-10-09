'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { removeLine, updateLine } from '@/app/actions/cart';
import {
  bag,
  cartErrors,
  cartWarnings,
  checkoutErrorFallback,
  productPage,
  quantity as quantityCopy,
  recovery,
} from '@/lib/content/shop-copy';
import { buttonClassName } from '@/components/ui/button';
import { ActionBoundary } from './action-boundary';
import { initialCartActionState, type CartActionState, type CartLineView, type CartView } from './cart-types';
import { Price } from './price';

/** `aria-disabled` keeps focus on the control (a truly disabled button drops focus to body). */
function soft(disabled: boolean) {
  return {
    'aria-disabled': disabled || undefined,
    onClick: (e: React.MouseEvent) => {
      if (disabled) e.preventDefault();
    },
  };
}

const stepperButton =
  'focus-ring inline-flex size-11 items-center justify-center text-xl leading-none text-espresso hover:bg-parchment aria-disabled:cursor-not-allowed aria-disabled:text-walnut/60';

function messagesFor(s: CartActionState): string[] {
  const out: string[] = [];
  if (s.serverError) out.push(recovery.serverError);
  for (const code of s.errors) out.push(cartErrors[code] ?? checkoutErrorFallback);
  for (const w of s.warnings) out.push(cartWarnings[w.code](w.title));
  return out;
}

type Touched = { title: string; variantTitle: string };

/**
 * Bag lines with per-line quantity and remove forms. Server-rendered HTML works before hydration
 * (plain form posts to the Server Actions); once hydrated the forms use useActionState.
 * `focusId` is the id of a tabIndex=-1 heading that receives focus after a line is removed.
 */
export function CartLines(props: CartLinesProps) {
  // A rejected update/remove (network failure) is caught here and shown inline with Try again.
  return (
    <ActionBoundary kind="bag">
      <CartLinesInner {...props} />
    </ActionBoundary>
  );
}

type CartLinesProps = {
  cart: CartView | null;
  expired?: boolean;
  focusId: string;
  onContinue?: () => void;
};

function CartLinesInner({
  cart,
  expired = false,
  focusId,
  onContinue,
}: {
  cart: CartView | null;
  expired?: boolean;
  focusId: string;
  onContinue?: () => void;
}) {
  const [updateState, updateAction, updating] = useActionState(updateLine, initialCartActionState);
  const [removeState, removeAction, removing] = useActionState(removeLine, initialCartActionState);
  const [touched, setTouched] = useState<Touched | null>(null);
  const busy = updating || removing;

  const latest = removeState.ts > updateState.ts ? removeState : updateState;
  const problems = messagesFor(latest);
  let announcement = '';
  if (touched && (latest.status === 'updated' || latest.status === 'removed')) {
    announcement =
      latest.status === 'removed'
        ? quantityCopy.announceRemoved(touched.title, touched.variantTitle)
        : quantityCopy.announceUpdated(touched.title, touched.variantTitle, latest.lineQuantity ?? 0);
    if (latest.subtotal) announcement += ` ${quantityCopy.announceSubtotal(latest.subtotal)}`;
  }

  // After a removal the focused button is gone: move focus to the bag heading, never body.
  const handledRemoval = useRef(0);
  useEffect(() => {
    if (removeState.status === 'removed' && removeState.ts !== handledRemoval.current) {
      handledRemoval.current = removeState.ts;
      document.getElementById(focusId)?.focus();
    }
  }, [removeState, focusId]);

  const lines = cart?.lines ?? [];

  return (
    <div>
      <div role="status" aria-live="polite" aria-atomic="true" className={problems.length || announcement ? 'mb-4' : undefined}>
        {announcement ? <p className="sr-only">{announcement}</p> : null}
        {problems.map((text) => (
          <p key={text} className="text-small mb-2 rounded-xs border border-espresso/40 bg-parchment px-3 py-2 text-espresso">
            {text}
          </p>
        ))}
      </div>

      {lines.length === 0 ? (
        <div className="py-6">
          <p className="font-display text-2xl text-espresso">{expired ? recovery.cartExpiredHeading : bag.emptyHeading}</p>
          <p className="mt-2 text-walnut">{expired ? recovery.cartExpiredBody : bag.emptyBody}</p>
          <Link href="/#collection" onClick={onContinue} className={buttonClassName('primary', 'mt-6')}>
            {bag.continueShopping}
          </Link>
        </div>
      ) : (
        <ul aria-label={bag.linesLabel} className="divide-y divide-espresso/15 border-y border-espresso/15">
          {lines.map((line) => (
            <LineItem
              key={line.id}
              line={line}
              busy={busy}
              updateAction={updateAction}
              removeAction={removeAction}
              onTouch={setTouched}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LineItem({
  line,
  busy,
  updateAction,
  removeAction,
  onTouch,
}: {
  line: CartLineView;
  busy: boolean;
  updateAction: (payload: FormData) => void;
  removeAction: (payload: FormData) => void;
  onTouch: (t: Touched) => void;
}) {
  const guard = (e: React.FormEvent) => {
    if (busy) e.preventDefault();
    else onTouch({ title: line.title, variantTitle: line.variantTitle });
  };
  const atMax = line.quantity >= line.maxQuantity;
  const atMin = line.quantity <= 1;

  return (
    <li className="grid grid-cols-[4.5rem_1fr_auto] gap-x-4 gap-y-3 py-5" aria-busy={busy || undefined}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-xs border border-espresso/15 bg-parchment">
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt="" width={160} height={200} unoptimized className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg leading-tight">
          <Link href={`/products/${line.handle}`} className="focus-ring hover:underline hover:decoration-1 hover:underline-offset-4">
            {line.title}
          </Link>
        </p>
        <p className="text-small text-walnut">{line.optionLabel || line.variantTitle}</p>
        <p className="text-small text-walnut">
          {line.previousUnitPrice ? (
            <>
              <s className="mr-1">
                <span className="sr-only">{bag.priceWas} </span>
                <Price money={line.previousUnitPrice} />
              </s>
              <span className="sr-only">{bag.priceNow} </span>
              <Price money={line.unitPrice} className="font-semibold text-espresso" />
            </>
          ) : (
            <Price money={line.unitPrice} />
          )}{' '}
          {bag.unitPrice.toLowerCase()}
        </p>
        {!line.available ? <p className="text-small mt-1 font-semibold text-espresso">{productPage.soldOut}</p> : null}
      </div>
      <p className="text-right">
        <span className="sr-only">{bag.lineTotal}: </span>
        <Price money={line.lineTotal} className="font-semibold tabular-nums" />
      </p>

      <div className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <form action={updateAction} onSubmit={guard}>
          <input type="hidden" name="lineId" value={line.id} />
          <div role="group" aria-label={quantityCopy.input(line.title, line.variantTitle)} className="inline-flex items-center rounded-xs border border-espresso/40">
            <button
              type="submit"
              name="quantity"
              value={line.quantity - 1}
              aria-label={quantityCopy.decrease(line.title, line.variantTitle)}
              {...soft(busy || atMin)}
              className={stepperButton}
            >
              <span aria-hidden="true">−</span>
            </button>
            <span className="min-w-10 px-1 text-center font-semibold tabular-nums">
              <span className="sr-only">{quantityCopy.input(line.title, line.variantTitle)}: </span>
              {line.quantity}
            </span>
            <button
              type="submit"
              name="quantity"
              value={line.quantity + 1}
              aria-label={quantityCopy.increase(line.title, line.variantTitle)}
              {...soft(busy || atMax)}
              className={stepperButton}
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </form>

        <form action={removeAction} onSubmit={guard}>
          <input type="hidden" name="lineId" value={line.id} />
          <button
            type="submit"
            aria-label={quantityCopy.remove(line.title, line.variantTitle)}
            {...soft(busy)}
            className="focus-ring text-small inline-flex min-h-11 items-center px-1 font-semibold text-espresso underline underline-offset-4 hover:text-forest-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          >
            {quantityCopy.removeButton}
          </button>
        </form>
        {atMax ? <p className="text-small w-full text-walnut">{quantityCopy.atMaximum(line.maxQuantity)}</p> : null}
      </div>
    </li>
  );
}

/** Subtotal, the tax/shipping note and a checkout form that POSTs to the server route. */
export function CartSummary({ cart, checkoutUrl = '/api/checkout' }: { cart: CartView; checkoutUrl?: string }) {
  const [submitted, setSubmitted] = useState(false);

  // Coming back via the browser Back button restores the page from cache with the button still busy.
  useEffect(() => {
    const reset = () => setSubmitted(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  return (
    <div>
      <dl className="flex items-baseline justify-between gap-4">
        <dt className="font-semibold">{bag.subtotal}</dt>
        <dd>
          <Price money={cart.subtotal} className="text-price" />
        </dd>
      </dl>
      <p className="text-small mt-1 text-walnut">{bag.taxShippingNote}</p>
      <form
        method="post"
        action={checkoutUrl}
        className="mt-4"
        onSubmit={(e) => {
          if (submitted) e.preventDefault();
          else setSubmitted(true);
        }}
      >
        <button
          type="submit"
          {...soft(submitted)}
          aria-busy={submitted || undefined}
          className={buttonClassName('primary', 'w-full aria-disabled:cursor-wait aria-disabled:opacity-80')}
        >
          {submitted ? bag.checkoutPending : bag.checkout}
        </button>
      </form>
    </div>
  );
}
