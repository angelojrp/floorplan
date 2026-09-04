import type { Db } from './db';
import type { Env } from './env';

/** Período de cobrança: mês corrente em UTC, no formato '2026-09'. */
export function currentPeriod(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Anonimiza o IP para a contagem de uso anônimo.
 *
 * HMAC-SHA256 com um segredo do servidor, nunca o IP em claro nem um hash
 * simples: o espaço de IPv4 tem só ~4 bilhões de valores, então um SHA-256
 * puro é reversível por força bruta em minutos, e o hash continuaria sendo
 * dado pessoal. Sem `IP_HASH_SECRET` a função devolve null e quem chama deve
 * deixar a requisição passar, em vez de gravar algo reversível.
 */
export async function hashIp(ip: string, env: Env): Promise<string | null> {
  if (!env.IP_HASH_SECRET) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.IP_HASH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** IP do cliente atrás do proxy da Cloudflare. */
export function clientIp(request: Request): string | null {
  return request.headers.get('CF-Connecting-IP') ?? null;
}

export interface QuotaResult {
  used: number;
  limit: number;
  allowed: boolean;
}

export const FREE_RENDER_LIMIT = 10;
export const ANON_RENDER_LIMIT = 3;

/**
 * Consome uma unidade de quota do usuário e diz se a operação cabe.
 *
 * Escrita antes da leitura, num único UPSERT atômico com RETURNING: um
 * read-modify-write permitiria estourar o limite com requisições simultâneas.
 * Como o incremento vem primeiro, `used` já inclui esta chamada.
 */
export async function consumeUserQuota(
  db: Db, userId: string, now: number, limit = FREE_RENDER_LIMIT,
): Promise<QuotaResult> {
  const used = await db.bumpUserQuota(userId, currentPeriod(now), 1);
  return { used, limit, allowed: used <= limit };
}

export async function consumeAnonQuota(
  db: Db, ipHash: string, now: number, limit = ANON_RENDER_LIMIT,
): Promise<QuotaResult> {
  const used = await db.bumpAnonQuota(ipHash, currentPeriod(now), 1);
  return { used, limit, allowed: used <= limit };
}
