import type { z } from 'zod';
import { render } from '../src/index';
import type { Env } from './env';
import { Db } from './db';
import { anonymousClerkPort, createClerkPort, resolveUser, type ClerkPort } from './auth';
import { apiError, corsHeaders, json, noContent, tooManyRequests } from './http';
import { enforceRateLimit } from './ratelimit';
import {
  createProject, deriveFromYaml, FREE_PROJECT_LIMIT, newShareSlug,
  projectInputSchema, publicProjectView, shareInputSchema, ValidationError,
} from './projects';
import { HTML_DOCS } from './docs';

/**
 * Dependências injetáveis. `fetch` do Worker monta as reais a partir do env;
 * os testes passam um duplo do Clerk e um relógio fixo.
 */
export interface Deps {
  db: Db;
  clerk: ClerkPort;
  now: () => number;
}

/**
 * Dependências construídas sob demanda: `GET /` e `POST /render` são públicos
 * e não devem falhar quando o Worker roda sem D1 ou sem credenciais do Clerk
 * — que é exatamente o caso do deploy de documentação e dos testes da engine.
 */
export function depsFromEnv(env: Env): Deps {
  let db: Db | undefined;
  let clerk: ClerkPort | undefined;
  return {
    get db() {
      return (db ??= Db.from(env));
    },
    get clerk() {
      return (clerk ??= env?.CLERK_SECRET_KEY ? createClerkPort(env) : anonymousClerkPort);
    },
    now: () => Date.now(),
  };
}

function userView(u: { id: string; email: string; name: string | null; avatar_url: string | null; plan: string }) {
  return { id: u.id, email: u.email, name: u.name, avatar_url: u.avatar_url, plan: u.plan };
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  const isApi = path.startsWith('/api/');
  // Só as rotas autenticadas usam CORS com credenciais; o resto segue aberto.
  const isPublicApi = path === '/api/p' || path.startsWith('/api/p/');
  const cors = corsHeaders(request, env, isApi && !isPublicApi);

  if (method === 'OPTIONS') return noContent(cors);

  // ── rotas públicas preexistentes, inalteradas ──
  if (method === 'GET' && path === '/') {
    return new Response(HTML_DOCS, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors },
    });
  }

  if (method === 'POST' && path === '/render') {
    const rl = await enforceRateLimit(request, env, env?.RL_RENDER, 'render');
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds, cors);
    return handleRender(request, cors);
  }

  // Tudo que vem abaixo toca D1 ou o Clerk; o limite por IP entra antes,
  // para que uma enxurrada de requisições não vire custo de banco nem
  // verificação de sessão a cada acerto.
  if (isApi) {
    const rl = await enforceRateLimit(request, env, env?.RL_PUBLIC, 'api');
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds, cors);
  }

  // ── leitura pública de um projeto compartilhado, sem sessão ──
  const shared = path.match(/^\/api\/p\/([A-Za-z0-9_-]{1,64})$/);
  if (shared && method === 'GET') {
    const p = await deps.db.getPublicProjectBySlug(shared[1]);
    if (!p) return apiError('Projeto não encontrado', 404, cors);
    return json(publicProjectView(p), 200, cors);
  }

  if (!isApi) return apiError('Rota não encontrada. Use GET / ou POST /render', 404, cors);

  // ── daqui para baixo, tudo exige sessão ──
  const now = deps.now();
  let session;
  try {
    session = await resolveUser(deps.db, deps.clerk, request, now);
  } catch {
    return apiError('Falha ao verificar a sessão', 503, cors);
  }
  if (!session) return apiError('Não autenticado', 401, cors);
  const { user, identity } = session;

  if (path === '/api/me' && method === 'GET') return json(userView(user), 200, cors);

  if (path === '/api/auth/callback' && method === 'POST') {
    // Chamada pelo front logo após o sign-in: garante a linha local (o
    // resolveUser acima já criou, se era a primeira vez) e marca o acesso.
    await deps.db.touchLastLogin(user.id, now);
    return json(userView(user), 200, cors);
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    if (identity.sessionId) {
      try {
        await deps.clerk.revokeSession(identity.sessionId);
      } catch {
        // O logout do lado do cliente é quem manda; falhar aqui não deve
        // impedir o usuário de sair.
      }
    }
    return noContent(cors);
  }

  if (path === '/api/projects') {
    if (method === 'GET') {
      return json({ projects: await deps.db.listProjects(user.id) }, 200, cors);
    }
    if (method === 'POST') {
      const body = await readJson(request);
      if (!body.ok) return apiError('JSON inválido', 400, cors);
      const parsed = projectInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return apiError('Payload inválido', 400, cors, issueList(parsed.error));
      }
      if ((await deps.db.countProjects(user.id)) >= FREE_PROJECT_LIMIT) {
        return apiError(`Limite de ${FREE_PROJECT_LIMIT} projetos atingido`, 409, cors);
      }
      try {
        const row = await createProject(deps.db, user.id, parsed.data, now);
        return json({ id: row.id, ...publicProjectView(row) }, 201, cors);
      } catch (e) {
        if (e instanceof ValidationError) return apiError(e.message, 400, cors, e.details);
        throw e;
      }
    }
  }

  const byId = path.match(/^\/api\/projects\/([A-Za-z0-9-]{1,64})(\/share)?$/);
  if (byId) {
    const [, id, shareSuffix] = byId;

    if (shareSuffix) {
      if (method !== 'POST') return apiError('Método não permitido', 405, cors);
      const body = await readJson(request);
      if (!body.ok) return apiError('JSON inválido', 400, cors);
      const parsed = shareInputSchema.safeParse(body.value);
      if (!parsed.success) return apiError('Payload inválido', 400, cors, issueList(parsed.error));

      const existing = await deps.db.getOwnedProject(id, user.id);
      if (!existing) return apiError('Projeto não encontrado', 404, cors);

      // Republicar mantém o slug, para não quebrar links já enviados.
      const slug = parsed.data.is_public ? existing.share_slug ?? newShareSlug() : existing.share_slug;
      await deps.db.setShare(id, user.id, {
        is_public: parsed.data.is_public ? 1 : 0,
        share_slug: slug,
        updated_at: now,
      });
      return json(
        { is_public: parsed.data.is_public, share_slug: parsed.data.is_public ? slug : null },
        200,
        cors,
      );
    }

    if (method === 'GET') {
      const p = await deps.db.getOwnedProject(id, user.id);
      if (!p) return apiError('Projeto não encontrado', 404, cors);
      const { user_id: _omit, ...rest } = p;
      return json(rest, 200, cors);
    }

    if (method === 'PUT') {
      const body = await readJson(request);
      if (!body.ok) return apiError('JSON inválido', 400, cors);
      const parsed = projectInputSchema.safeParse(body.value);
      if (!parsed.success) return apiError('Payload inválido', 400, cors, issueList(parsed.error));
      let derived;
      try {
        derived = deriveFromYaml(parsed.data.yaml);
      } catch (e) {
        if (e instanceof ValidationError) return apiError(e.message, 400, cors, e.details);
        throw e;
      }
      const ok = await deps.db.updateProject(id, user.id, {
        title: parsed.data.title,
        yaml: parsed.data.yaml,
        area_m2: derived.areaM2,
        room_count: derived.roomCount,
        updated_at: now,
      });
      if (!ok) return apiError('Projeto não encontrado', 404, cors);
      return json({ id, updated_at: now, area_m2: derived.areaM2, room_count: derived.roomCount }, 200, cors);
    }

    if (method === 'DELETE') {
      const ok = await deps.db.deleteProject(id, user.id);
      if (!ok) return apiError('Projeto não encontrado', 404, cors);
      return noContent(cors);
    }
  }

  return apiError('Rota não encontrada', 404, cors);
}

// ── auxiliares ──

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

function issueList(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`);
}

/**
 * Teto do YAML aceito em `/render`. Uma planta real cabe em poucos KB; o
 * limite existe para que ninguém gaste CPU do Worker mandando megabytes.
 */
export const MAX_RENDER_BYTES = 64 * 1024;

async function handleRender(request: Request, cors: Record<string, string>): Promise<Response> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RENDER_BYTES) {
    return apiError(`Corpo maior que o limite de ${MAX_RENDER_BYTES} bytes`, 413, cors);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (
    !contentType.includes('text/plain') &&
    !contentType.includes('yaml') &&
    !contentType.includes('application/octet-stream')
  ) {
    return apiError('Content-Type deve ser text/plain ou application/x-yaml', 400, cors);
  }

  let yamlText: string;
  try {
    yamlText = await request.text();
  } catch {
    return apiError('Corpo da requisição inválido', 400, cors);
  }
  if (!yamlText || yamlText.trim().length === 0) {
    return apiError('Corpo da requisição vazio', 400, cors);
  }
  // Content-Length pode faltar (chunked) ou mentir; o texto lido é a medida real.
  if (new TextEncoder().encode(yamlText).length > MAX_RENDER_BYTES) {
    return apiError(`Corpo maior que o limite de ${MAX_RENDER_BYTES} bytes`, 413, cors);
  }

  try {
    return new Response(render(yamlText), {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml', ...cors },
    });
  } catch (e) {
    return apiError('Erro ao renderizar', 400, cors, [(e as Error).message]);
  }
}
