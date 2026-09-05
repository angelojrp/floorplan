/**
 * Bindings e segredos do Worker.
 *
 * D1 e R2 vêm de `api/wrangler.toml`. Os segredos são definidos com
 * `wrangler secret put <NOME> --config api/wrangler.toml`; em dev local,
 * por um `.dev.vars` na raiz de api/ (não versionado).
 */
import type { RateLimiterBinding } from './ratelimit';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;

  /**
   * Buckets de limite de taxa por IP (`[[ratelimits]]` em api/wrangler.toml).
   * Opcionais: sem eles o Worker roda igual a antes, sem limite — é assim que
   * os testes da engine e o `wrangler dev` sem config continuam funcionando.
   */
  RL_RENDER?: RateLimiterBinding;
  RL_PUBLIC?: RateLimiterBinding;

  /** Chave secreta do Clerk (sk_...). */
  CLERK_SECRET_KEY?: string;
  /** Chave publicável do Clerk (pk_...), usada para derivar a chave de verificação. */
  CLERK_PUBLISHABLE_KEY?: string;
  /**
   * Origens autorizadas a apresentar sessões do Clerk. Lista separada por
   * vírgula. Sem isso, um token emitido para outro site seria aceito aqui.
   */
  CLERK_AUTHORIZED_PARTIES?: string;

  /**
   * Segredo do HMAC que anonimiza o IP em `anon_quota`. Obrigatório para a
   * contagem anônima; sem ele, a quota anônima é desativada em vez de gravar
   * um hash reversível.
   */
  IP_HASH_SECRET?: string;
}
