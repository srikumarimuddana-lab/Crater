import { formatMoney } from '@/lib/commerce/money';
import type { MoneyV2 } from '@/lib/commerce/types';

/** Formatted price with explicit currency code, e.g. "$68.00 CAD". Safe in server and client components. */
export function Price({ money, className }: { money: MoneyV2; className?: string }) {
  return (
    <span className={className} data-currency={money.currencyCode}>
      {formatMoney(money)}
    </span>
  );
}
