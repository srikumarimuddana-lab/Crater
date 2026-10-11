import type { AdminOrder, ProductStatus } from '@/lib/admin';
import { FINANCIAL_LABEL, FULFILMENT_LABEL } from './format';
import { StatusBadge } from './ui';

export function FinancialBadge({ status }: { status: AdminOrder['financialStatus'] }) {
  const label = FINANCIAL_LABEL[status] ?? status;
  switch (status) {
    case 'PAID':
      return <StatusBadge tone="success" shape="check-circle" label={label} />;
    case 'PARTIALLY_REFUNDED':
      return <StatusBadge tone="info" shape="half-circle" label={label} />;
    case 'REFUNDED':
      return <StatusBadge shape="return" label={label} />;
    case 'VOIDED':
      return <StatusBadge shape="slash-circle" label={label} />;
    default:
      return <StatusBadge shape="circle" label={label} />;
  }
}

export function FulfilmentBadge({ status }: { status: AdminOrder['fulfilmentStatus'] }) {
  const label = FULFILMENT_LABEL[status] ?? status;
  return status === 'FULFILLED' ? <StatusBadge tone="success" shape="check-square" label={label} /> : <StatusBadge tone="warning" shape="square" label={label} />;
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  if (status === 'ACTIVE') return <StatusBadge tone="success" shape="check-circle" label="Active" />;
  if (status === 'ARCHIVED') return <StatusBadge shape="slash-circle" label="Archived" />;
  return <StatusBadge shape="circle" label="Draft" />;
}
