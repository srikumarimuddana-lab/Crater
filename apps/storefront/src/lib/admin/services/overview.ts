import { minorToAmount, toMoney } from '@/lib/commerce/money';
import { addDays, localDate, startOfLocalDay } from '../local-time';
import type { OverviewMetrics, OverviewPeriod } from '../types';
import { readAs, type Ctx } from './shared';

const DAYS: Record<OverviewPeriod, number> = { TODAY: 1, LAST_7_DAYS: 7, LAST_30_DAYS: 30 };

/**
 * Definitions (docs/admin/requirements.md 2.1), in the store timezone (TIMEZONE, default America/Regina):
 *  - paid order: financial status PAID, PARTIALLY_REFUNDED or REFUNDED, by processed time.
 *  - period: TODAY = since local midnight; LAST_7_DAYS / LAST_30_DAYS = today plus the 6 / 29 previous local days.
 *  - grossSales: sum of order subtotals (before refunds; no tax or shipping).
 *  - netSales: gross minus refunds dated in the period. Refunds ship in Slice 2, so net equals gross until then.
 *  - averageOrderValue: gross / orders rounded half up to the cent; null with no orders.
 *  - lowStockVariants: tracked variants of ACTIVE products with available <= low-stock threshold.
 *  - webhookHealth: last PROCESSED Stripe event; FAILED or REJECTED events in the last 24 hours.
 */
export function overviewService(ctx: Ctx) {
  return {
    async get(period: OverviewPeriod = 'LAST_7_DAYS'): Promise<OverviewMetrics> {
      await readAs(ctx, 'overview:read');
      const days = DAYS[period] ?? 7;
      const tz = ctx.config.timezone;
      const at = ctx.clock();
      const today = localDate(at.getTime(), tz);
      const firstDay = addDays(today, -(days - 1));
      const rows = await ctx.admin.paidOrderTotals(startOfLocalDay(firstDay, tz), at);

      const byDay = new Map<string, { orders: number; gross: number }>();
      for (let i = 0; i < days; i++) byDay.set(addDays(firstDay, i), { orders: 0, gross: 0 });
      let gross = 0;
      for (const r of rows) {
        gross += r.subtotalMinor;
        const bucket = byDay.get(localDate(new Date(r.processedAt).getTime(), tz));
        if (bucket) {
          bucket.orders += 1;
          bucket.gross += r.subtotalMinor;
        }
      }
      const orders = rows.length;
      const refundsMinor = 0; // Slice 2
      const products = await ctx.commerce.listProducts();
      let low = 0;
      for (const p of products) for (const v of p.variants) if (v.quantity !== null && v.quantity <= v.lowStockThreshold) low += 1;
      const health = await ctx.admin.webhookHealth(new Date(at.getTime() - 24 * 3600_000));

      return {
        period,
        timezone: tz,
        grossSales: toMoney(gross),
        netSales: toMoney(gross - refundsMinor),
        orders,
        averageOrderValue: orders === 0 ? null : toMoney(Math.floor((2 * gross + orders) / (2 * orders))),
        lowStockVariants: low,
        webhookHealth: { lastEventAt: health.lastProcessedAt, failedLast24h: health.failedSince },
        salesByDay: [...byDay].map(([date, b]) => ({ date, orders: b.orders, grossSales: { amount: minorToAmount(b.gross), currencyCode: 'CAD' as const } })),
      };
    },
  };
}
