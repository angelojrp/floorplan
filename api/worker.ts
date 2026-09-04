import { handle, depsFromEnv, type Deps } from './app';
import type { Env } from './env';

export type { Env } from './env';

/**
 * Entrada do Worker. Continua sendo um handler fino: roteamento, dependências
 * e tratamento de erro ficam em `app.ts`, e a engine segue em `src/`.
 *
 * `GET /` e `POST /render` permanecem públicos e sem sessão — nada que hoje
 * funciona sem conta passou a exigir uma.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Em teste as dependências vêm injetadas; em produção saem do env.
    const deps: Deps = depsFromEnv(env);
    try {
      return await handle(request, env, deps);
    } catch (e) {
      console.error('erro não tratado', e);
      return new Response(JSON.stringify({ error: 'Erro interno' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  },
};
