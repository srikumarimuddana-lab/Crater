import type { ID, MoneyV2 } from '@/lib/commerce/types';
import type { PostalAddress, ProductStatus, StockAdjustmentReason } from './types';

/**
 * Types for the admin services that are not part of the coordinator-owned contract (types.ts).
 * Everything the UI needs beyond types.ts is declared here and exported from `@/lib/admin`.
 */

/** Price-free data for a packing slip. Never includes money, email or internal notes. */
export type PackingSlip = {
  orderId: ID;
  orderName: string;
  processedAt: string;
  shippingAddress: PostalAddress | null;
  packingInstructions: string | null;
  lines: { title: string; variantTitle: string; sku: string; quantity: number }[];
};

export type AdminProductSummary = {
  id: ID;
  handle: string;
  title: string;
  productType: string;
  status: ProductStatus;
  sample: boolean;
  variantCount: number;
  /** Sellable units across tracked variants. */
  available: number;
  priceFrom: MoneyV2 | null;
  priceTo: MoneyV2 | null;
  /** True when every publish check passes. */
  publishable: boolean;
  updatedAt: string;
};

export type AdminProductsQuery = { status?: ProductStatus; query?: string };

export type InventoryLevel = {
  variantId: ID;
  productId: ID;
  productTitle: string;
  productHandle: string;
  productStatus: ProductStatus;
  variantTitle: string;
  sku: string;
  /** False when stock is not tracked (available/onHand are then null). */
  tracked: boolean;
  available: number | null;
  committed: number;
  onHand: number | null;
  lowStockThreshold: number;
  /** Tracked and available <= threshold. */
  low: boolean;
  openCartCount: number;
};

export type InventoryQuery = { query?: string; onlyLow?: boolean; includeArchived?: boolean };

export type AdjustStockInput = {
  variantId: ID;
  /** Non-zero integer; + adds to available stock, - removes. */
  delta: number;
  reason: StockAdjustmentReason;
  /** Required (3+ characters) for OTHER. Not copied to the audit log. */
  note?: string | null;
};

export type MarkFulfilledInput = { orderId: ID; carrier: string; trackingNumber: string };
export type UpdateNotesInput = { orderId: ID; packingInstructions?: string | null; internalNotes?: string | null };
export type SetStatusInput = { id: ID; status: ProductStatus; expectedUpdatedAt?: string };

export type PageQuery = { first?: number; after?: string | null };
export type MovementsQuery = PageQuery & { variantId?: ID };
