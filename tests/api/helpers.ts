import { env } from 'cloudflare:test';
import { Db } from '../../api/db';
import { handle, type Deps } from '../../api/app';
import type { ClerkIdentity, ClerkPort, ClerkProfile } from '../../api/auth';
import type { Env } from '../../api/env';

/**
 * Duplo do Clerk: mapeia um token opaco de teste para uma identidade, sem
 * rede nem credenciais. `authenticate` lê o mesmo header Authorization que a
 * implementação real leria.
 */
export function fakeClerk(users: Record<string, ClerkProfile>): ClerkPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async authenticate(request: Request): Promise<ClerkIdentity | null> {
      const auth = request.headers.get('Authorization') ?? '';
      const token = auth.replace(/^Bearer\s+/i, '');
      if (!token || !(token in users)) return null;
      return { clerkUserId: token, sessionId: `sess_${token}` };
    },
    async getProfile(clerkUserId: string): Promise<ClerkProfile> {
      calls.push(`getProfile:${clerkUserId}`);
      const p = users[clerkUserId];
      if (!p) throw new Error('sem perfil');
      return p;
    },
    async revokeSession(sessionId: string) {
      calls.push(`revoke:${sessionId}`);
    },
  };
}

export const profile = (email: string, overrides: Partial<ClerkProfile> = {}): ClerkProfile => ({
  email, name: email.split('@')[0], avatarUrl: null,
  provider: 'google', providerId: 'g_' + email, ...overrides,
});

/** Cliente de teste: um `handle()` com D1 real, Clerk falso e relógio fixo. */
export function client(clerk: ClerkPort, now = () => 1_700_000_000_000) {
  const deps: Deps = { db: Db.from(env as unknown as Env), clerk, now };
  const call = (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    return handle(
      new Request('https://api.test' + path, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      }),
      env as unknown as Env,
      deps,
    );
  };
  return {
    deps,
    call,
    async json<T = any>(method: string, path: string, opts?: { token?: string; body?: unknown }) {
      const res = await call(method, path, opts);
      const text = await res.text();
      return { status: res.status, body: text ? (JSON.parse(text) as T) : null };
    },
  };
}

/** Uma planta mínima que a engine aceita. */
export const YAML_OK = `version: 1
scale: 2
rooms:
  - id: sala
    name: Sala
    x: 0
    y: 0
    width: 500
    height: 400
`;

/** 500x400 + 300x200 = 20 + 6 = 26 m², 2 cômodos. */
export const YAML_TWO_ROOMS = `version: 1
scale: 2
rooms:
  - id: sala
    name: Sala
    x: 0
    y: 0
    width: 500
    height: 400
  - id: cozinha
    name: Cozinha
    x: 500
    y: 0
    width: 300
    height: 200
`;
