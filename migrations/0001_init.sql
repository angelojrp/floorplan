-- Esquema inicial: usuários, projetos e a preparação para render/quota.
--
-- Decisão de projeto: o YAML do projeto fica como coluna de texto e NÃO é
-- normalizado em tabelas de cômodos/portas/janelas. A engine em src/ continua
-- sendo a única fonte da verdade sobre geometria; `area_m2` e `room_count` são
-- colunas derivadas, recalculadas pela engine a cada gravação.

-- ─────────────────────────────── users ───────────────────────────────
CREATE TABLE users (
  id            TEXT PRIMARY KEY,              -- uuid nosso, referenciado pelas FKs
  clerk_user_id TEXT UNIQUE NOT NULL,          -- id do usuário no Clerk (ex: 'user_2ab...')
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  provider      TEXT NOT NULL,                 -- 'google' | 'email'
  provider_id   TEXT,                          -- id no provedor social, quando houver
  plan          TEXT NOT NULL DEFAULT 'free',  -- free | pro
  created_at    INTEGER NOT NULL,              -- epoch ms
  last_login_at INTEGER
);

-- ────────────────────────────── projects ─────────────────────────────
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  yaml          TEXT NOT NULL,                 -- fonte da verdade, mesma da engine
  thumbnail_key TEXT,                          -- chave no R2
  area_m2       REAL,                          -- derivado, atualizado na gravação
  room_count    INTEGER,                       -- derivado, atualizado na gravação
  is_public     INTEGER NOT NULL DEFAULT 0,
  share_slug    TEXT UNIQUE,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Listagem "meus projetos", que é sempre por dono e mais recentes primeiro.
CREATE INDEX idx_projects_user_updated ON projects (user_id, updated_at DESC);
-- share_slug já ganha índice pelo UNIQUE acima; um índice extra seria redundante.

-- ─────────────────────────────── renders ─────────────────────────────
-- Preparação para a ferramenta de Render 3D. Nenhuma rota escreve aqui ainda.
CREATE TABLE renders (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,                  -- 'exterior' | 'interior'
  room_id      TEXT,
  prompt       TEXT,
  style        TEXT,
  status       TEXT NOT NULL,                  -- queued | processing | done | failed
  image_key    TEXT,                           -- R2
  depth_key    TEXT,                           -- control image, permite re-render
  cost_credits INTEGER NOT NULL DEFAULT 1,
  error        TEXT,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_renders_user_created ON renders (user_id, created_at DESC);
CREATE INDEX idx_renders_project ON renders (project_id);

-- ───────────────────────────── usage_quota ───────────────────────────
CREATE TABLE usage_quota (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period       TEXT NOT NULL,                  -- '2026-09'
  renders_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);

-- ────────────────────────────── anon_quota ───────────────────────────
-- `ip_hash` é HMAC-SHA256 do IP com um segredo do servidor, nunca o IP em
-- claro nem um hash simples: o espaço de IPv4 é pequeno o bastante para
-- reverter SHA-256 puro por força bruta (LGPD).
CREATE TABLE anon_quota (
  ip_hash TEXT NOT NULL,
  period  TEXT NOT NULL,
  used    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, period)
);
