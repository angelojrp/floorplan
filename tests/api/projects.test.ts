import { describe, it, expect } from 'vitest';
import { client, fakeClerk, profile, YAML_OK, YAML_TWO_ROOMS } from './helpers';

const ALICE = 'user_alice';
const BOB = 'user_bob';

const twoUsers = () =>
  fakeClerk({
    [ALICE]: profile('alice@example.com'),
    [BOB]: profile('bob@example.com', { provider: 'email', providerId: null }),
  });

async function newProject(c: ReturnType<typeof client>, token: string, title = 'Casa', yaml = YAML_OK) {
  const res = await c.json('POST', '/api/projects', { token, body: { title, yaml } });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

describe('autenticação', () => {
  it('rotas de projeto exigem sessão', async () => {
    const c = client(twoUsers());
    for (const [m, p] of [['GET', '/api/projects'], ['POST', '/api/projects'], ['GET', '/api/me']] as const) {
      expect((await c.call(m, p)).status, `${m} ${p}`).toBe(401);
    }
  });

  it('cria a linha local de users na primeira requisição e reaproveita depois', async () => {
    const clerk = twoUsers();
    const c = client(clerk);

    const first = await c.json('GET', '/api/me', { token: ALICE });
    expect(first.status).toBe(200);
    expect(first.body.email).toBe('alice@example.com');
    expect(first.body.plan).toBe('free');
    expect(clerk.calls).toEqual([`getProfile:${ALICE}`]);

    const second = await c.json('GET', '/api/me', { token: ALICE });
    expect(second.body.id).toBe(first.body.id);
    // Não busca o perfil de novo: a linha local já existe.
    expect(clerk.calls).toEqual([`getProfile:${ALICE}`]);
  });

  it('logout revoga a sessão no Clerk', async () => {
    const clerk = twoUsers();
    const c = client(clerk);
    expect((await c.call('POST', '/api/auth/logout', { token: ALICE })).status).toBe(204);
    expect(clerk.calls).toContain(`revoke:sess_${ALICE}`);
  });
});

describe('CRUD de projetos', () => {
  it('cria, lê, lista, atualiza e apaga', async () => {
    const c = client(twoUsers());

    const created = await c.json('POST', '/api/projects', {
      token: ALICE, body: { title: 'Casa', yaml: YAML_TWO_ROOMS },
    });
    expect(created.status).toBe(201);
    // Colunas derivadas saem da engine: 500x400 + 300x200 = 26 m².
    expect(created.body.area_m2).toBe(26);
    expect(created.body.room_count).toBe(2);

    const id = created.body.id;
    const got = await c.json('GET', `/api/projects/${id}`, { token: ALICE });
    expect(got.status).toBe(200);
    expect(got.body.yaml).toBe(YAML_TWO_ROOMS);
    expect(got.body.user_id).toBeUndefined(); // não vaza o dono

    const list = await c.json('GET', '/api/projects', { token: ALICE });
    expect(list.body.projects).toHaveLength(1);
    expect(list.body.projects[0].id).toBe(id);
    expect(list.body.projects[0].yaml).toBeUndefined(); // listagem não traz a planta

    const updated = await c.json('PUT', `/api/projects/${id}`, {
      token: ALICE, body: { title: 'Casa v2', yaml: YAML_OK },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.area_m2).toBe(20); // recalculado, não o valor antigo
    expect(updated.body.room_count).toBe(1);
    expect((await c.json('GET', `/api/projects/${id}`, { token: ALICE })).body.title).toBe('Casa v2');

    expect((await c.call('DELETE', `/api/projects/${id}`, { token: ALICE })).status).toBe(204);
    expect((await c.call('GET', `/api/projects/${id}`, { token: ALICE })).status).toBe(404);
  });

  it('recusa YAML que a engine não renderizaria', async () => {
    const c = client(twoUsers());
    const res = await c.json('POST', '/api/projects', {
      token: ALICE, body: { title: 'Quebrada', yaml: 'version: 1\nrooms: []\n' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YAML/i);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('recusa payload sem título', async () => {
    const c = client(twoUsers());
    const res = await c.json('POST', '/api/projects', {
      token: ALICE, body: { title: '   ', yaml: YAML_OK },
    });
    expect(res.status).toBe(400);
  });
});

describe('isolamento entre usuários', () => {
  it('B não lê, edita, compartilha nem apaga projeto de A', async () => {
    const c = client(twoUsers());
    const { id } = await newProject(c, ALICE);

    // 404 e não 403: um id de outro dono não deve nem confirmar que existe.
    expect((await c.call('GET', `/api/projects/${id}`, { token: BOB })).status).toBe(404);
    expect((await c.call('PUT', `/api/projects/${id}`, {
      token: BOB, body: { title: 'roubado', yaml: YAML_OK },
    })).status).toBe(404);
    expect((await c.call('POST', `/api/projects/${id}/share`, {
      token: BOB, body: { is_public: true },
    })).status).toBe(404);
    expect((await c.call('DELETE', `/api/projects/${id}`, { token: BOB })).status).toBe(404);

    // E o projeto de A segue intacto.
    const still = await c.json('GET', `/api/projects/${id}`, { token: ALICE });
    expect(still.status).toBe(200);
    expect(still.body.title).toBe('Casa');
  });

  it('a listagem de B não inclui projetos de A', async () => {
    const c = client(twoUsers());
    await newProject(c, ALICE, 'de Alice');
    await newProject(c, BOB, 'de Bob');

    const bob = await c.json('GET', '/api/projects', { token: BOB });
    expect(bob.body.projects.map((p: any) => p.title)).toEqual(['de Bob']);
  });
});

describe('compartilhamento público', () => {
  it('gera slug, serve sem sessão e revoga', async () => {
    const c = client(twoUsers());
    const { id } = await newProject(c, ALICE, 'Pública', YAML_TWO_ROOMS);

    // Antes de publicar não há link.
    expect((await c.call('GET', '/api/p/naoexiste')).status).toBe(404);

    const shared = await c.json('POST', `/api/projects/${id}/share`, {
      token: ALICE, body: { is_public: true },
    });
    expect(shared.status).toBe(200);
    expect(shared.body.share_slug).toMatch(/^[0-9a-f]{16}$/);

    // Leitura pública: sem token nenhum.
    const pub = await c.json('GET', `/api/p/${shared.body.share_slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.yaml).toBe(YAML_TWO_ROOMS);
    expect(pub.body.area_m2).toBe(26);

    // Despublicar derruba o link…
    const unshared = await c.json('POST', `/api/projects/${id}/share`, {
      token: ALICE, body: { is_public: false },
    });
    expect(unshared.body.share_slug).toBeNull();
    expect((await c.call('GET', `/api/p/${shared.body.share_slug}`)).status).toBe(404);

    // …e republicar reaproveita o mesmo slug, para não quebrar links enviados.
    const again = await c.json('POST', `/api/projects/${id}/share`, {
      token: ALICE, body: { is_public: true },
    });
    expect(again.body.share_slug).toBe(shared.body.share_slug);
  });

  it('o link público não expõe o dono nem outros campos internos', async () => {
    const c = client(twoUsers());
    const { id } = await newProject(c, ALICE);
    const { body } = await c.json('POST', `/api/projects/${id}/share`, {
      token: ALICE, body: { is_public: true },
    });
    const pub = await c.json('GET', `/api/p/${body.share_slug}`);
    expect(Object.keys(pub.body).sort()).toEqual(
      ['area_m2', 'room_count', 'title', 'updated_at', 'yaml'],
    );
  });
});

describe('rotas públicas seguem sem conta', () => {
  it('POST /render funciona sem sessão', async () => {
    const c = client(twoUsers());
    const res = await c.call('POST', '/render', {});
    // Sem body válido dá 400 — o que importa é não ser 401.
    expect(res.status).not.toBe(401);
  });

  it('GET / serve a documentação sem sessão', async () => {
    const c = client(twoUsers());
    const res = await c.call('GET', '/');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });
});
