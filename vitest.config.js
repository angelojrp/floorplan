import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
});
