import type { Env } from './env';
import { clientIp, hashIp } from './quota';

/**
 * Limite de taxa por IP nas rotas públicas.
 *
 * Por que por IP e não por User-Agent: `/render` existe justamente para ser
 * chamado por robô (CLI, agentes de IA, integrações). Bloquear por UA
 * derrubaria o uso legítimo e não segura ninguém — trocar o UA é uma linha.
 * O que interessa aqui é o volume: um cliente honesto renderiza algumas
 * plantas por minuto; um scraper faz centenas.
 *
 * Usa o binding de Rate Limiting da Cloudflare (contagem na borda, sem
 * escrita em D1 — um limitador que grava no banco a cada requisição vira ele
 * mesmo o alvo do abuso). Sem o binding — dev local, testes da engine — a
 * função libera, para que nada que hoje funciona sem configuração pare.
 */

/** Forma do binding `[[ratelimits]]` do Workers. */
export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Segundos a esperar; vira o header `Retry-After` do 429. */
  retryAfterSeconds: number;
}

/** Janela dos buckets declarados em `api/wrangler.toml`. */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

const ALLOWED: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

/**
 * Consome uma unidade do bucket `scope` para o IP da requisição.
 *
 * A chave é o HMAC do IP quando há `IP_HASH_SECRET`, pelo mesmo motivo da
 * quota anônima (LGPD): o IP em claro não precisa circular por serviço nenhum.
 */
export async function enforceRateLimit(
  request: Request,
  env: Env,
  binding: RateLimiterBinding | undefined,
  scope: string,
): Promise<RateLimitResult> {
  if (!binding) return ALLOWED;
  const ip = clientIp(request);
  if (!ip) return ALLOWED;

  const key = `${scope}:${(await hashIp(ip, env)) ?? ip}`;
  try {
    const { success } = await binding.limit({ key });
    return success ? ALLOWED : { allowed: false, retryAfterSeconds: RATE_LIMIT_WINDOW_SECONDS };
  } catch {
    // Falha do limitador não pode virar indisponibilidade da API.
    return ALLOWED;
  }
}
