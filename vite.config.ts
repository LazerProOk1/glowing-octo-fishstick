import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    // All 18 cores at once starve the timing bound and vitest's own RPC; half is as fast in practice.
    maxWorkers: '50%',
  },
});
