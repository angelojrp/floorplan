import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// O pool dá a cada arquivo de teste um D1 isolado; aplicamos as migrations
// reais de migrations/ para que os testes exercitem o SQL que vai a produção.
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
