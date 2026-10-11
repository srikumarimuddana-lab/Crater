# Storefront patterns

## Cart Server Action (progressively enhanced)

```ts
// src/app/actions/cart.ts
'use server';
import { revalidatePath } from 'next/cache';
import { getStorefront } from '@/lib/commerce';
import { getCartId, setCartId } from '@/lib/commerce/cart-cookie';

export async function addToCart(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  const merchandiseId = String(formData.get('merchandiseId') ?? '');
  const quantity = Number(formData.get('quantity') ?? 1);
  const storefront = getStorefront();
  const cartId = await getCartId();
  const payload = cartId
    ? await storefront.cartLinesAdd({ cartId, lines: [{ merchandiseId, quantity }] })
    : await storefront.cartCreate({ input: { lines: [{ merchandiseId, quantity }] } });
  if (payload.cart) await setCartId(payload.cart.id);
  revalidatePath('/', 'layout');
  return { userErrors: payload.userErrors, warnings: payload.warnings, ok: payload.userErrors.length === 0 };
}
```

When `cartLinesAdd` returns `MISSING_CART` (expired cookie), create a new cart
with the same lines instead of failing. Use `useActionState` in the client form to
show pending state and messages; the form still posts without JavaScript.

## Cart drawer

- Trigger: header button with the live item count (`aria-expanded`, `aria-controls`).
- Use a native `<dialog>` with `showModal()` for focus trapping and Escape; restore
  focus to the trigger on close.
- Lines: product link, variant title, unit price, quantity stepper (form posts to
  an update action), remove button, line total. Subtotal from `cart.cost`, plus
  "Taxes and shipping are calculated at checkout."
- Checkout: `<form action={cart.checkoutUrl} method="post">` with a submit button.
- Also render a full `/cart` page with the same content, for no-JS and deep links.

## Variant selector

Render option groups as radio inputs inside `<fieldset>` with `<legend>`; each
option is a link or form `GET` that sets the search param, so selection works
without JavaScript. Mark unavailable values with text, not only colour.
