import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // `server-only` throws outside the react-server condition; stub it for unit tests.
      { find: /^server-only$/, replacement: path.resolve(__dirname, 'tests/unit/helpers/server-only-stub.ts') },
    ],
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    // Postgres suites share one throwaway database, so test files run one at a time.
    fileParallelism: false,
  },
});
