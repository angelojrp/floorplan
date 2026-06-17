import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'web/index.html'),
        editor: resolve(__dirname, 'web/editor/index.html'),
        playground: resolve(__dirname, 'web/playground/index.html'),
      },
    },
  },
});
