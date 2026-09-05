import type { Env } from './env';

/**
 * CORS.
 *
 * Rotas públicas (documentação, /render, /api/p/:slug) seguem abertas com `*`.
 * Rotas autenticadas precisam de credenciais, e o navegador proíbe `*` junto
 * de `Allow-Credentials`; por isso a origem é refletida, e só quando consta em
 * CLERK_AUTHORIZED_PARTIES — a mesma lista que autoriza a sessão.
 */
export function corsHeaders(request: Request, env: Env, credentials = false): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (!credentials) return { ...base, 'Access-Control-Allow-Origin': '*' };

  const origin = request.headers.get('Origin');
  const allowed = (env.CLERK_AUTHORIZED_PARTIES ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return {
      ...base,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    };
  }
  // Mesma origem (sem header Origin) ou origem não autorizada: sem CORS.
  return base;
}

export function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function noContent(headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 204, headers });
}

/** Erro de API no formato que o resto do Worker já usa: `{ error, details? }`. */
export function apiError(
  message: string,
  status: number,
  headers: Record<string, string> = {},
  details?: string[],
): Response {
  return json(details ? { error: message, details } : { error: message }, status, headers);
}

/** 429 com `Retry-After`, para o cliente saber quando voltar. */
export function tooManyRequests(
  retryAfterSeconds: number,
  headers: Record<string, string> = {},
): Response {
  return apiError('Muitas requisições. Tente novamente em instantes.', 429, {
    ...headers,
    'Retry-After': String(retryAfterSeconds),
  });
}
