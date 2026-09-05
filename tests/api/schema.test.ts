import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const tables = () =>
  env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name",
  ).all<{ name: string }>();

describe('migrations/0001_init.sql', () => {
  it('cria as tabelas do schema', async () => {
    const { results } = await tables();
    expect(results.map((r) => r.name)).toEqual([
      'anon_quota', 'projects', 'renders', 'usage_quota', 'users',
    ]);
  });

  it('é idempotente — reaplicar não recria nem falha', async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    const { results } = await tables();
    expect(results).toHaveLength(5);
  });
});
