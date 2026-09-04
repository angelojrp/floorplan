import { createClerkClient } from '@clerk/backend';
import type { Env } from './env';
import type { Db, UserRow } from './db';

/** Quem o Clerk diz que é o portador da requisição. */
export interface ClerkIdentity {
  clerkUserId: string;
  sessionId: string | null;
}

/** Perfil buscado no Clerk na primeira vez que vemos o usuário. */
export interface ClerkProfile {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  provider: string;          // 'google' | 'email'
  providerId: string | null;
}

/**
 * Porta para o Clerk. O Worker injeta a implementação real; os testes injetam
 * um duplo, para que a suíte de API não dependa de rede nem de credenciais.
 */
export interface ClerkPort {
  authenticate(request: Request): Promise<ClerkIdentity | null>;
  getProfile(clerkUserId: string): Promise<ClerkProfile>;
  revokeSession(sessionId: string): Promise<void>;
}

/** Porta que recusa todo mundo — usada quando o Worker roda sem credenciais do Clerk. */
export const anonymousClerkPort: ClerkPort = {
  async authenticate() { return null; },
  async getProfile() { throw new Error('Clerk não configurado'); },
  async revokeSession() { /* nada a revogar */ },
};

export function createClerkPort(env: Env): ClerkPort {
  if (!env.CLERK_SECRET_KEY) return anonymousClerkPort;

  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });
  const authorizedParties = (env.CLERK_AUTHORIZED_PARTIES ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  return {
    async authenticate(request) {
      // Aceita tanto o cookie de sessão (mesma origem) quanto
      // `Authorization: Bearer` (origem cruzada) — o Clerk resolve os dois.
      const state = await clerk.authenticateRequest(request, {
        authorizedParties: authorizedParties.length ? authorizedParties : undefined,
      });
      if (!state.isAuthenticated) return null;
      const auth = state.toAuth();
      if (!auth?.userId) return null;
      return { clerkUserId: auth.userId, sessionId: auth.sessionId ?? null };
    },

    async getProfile(clerkUserId) {
      const u = await clerk.users.getUser(clerkUserId);
      const email =
        u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
        u.emailAddresses[0]?.emailAddress;
      if (!email) throw new Error('Usuário do Clerk sem e-mail');

      // `oauth_google` → 'google'; qualquer outro caminho é login por e-mail.
      const external = u.externalAccounts[0];
      const provider = external?.provider?.replace(/^oauth_/, '') ?? 'email';
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || null;

      return {
        email,
        name,
        avatarUrl: u.imageUrl ?? null,
        provider: provider === 'google' ? 'google' : provider || 'email',
        providerId: external?.externalId ?? null,
      };
    },

    async revokeSession(sessionId) {
      await clerk.sessions.revokeSession(sessionId);
    },
  };
}

/**
 * Resolve a linha local de `users` a partir da sessão do Clerk, criando-a na
 * primeira visita.
 *
 * O Clerk é dono da identidade, mas as chaves estrangeiras de projects,
 * renders e usage_quota apontam para o nosso `users.id`. A sincronização é
 * preguiçosa em vez de por webhook: uma linha só nasce quando o usuário de
 * fato usa a API, e não há janela em que uma requisição autenticada chegue
 * antes de o webhook ter sido processado.
 */
export async function resolveUser(
  db: Db,
  clerk: ClerkPort,
  request: Request,
  now: number,
): Promise<{ user: UserRow; identity: ClerkIdentity } | null> {
  const identity = await clerk.authenticate(request);
  if (!identity) return null;

  const existing = await db.findUserByClerkId(identity.clerkUserId);
  if (existing) return { user: existing, identity };

  const profile = await clerk.getProfile(identity.clerkUserId);
  const user: UserRow = {
    id: crypto.randomUUID(),
    clerk_user_id: identity.clerkUserId,
    email: profile.email,
    name: profile.name,
    avatar_url: profile.avatarUrl,
    provider: profile.provider,
    provider_id: profile.providerId,
    plan: 'free',
    created_at: now,
    last_login_at: now,
  };

  try {
    await db.insertUser(user);
  } catch {
    // Corrida entre duas requisições do mesmo usuário novo: uma perde no
    // UNIQUE. A linha da vencedora é a boa.
    const raced = await db.findUserByClerkId(identity.clerkUserId);
    if (!raced) throw new Error('Falha ao criar usuário');
    return { user: raced, identity };
  }
  return { user, identity };
}
