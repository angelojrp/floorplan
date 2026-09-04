declare module 'cloudflare:test' {
  import type { D1Migration } from '@cloudflare/vitest-pool-workers/types';
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
