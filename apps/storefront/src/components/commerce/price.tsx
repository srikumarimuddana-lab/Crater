import { formatMoney, type Money } from '@/lib/content/fixtures';

/** Formatted price with explicit currency code, e.g. "$68.00 CAD". */
export function Price({ money, className }: { money: Money; className?: string }) {
  return (
    <span className={className} data-currency={money.currencyCode}>
      {formatMoney(money)} {money.currencyCode}
    </span>
  );
}
