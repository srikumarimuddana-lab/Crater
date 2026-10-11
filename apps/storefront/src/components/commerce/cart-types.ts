import type { CartErrorCode, CartWarningCode, MoneyV2, ProvinceCode } from '@/lib/commerce/types';

/** Largest quantity per line the backend accepts. */
export const MAX_LINE_QUANTITY = 10;

/** Serializable cart projection passed from Server Components to client islands. */
export type CartLineView = {
  id: string;
  quantity: number;
  /** min(10, real quantityAvailable). Used to disable Increase. */
  maxQuantity: number;
  handle: string;
  title: string;
  variantTitle: string;
  optionLabel: string;
  imageUrl: string | null;
  unitPrice: MoneyV2;
  /** The unit price the shopper last saw, set only when it differs from `unitPrice`. */
  previousUnitPrice: MoneyV2 | null;
  lineTotal: MoneyV2;
  available: boolean;
};

export type CartTaxLineView = { key: string; title: string; ratePercent: string; amount: MoneyV2 };

export type CartView = {
  totalQuantity: number;
  subtotal: MoneyV2;
  /** Ship-to province chosen in the bag; null until the shopper picks one. */
  provinceCode: ProvinceCode | null;
  /** Per-tax breakdown for the province; empty while the province is unknown. */
  taxLines: CartTaxLineView[];
  /** Subtotal plus tax. Equals the subtotal while taxes are unknown (see `taxesKnown`). */
  total: MoneyV2;
  /** True once a province is set and the backend has computed the tax. */
  taxesKnown: boolean;
  /** True while any line's current price differs from the price the shopper last saw. */
  hasPriceChanges: boolean;
  lines: CartLineView[];
};

/** Result of a cart Server Action. Codes only: the UI maps them to shop-copy. */
export type CartActionState = {
  status: 'idle' | 'added' | 'updated' | 'removed' | 'error';
  /** Backend userError codes. */
  errors: CartErrorCode[];
  warnings: { code: CartWarningCode; title: string }[];
  /** True when the action itself failed (exception), not a userError. */
  serverError: boolean;
  totalQuantity: number | null;
  subtotal: MoneyV2 | null;
  /** Quantity of the touched line after the action (null when removed or unknown). */
  lineQuantity: number | null;
  /** For add: how many units this request actually added (after clamping). */
  addedQuantity: number;
  /** Changes on every result so effects can detect a new one. */
  ts: number;
};

export const initialCartActionState: CartActionState = {
  status: 'idle',
  errors: [],
  warnings: [],
  serverError: false,
  totalQuantity: null,
  subtotal: null,
  lineQuantity: null,
  addedQuantity: 0,
  ts: 0,
};

export const OPEN_BAG_EVENT = 'crater:open-bag';

/** Detail of the OPEN_BAG_EVENT CustomEvent. */
export type OpenBagDetail = { notices: string[] };

/** Result of the acknowledgePrices Server Action. */
export type AckState = {
  status: 'idle' | 'acknowledged' | 'error';
  ts: number;
};

export const initialAckState: AckState = { status: 'idle', ts: 0 };

/** Result of the setProvince Server Action. Codes only: the UI maps them to copy. */
export type ProvinceActionState = {
  status: 'idle' | 'saved' | 'error';
  province: ProvinceCode | null;
  error: 'INVALID' | 'MISSING_CART' | 'SERVER' | null;
  ts: number;
};

export const initialProvinceState: ProvinceActionState = { status: 'idle', province: null, error: null, ts: 0 };
