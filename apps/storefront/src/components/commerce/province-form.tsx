'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { setProvince } from '@/app/actions/cart';
import { buttonClassName } from '@/components/ui/button';
import { cartErrors, recovery, taxCopy } from '@/lib/content/shop-copy';
import type { ProvinceCode } from '@/lib/commerce/types';
import { useHydrated } from '@/components/use-hydrated';
import { initialProvinceState } from './cart-types';
import { taxUi } from './tax-ui-copy';

const PROVINCES = Object.entries(taxCopy.provinces) as [ProvinceCode, string][];

/**
 * Ship-to province for tax. A plain form with an Update button (posts without JavaScript); once hydrated the
 * select also submits on change. `focusOnMount` moves focus to the select (used when checkout was refused for
 * a missing province); `describedBy` points at the visible error so the select announces it.
 */
export function ProvinceForm({
  provinceCode,
  focusOnMount = false,
  describedBy,
}: {
  provinceCode: ProvinceCode | null;
  focusOnMount?: boolean;
  describedBy?: string;
}) {
  const [state, action, pending] = useActionState(setProvince, initialProvinceState);
  const selectRef = useRef<HTMLSelectElement>(null);
  // Controlled, so the shown value follows the saved province (React resets uncontrolled fields after an action).
  const [value, setValue] = useState<string>(provinceCode ?? '');
  const [seen, setSeen] = useState<ProvinceCode | null>(provinceCode);
  if (provinceCode !== seen) {
    setSeen(provinceCode);
    setValue(provinceCode ?? '');
  }
  const hydrated = useHydrated();
  const uid = useId();
  const selectId = `${uid}-province`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;

  // React resets the form's fields when the action finishes, which would blank a controlled select's DOM
  // value; put the shown value back. Runs after every commit and only writes when the DOM differs.
  useEffect(() => {
    const el = selectRef.current;
    if (el && el.value !== value) el.value = value;
  });

  useEffect(() => {
    if (focusOnMount) selectRef.current?.focus();
  }, [focusOnMount]);

  const problem =
    state.status === 'error'
      ? state.error === 'MISSING_CART'
        ? cartErrors.MISSING_CART
        : state.error === 'INVALID'
          ? taxUi.invalid
          : recovery.serverError
      : null;
  const saved = state.status === 'saved' && state.province ? taxUi.saved(taxCopy.provinces[state.province]) : '';
  const describe = [hintId, problem ? errorId : null, describedBy].filter(Boolean).join(' ');

  return (
    <form action={action} data-province-form data-enhanced={hydrated ? 'true' : undefined} aria-busy={pending || undefined}>
      <label htmlFor={selectId} className="block font-semibold">
        {taxCopy.provinceLabel}
      </label>
      <div className="mt-1 flex items-stretch gap-2">
        <select
          ref={selectRef}
          id={selectId}
          name="province"
          value={value}
          required
          aria-describedby={describe}
          aria-invalid={problem || describedBy ? true : undefined}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            if (e.currentTarget.value) e.currentTarget.form?.requestSubmit();
          }}
          className="focus-ring min-h-11 min-w-0 flex-1 rounded-xs border border-espresso/60 bg-ivory px-3 text-espresso"
        >
          <option value="">{taxCopy.provincePlaceholder}</option>
          {PROVINCES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          aria-disabled={pending || undefined}
          onClick={(e) => {
            if (pending) e.preventDefault();
          }}
          className={buttonClassName('secondary', 'min-h-11 shrink-0 bg-ivory !px-4')}
        >
          {taxCopy.provinceSave}
        </button>
      </div>
      <p id={hintId} className="text-small mt-2 text-walnut">
        {taxCopy.provinceHint}
      </p>
      <p className="text-small mt-1 text-walnut">{taxCopy.provinceMismatchNote}</p>
      <div role="status" aria-live="polite" aria-atomic="true">
        {saved ? <p className="sr-only">{saved}</p> : null}
        {problem ? (
          <p id={errorId} className="text-small mt-2 rounded-xs border border-espresso/40 bg-parchment px-3 py-2 font-semibold">
            {problem}
          </p>
        ) : null}
      </div>
    </form>
  );
}
