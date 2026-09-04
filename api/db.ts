import type { Env } from './env';

// ── Linhas do D1, espelhando migrations/0001_init.sql ──

export interface UserRow {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  provider: string;
  provider_id: string | null;
  plan: string;
  created_at: number;
  last_login_at: number | null;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  yaml: string;
  thumbnail_key: string | null;
  area_m2: number | null;
  room_count: number | null;
  is_public: number;
  share_slug: string | null;
  created_at: number;
  updated_at: number;
}

/** Projeto sem o YAML — o que a listagem devolve, para não trafegar plantas inteiras. */
export type ProjectSummary = Omit<ProjectRow, 'yaml' | 'user_id'>;

const SUMMARY_COLS =
  'id, title, thumbnail_key, area_m2, room_count, is_public, share_slug, created_at, updated_at';

export class Db {
  constructor(private readonly d1: D1Database) {}

  static from(env: Env): Db {
    return new Db(env.DB);
  }

  // ── users ──

  findUserByClerkId(clerkUserId: string): Promise<UserRow | null> {
    return this.d1
      .prepare('SELECT * FROM users WHERE clerk_user_id = ?')
      .bind(clerkUserId)
      .first<UserRow>();
  }

  async insertUser(user: UserRow): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO users (id, clerk_user_id, email, name, avatar_url, provider, provider_id, plan, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id, user.clerk_user_id, user.email, user.name, user.avatar_url,
        user.provider, user.provider_id, user.plan, user.created_at, user.last_login_at,
      )
      .run();
  }

  async touchLastLogin(userId: string, at: number): Promise<void> {
    await this.d1
      .prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
      .bind(at, userId)
      .run();
  }

  // ── projects ──

  async listProjects(userId: string): Promise<ProjectSummary[]> {
    const { results } = await this.d1
      .prepare(
        `SELECT ${SUMMARY_COLS} FROM projects WHERE user_id = ? ORDER BY updated_at DESC`,
      )
      .bind(userId)
      .all<ProjectSummary>();
    return results;
  }

  /**
   * Busca sempre filtrando por dono. Um projeto de outro usuário sai daqui
   * como `null`, e não como uma linha que o chamador precise lembrar de
   * checar — o isolamento fica no SQL, não na disciplina de quem chama.
   */
  getOwnedProject(id: string, userId: string): Promise<ProjectRow | null> {
    return this.d1
      .prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .first<ProjectRow>();
  }

  getPublicProjectBySlug(slug: string): Promise<ProjectRow | null> {
    return this.d1
      .prepare('SELECT * FROM projects WHERE share_slug = ? AND is_public = 1')
      .bind(slug)
      .first<ProjectRow>();
  }

  async insertProject(p: ProjectRow): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO projects (id, user_id, title, yaml, thumbnail_key, area_m2, room_count, is_public, share_slug, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        p.id, p.user_id, p.title, p.yaml, p.thumbnail_key, p.area_m2,
        p.room_count, p.is_public, p.share_slug, p.created_at, p.updated_at,
      )
      .run();
  }

  /** Atualiza conteúdo e colunas derivadas. Retorna false se não for do dono. */
  async updateProject(
    id: string,
    userId: string,
    patch: { title: string; yaml: string; area_m2: number; room_count: number; updated_at: number },
  ): Promise<boolean> {
    const res = await this.d1
      .prepare(
        `UPDATE projects SET title = ?, yaml = ?, area_m2 = ?, room_count = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(patch.title, patch.yaml, patch.area_m2, patch.room_count, patch.updated_at, id, userId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async setShare(
    id: string,
    userId: string,
    share: { is_public: number; share_slug: string | null; updated_at: number },
  ): Promise<boolean> {
    const res = await this.d1
      .prepare(
        'UPDATE projects SET is_public = ?, share_slug = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      )
      .bind(share.is_public, share.share_slug, share.updated_at, id, userId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async deleteProject(id: string, userId: string): Promise<boolean> {
    const res = await this.d1
      .prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async countProjects(userId: string): Promise<number> {
    const row = await this.d1
      .prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?')
      .bind(userId)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  // ── quota ──

  /** Incrementa e devolve o total do período. UPSERT atômico, sem read-modify-write. */
  async bumpUserQuota(userId: string, period: string, by = 1): Promise<number> {
    const row = await this.d1
      .prepare(
        `INSERT INTO usage_quota (user_id, period, renders_used) VALUES (?, ?, ?)
         ON CONFLICT (user_id, period) DO UPDATE SET renders_used = renders_used + excluded.renders_used
         RETURNING renders_used`,
      )
      .bind(userId, period, by)
      .first<{ renders_used: number }>();
    return row?.renders_used ?? 0;
  }

  async bumpAnonQuota(ipHash: string, period: string, by = 1): Promise<number> {
    const row = await this.d1
      .prepare(
        `INSERT INTO anon_quota (ip_hash, period, used) VALUES (?, ?, ?)
         ON CONFLICT (ip_hash, period) DO UPDATE SET used = used + excluded.used
         RETURNING used`,
      )
      .bind(ipHash, period, by)
      .first<{ used: number }>();
    return row?.used ?? 0;
  }

  async getUserQuota(userId: string, period: string): Promise<number> {
    const row = await this.d1
      .prepare('SELECT renders_used FROM usage_quota WHERE user_id = ? AND period = ?')
      .bind(userId, period)
      .first<{ renders_used: number }>();
    return row?.renders_used ?? 0;
  }
}
