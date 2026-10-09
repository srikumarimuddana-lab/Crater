import { taxSettingsView } from '@/lib/commerce/tax';
import type { StoreSettings } from '../types';
import { readAs, type Ctx } from './shared';

/** Read-only store settings for the admin Settings screen (Slice 1: nothing here is editable). */
export function settingsService(ctx: Ctx) {
  return {
    async get(): Promise<StoreSettings> {
      await readAs(ctx, 'overview:read');
      return { timezone: ctx.config.timezone, currency: 'CAD', tax: taxSettingsView() };
    },
  };
}
