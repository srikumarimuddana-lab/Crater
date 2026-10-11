import type { TaxRateApi } from '../src/lib/commerce/tax-rates';
export function checkKey(env: Record<string, string | undefined>): { key: string; mode: 'test' | 'live' };
export function run(options?: {
  env?: Record<string, string | undefined>;
  api?: TaxRateApi;
  log?: (line: string) => void;
}): Promise<{ key: string; id: string; action: 'kept' | 'created' | 'replaced'; archived: string[] }[]>;
