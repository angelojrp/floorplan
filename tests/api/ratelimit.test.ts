import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { Db } from '../../api/db';
import { handle, MAX_RENDER_BYTES, type Deps } from '../../api/app';
import type { Env } from '../../api/env';
import { enforceRateLimit, type RateLimiterBinding } from '../../api/ratelimit';
import { fakeClerk } from './helpers';

const YAML = [
  'version: 1',
  'title: "Teste"',
  'scale: 2',
  'wallThickness: 15',
  'grid: 100',
  'rooms:',
  '  - id: sala',
  '    name: Sala',
  '    x: 0',
  '    y: 0',
  '    width: 400',
  '    height: 300',
  '',
].join('\n');

/** Binding falso: registra as chaves vistas e responde conforme `allow`. */
function fakeLimiter(allow: boolean): RateLimiterBinding & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      return { success: allow };
    },
  };
}

const baseEnv = () => ({ ...(env as unknown as Env), IP_HASH_SECRET: 'segredo-de-teste' }) as Env;

const deps = (): Deps => ({
  db: Db.from(env as unknown as Env),
  clerk: fakeClerk({}),
  now: () => 1_700_000_000_000,
});

function renderRequest(body = YAML, ip = '203.0.113.7') {
  return new Request('https://api.test/render', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'CF-Connecting-IP': ip },
    body,
  });
}

describe('POST /render com limite por IP', () => {
  it('segue aberto quando o binding não está configurado', async () => {
    const res = await handle(renderRequest(), baseEnv(), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('deixa passar enquanto o bucket permite', async () => {
    const rl = fakeLimiter(true);
    const res = await handle(renderRequest(), { ...baseEnv(), RL_RENDER: rl }, deps());
    expect(res.status).toBe(200);
    expect(rl.keys).toHaveLength(1);
  });

  it('responde 429 com Retry-After quando o bucket estoura', async () => {
    const res = await handle(
      renderRequest(),
      { ...baseEnv(), RL_RENDER: fakeLimiter(false) },
      deps(),
    );
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('não deixa o limitador quebrado derrubar a API', async () => {
    const quebrado: RateLimiterBinding = {
      async limit() {
        throw new Error('binding fora do ar');
      },
    };
    const res = await handle(renderRequest(), { ...baseEnv(), RL_RENDER: quebrado }, deps());
    expect(res.status).toBe(200);
  });
});

describe('chave do limite', () => {
  const req = (ip: string | null) =>
    new Request('https://api.test/render', {
      method: 'POST',
      headers: ip ? { 'CF-Connecting-IP': ip } : {},
    });

  it('separa IPs diferentes e não repete o IP em claro', async () => {
    const rl = fakeLimiter(true);
    const e = baseEnv();
    await enforceRateLimit(req('203.0.113.7'), e, rl, 'render');
    await enforceRateLimit(req('198.51.100.4'), e, rl, 'render');
    expect(rl.keys[0]).not.toBe(rl.keys[1]);
    expect(rl.keys.join()).not.toContain('203.0.113.7');
    expect(rl.keys.every((k) => k.startsWith('render:'))).toBe(true);
  });

  it('separa escopos, para /render e /api não dividirem o mesmo bucket', async () => {
    const rl = fakeLimiter(true);
    const e = baseEnv();
    await enforceRateLimit(req('203.0.113.7'), e, rl, 'render');
    await enforceRateLimit(req('203.0.113.7'), e, rl, 'api');
    expect(rl.keys[0]).not.toBe(rl.keys[1]);
  });

  it('libera quando não há IP na requisição', async () => {
    const rl = fakeLimiter(false);
    const r = await enforceRateLimit(req(null), baseEnv(), rl, 'render');
    expect(r.allowed).toBe(true);
    expect(rl.keys).toHaveLength(0);
  });
});

describe('teto de tamanho do YAML', () => {
  it('recusa corpo acima do limite com 413', async () => {
    const grande = 'a'.repeat(MAX_RENDER_BYTES + 1);
    const res = await handle(renderRequest(grande), baseEnv(), deps());
    expect(res.status).toBe(413);
  });

  it('recusa pelo Content-Length antes de ler o corpo', async () => {
    const req = new Request('https://api.test/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': String(MAX_RENDER_BYTES + 1),
        'CF-Connecting-IP': '203.0.113.7',
      },
      body: YAML,
    });
    const res = await handle(req, baseEnv(), deps());
    expect(res.status).toBe(413);
  });
});

describe('rotas /api públicas', () => {
  it('respondem 429 sem consultar o banco quando o bucket estoura', async () => {
    const res = await handle(
      new Request('https://api.test/api/p/qualquer', {
        headers: { 'CF-Connecting-IP': '203.0.113.7' },
      }),
      { ...baseEnv(), RL_PUBLIC: fakeLimiter(false) },
      deps(),
    );
    expect(res.status).toBe(429);
  });
});
