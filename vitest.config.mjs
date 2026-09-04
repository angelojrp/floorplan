import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        // Engine e o handler de render: Node puro, sem bindings.
        test: {
          name: 'engine',
          root,
          include: ['tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
          exclude: ['tests/api/**'],
        },
      },
      {
        // API: roda dentro do workerd com D1 e R2 de verdade (Miniflare).
        plugins: [
          // Função async: este config é empacotado como CJS, onde
          // top-level await não é suportado.
          cloudflareTest(async () => ({
            wrangler: { configPath: './api/wrangler.toml' },
            miniflare: {
              // Lidas em Node e injetadas para o setup aplicar no D1 de teste.
              bindings: { TEST_MIGRATIONS: await readD1Migrations(join(root, 'migrations')) },
            },
          })),
        ],
        test: {
          name: 'api',
          root,
          include: ['tests/api/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
          setupFiles: ['./tests/api/setup.ts'],
        },
      },
    ],
  },
});
