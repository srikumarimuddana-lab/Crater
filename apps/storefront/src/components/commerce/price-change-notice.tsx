'use client';

import { useActionState, useEffect, useRef } from 'react';
import { acknowledgePrices } from '@/app/actions/cart';
import { bag, recovery } from '@/lib/content/shop-copy';
import { buttonClassName } from '@/components/ui/button';
import { initialAckState, type CartView } from './cart-types';
import { Price } from './price';

/**
 * Banner shown while any bag line's price differs from the price the shopper last saw. The button is
 * a plain form post (works without JavaScript) to the acknowledgePrices Server Action. After a
 * successful accept the banner is replaced by a short confirmation that takes focus, so a keyboard
 * user is never dropped on <body>.
 */
export function PriceChangeNotice({ cart, compact = false }: { cart: CartView | null; compact?: boolean }) {
  const [state, action, pending] = useActionState(acknowledgePrices, initialAckState);
  const confirmRef = useRef<HTMLDivElement>(null);
  const handled = useRef(0);

  useEffect(() => {
    if (state.status === 'acknowledged' && state.ts !== handled.current) {
      handled.current = state.ts;
      confirmRef.current?.focus();
    }
  }, [state]);

  const changed = cart?.lines.filter((l) => l.previousUnitPrice) ?? [];

  if (cart && cart.hasPriceChanges && changed.length > 0) {
    const only = changed.length === 1 ? changed[0] : null;
    return (
      <div role="status" data-testid="price-change-notice" className="rounded-xs border border-espresso bg-parchment px-4 py-3">
        <p className={compact ? 'text-small' : undefined}>
          {only && only.previousUnitPrice ? recovery.priceChanged(only.title, only.previousUnitPrice, only.unitPrice) : recovery.priceChangedGeneric}
        </p>
        <p className="text-small mt-1 text-walnut">
          {bag.currentSubtotal}: <Price money={cart.subtotal} className="font-semibold text-espresso" />
        </p>
        <form action={action} className="mt-2">
          <button
            type="submit"
            aria-disabled={pending || undefined}
            onClick={(e) => {
              if (pending) e.preventDefault();
            }}
            className={buttonClassName('secondary', 'min-h-11 w-full bg-ivory sm:w-auto')}
          >
            {recovery.priceChangedAcknowledge}
          </button>
        </form>
        {state.status === 'error' ? <p className="text-small mt-2 font-semibold">{recovery.serverError}</p> : null}
      </div>
    );
  }

  if (state.status === 'acknowledged') {
    return (
      <div
        ref={confirmRef}
        role="status"
        tabIndex={-1}
        className="text-small rounded-xs border border-espresso/40 bg-parchment px-4 py-3 focus:outline-none"
      >
        {recovery.priceChangedAcknowledged}
      </div>
    );
  }
  return null;
}
