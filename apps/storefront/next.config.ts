import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Separate build output for the integration suite (Postgres + fake Stripe), so it never clobbers `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
};

export default nextConfig;
