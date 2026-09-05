// Cliente de autenticação — Clerk, carregado sob demanda.
//
// PRINCÍPIO: o editor, o playground e as exportações funcionam sem cadastro.
// Enquanto `VITE_CLERK_PUBLISHABLE_KEY` não estiver definida, este módulo fica
// inteiramente inerte: `isEnabled()` é false, nada é carregado da rede, nenhum
// elemento novo aparece e o usuário anônimo segue com o localStorage de sempre.

const PUBLISHABLE_KEY = import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY || '';
/** Base da API. Vazio = mesma origem (Worker roteado em /api). */
export const API_BASE = import.meta.env?.VITE_API_BASE || '';

export function isEnabled() {
  return Boolean(PUBLISHABLE_KEY);
}

let clerkPromise = null;

/** Carrega o @clerk/clerk-js do CDN uma única vez, e só se houver chave. */
function loadClerk() {
  if (!isEnabled()) return Promise.resolve(null);
  if (clerkPromise) return clerkPromise;

  clerkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-clerk-publishable-key', PUBLISHABLE_KEY);
    // Bundle oficial do browser; lê a chave do atributo data- acima.
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
    script.onerror = () => reject(new Error('Falha ao carregar o Clerk'));
    script.onload = async () => {
      try {
        await window.Clerk.load();
        resolve(window.Clerk);
      } catch (e) {
        reject(e);
      }
    };
    document.head.appendChild(script);
  }).catch((e) => {
    // Uma falha de rede no provedor de login não pode derrubar o editor:
    // volta ao estado anônimo, que é plenamente funcional.
    console.warn('[auth] indisponível, seguindo anônimo:', e.message);
    clerkPromise = null;
    return null;
  });

  return clerkPromise;
}

/** Usuário logado do Clerk, ou null (inclusive quando auth está desligada). */
export async function getClerkUser() {
  const clerk = await loadClerk();
  return clerk?.user ?? null;
}

export async function signIn() {
  const clerk = await loadClerk();
  clerk?.openSignIn();
}

export async function signOut() {
  const clerk = await loadClerk();
  if (!clerk) return;
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Sair do lado do cliente é o que importa.
  }
  await clerk.signOut();
}

/**
 * fetch para a API com o token da sessão.
 *
 * Manda `Authorization: Bearer` porque a API pode estar em outra origem
 * (workers.dev), onde o cookie de sessão do Clerk não viajaria.
 */
export async function apiFetch(path, options = {}) {
  const clerk = await loadClerk();
  const headers = { ...(options.headers || {}) };
  const token = await clerk?.session?.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(API_BASE + path, { ...options, headers, credentials: 'include' });
}

async function apiJson(path, options) {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.details = body.details;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// ── API de projetos ──
export const projects = {
  list: () => apiJson('/api/projects').then((r) => r.projects),
  get: (id) => apiJson(`/api/projects/${id}`),
  create: (title, yaml) => apiJson('/api/projects', { method: 'POST', body: JSON.stringify({ title, yaml }) }),
  update: (id, title, yaml) =>
    apiJson(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ title, yaml }) }),
  remove: (id) => apiJson(`/api/projects/${id}`, { method: 'DELETE' }),
  share: (id, isPublic) =>
    apiJson(`/api/projects/${id}/share`, { method: 'POST', body: JSON.stringify({ is_public: isPublic }) }),
};

export const me = () => apiJson('/api/me');

/**
 * Observa o estado de login e chama `onChange(user | null)`.
 * Com auth desligada, chama uma vez com null e não faz mais nada.
 */
export async function onAuthChange(onChange) {
  if (!isEnabled()) {
    onChange(null);
    return;
  }
  const clerk = await loadClerk();
  if (!clerk) {
    onChange(null);
    return;
  }
  clerk.addListener(({ user }) => onChange(user ?? null));
  onChange(clerk.user ?? null);
}
