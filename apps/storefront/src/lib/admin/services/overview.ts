import { toMoney } from '@/lib/commerce/money';
import { readRefundTotals, readSales } from '@/lib/analytics/report';
import type { Mode } from '@/lib/analytics/schema';
import { addDays } from '../local-time';
import type { OverviewMetrics, OverviewPeriod } from '../types';
import { readAs, type Ctx } from './shared';

const DAYS: Record<OverviewPeriod, number> = { TODAY: 1, LAST_7_DAYS: 7, LAST_30_DAYS: 30 };
export type OverviewReport = OverviewMetrics & {
  mode: Mode;
  refunds: ReturnType<typeof toMoney>;
  productRefunds: ReturnType<typeof toMoney>;
  shipping: ReturnType<typeof toMoney>;
  tax: ReturnType<typeof toMoney>;
  fulfilmentBacklog: number;
};

/** Same UTC dates, order source, mode separation and refund policy as Sales & traffic.
 * Overview permission deliberately preserves Support's existing aggregate-sales access;
 * it never grants access to individual finance records or traffic analytics.
 */
export function overviewService(ctx: Ctx) {
  return {
    async get(period: OverviewPeriod = 'LAST_7_DAYS', mode: Mode = 'stripe-test'): Promise<OverviewReport> {
      await readAs(ctx, 'overview:read');
      if (!['stripe-test', 'stripe-live', 'fixture'].includes(mode)) throw new Error('Unknown payment mode.');
      const days = DAYS[period] ?? 7;
      const at = ctx.clock();
      const today = at.toISOString().slice(0, 10);
      const firstDay = addDays(today, -(days - 1));
      const from = new Date(`${firstDay}T00:00:00Z`);
      const through = new Date(`${addDays(today, 1)}T00:00:00Z`);
      const [sales, refunds, products, health] = await Promise.all([
        readSales(ctx.commerce, from, through, mode),
        readRefundTotals(ctx.commerce, from, through, mode),
        ctx.commerce.listProducts(),
        ctx.admin.webhookHealth(new Date(at.getTime() - 24 * 3600_000)),
      ]);
      const low = products.flatMap(p => p.variants).filter(v => v.quantity !== null && v.quantity <= v.lowStockThreshold).length;
      return {
        period, mode, timezone: 'UTC',
        grossSales: toMoney(sales.grossMinor),
        netSales: toMoney(sales.grossMinor - refunds.productMinor),
        refunds: toMoney(refunds.totalMinor),
        productRefunds: toMoney(refunds.productMinor),
        shipping: toMoney(sales.shippingMinor),
        tax: toMoney(sales.taxMinor),
        fulfilmentBacklog: sales.backlog,
        orders: sales.orders,
        averageOrderValue: sales.orders === 0 ? null : toMoney(Math.round(sales.grossMinor / sales.orders)),
        lowStockVariants: low,
        webhookHealth: { lastEventAt: health.lastProcessedAt, failedLast24h: health.failedSince },
        salesByDay: Array.from({ length: days }, (_, i) => {
          const date = addDays(firstDay, i);
          const row = sales.daily.find(d => d.date === date);
          return { date, orders: row?.orders ?? 0, grossSales: toMoney(row?.grossMinor ?? 0) };
        }),
      };
    },
  };
}
