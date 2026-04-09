import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['wizard/__tests__/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 15000,
    hookTimeout: 10000,
  },
});
