export const INTEGRATION_PORT: number;
export const FAKE_STRIPE_PORT: number;
export const INTEGRATION_ORIGIN: string;
export const FAKE_STRIPE_ORIGIN: string;
export const INTEGRATION_STRIPE_KEY: string;
export const INTEGRATION_WEBHOOK_SECRET: string;
export const INTEGRATION_DIST_DIR: string;
export function requireTestDatabaseUrl(env?: Record<string, string | undefined>): string;
export function integrationServerEnv(databaseUrl: string): Record<string, string>;
