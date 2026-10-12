export default {
  test: {
    pool: 'threads',
    maxWorkers: 1,
    setupFiles: ['./src/testing/vitest-setup.ts'],
  },
};
