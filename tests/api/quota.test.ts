import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { Db } from '../../api/db';
import type { Env } from '../../api/env';
import {
  ANON_RENDER_LIMIT, FREE_RENDER_LIMIT, clientIp, consumeAnonQuota,
  consumeUserQuota, currentPeriod, hashIp,
} from '../../api/quota';

const db = () => Db.from(env as unknown as Env);
const SEP = Date.UTC(2026, 8, 15); // 2026-09-15
const OCT = Date.UTC(2026, 9, 2);  // 2026-10-02

async function user(id: string) {
  await db().insertUser({
    id, clerk_user_id: 'clerk_' + id, email: `${id}@example.com`, name: null,
    avatar_url: null, provider: 'google', provider_id: null, plan: 'free',
    created_at: SEP, last_login_at: SEP,
  });
  return id;
}

describe('período', () => {
  it('usa o mês corrente em UTC com dois dígitos', () => {
    expect(currentPeriod(SEP)).toBe('2026-09');
    expect(currentPeriod(OCT)).toBe('2026-10');
    expect(currentPeriod(Date.UTC(2026, 0, 1))).toBe('2026-01');
  });
});

describe('hashIp', () => {
  it('é determinístico, mas depende do segredo', async () => {
    const a = await hashIp('203.0.113.7', { IP_HASH_SECRET: 's1' } as Env);
    const b = await hashIp('203.0.113.7', { IP_HASH_SECRET: 's1' } as Env);
    const c = await hashIp('203.0.113.7', { IP_HASH_SECRET: 's2' } as Env);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('separa IPs diferentes e nunca devolve o IP em claro', async () => {
    const e = { IP_HASH_SECRET: 's1' } as Env;
    const a = await hashIp('203.0.113.7', e);
    expect(a).not.toBe(await hashIp('203.0.113.8', e));
    expect(a).not.toContain('203');
  });

  it('sem segredo devolve null em vez de gravar hash reversível', async () => {
    expect(await hashIp('203.0.113.7', {} as Env)).toBeNull();
  });

  it('lê o IP do header da Cloudflare', () => {
    expect(clientIp(new Request('https://x', { headers: { 'CF-Connecting-IP': '1.2.3.4' } }))).toBe('1.2.3.4');
    expect(clientIp(new Request('https://x'))).toBeNull();
  });
});

describe('quota de usuário', () => {
  it('conta os usos e bloqueia ao passar do limite', async () => {
    const id = await user('u_quota');
    for (let i = 1; i <= FREE_RENDER_LIMIT; i++) {
      const r = await consumeUserQuota(db(), id, SEP);
      expect(r.used, `uso ${i}`).toBe(i);
      expect(r.allowed).toBe(true);
    }
    const over = await consumeUserQuota(db(), id, SEP);
    expect(over.used).toBe(FREE_RENDER_LIMIT + 1);
    expect(over.allowed).toBe(false);
  });

  it('zera na virada do mês', async () => {
    const id = await user('u_mes');
    await consumeUserQuota(db(), id, SEP);
    await consumeUserQuota(db(), id, SEP);
    expect(await db().getUserQuota(id, '2026-09')).toBe(2);

    const outubro = await consumeUserQuota(db(), id, OCT);
    expect(outubro.used).toBe(1);
    // E o mês anterior continua registrado.
    expect(await db().getUserQuota(id, '2026-09')).toBe(2);
  });

  it('não mistura usuários', async () => {
    const a = await user('u_a');
    const b = await user('u_b');
    await consumeUserQuota(db(), a, SEP);
    await consumeUserQuota(db(), a, SEP);
    expect((await consumeUserQuota(db(), b, SEP)).used).toBe(1);
    expect(await db().getUserQuota(a, '2026-09')).toBe(2);
  });

  it('incrementos concorrentes não se perdem', async () => {
    const id = await user('u_corrida');
    // O UPSERT é atômico; um read-modify-write perderia escritas aqui.
    await Promise.all(Array.from({ length: 8 }, () => consumeUserQuota(db(), id, SEP)));
    expect(await db().getUserQuota(id, '2026-09')).toBe(8);
  });
});

describe('quota anônima', () => {
  it('conta por hash de IP e bloqueia ao passar do limite', async () => {
    const h = (await hashIp('198.51.100.9', { IP_HASH_SECRET: 'x' } as Env))!;
    for (let i = 1; i <= ANON_RENDER_LIMIT; i++) {
      expect((await consumeAnonQuota(db(), h, SEP)).allowed, `uso ${i}`).toBe(true);
    }
    expect((await consumeAnonQuota(db(), h, SEP)).allowed).toBe(false);
  });

  it('IPs distintos têm contas distintas', async () => {
    const e = { IP_HASH_SECRET: 'x' } as Env;
    const h1 = (await hashIp('198.51.100.1', e))!;
    const h2 = (await hashIp('198.51.100.2', e))!;
    await consumeAnonQuota(db(), h1, SEP);
    await consumeAnonQuota(db(), h1, SEP);
    expect((await consumeAnonQuota(db(), h2, SEP)).used).toBe(1);
  });
});
