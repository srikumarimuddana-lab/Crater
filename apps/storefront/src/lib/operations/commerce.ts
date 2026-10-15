import 'server-only';
import { syncFinanceOrders, syncFinanceCosts, reconcileStripe } from '@/lib/finance';
import { reconcileOrderCommunications } from './reconcile';
import { syncAnalyticsPurchases, runAnalyticsRetention } from '@/lib/analytics/repository';
import { logger } from '@/lib/commerce/log';
import { readConfig, stripeUsable } from '@/lib/commerce/config';
/** Every source is persisted; replay repairs interrupted post-commit work without sending inline. */
export async function reconcileCommerceEffects() {
  const finance = await syncFinanceOrders();
  const costs = await syncFinanceCosts();
  const communications = await reconcileOrderCommunications();
  const purchases = await syncAnalyticsPurchases();
  return { finance, costs, communications, purchases, refunds:communications.refunds, shipments:communications.shipments };
}
/** Called after committed business actions. Failures remain recoverable from source rows. */
export async function attemptCommerceEffects() {
  try { await reconcileCommerceEffects(); } catch(e) { logger.error('commerce effects pending reconciliation',e); }
}
export async function runCommerceMaintenance() {
  const recovered = await reconcileCommerceEffects();
  const config = readConfig(); let provider:unknown = { skipped: true };
  if (stripeUsable(config)) { provider = await reconcileStripe(config.mode === 'stripe-live' ? 'live' : 'test'); await reconcileCommerceEffects(); }
  await runAnalyticsRetention();
  return { ...recovered, provider };
}
