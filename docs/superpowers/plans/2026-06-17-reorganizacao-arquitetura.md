# Reorganização Arquitetural do Floorplan — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar a triplicação da engine fazendo `src/` (TS) ser a única fonte da verdade, consumida por web (Vite) e worker (Wrangler), e quebrar os HTMLs monolíticos em marcação + CSS + módulos JS.

**Architecture:** Vite multi-page para dois apps web (`editor`, `playground`) que importam a engine de `src/`. Worker reescrito como handler fino importando `render`. Pacote npm segue via `tsc`. Cloudflare Pages roda `npm run build` → `dist/`.

**Tech Stack:** TypeScript (engine), Vite (bundler web), Vitest (testes), Wrangler (Cloudflare Pages + Worker), JS ESM (UI).

---

## Fase 0 — Tooling

### Task 0.1: Instalar Vite e Vitest

**Files:**
- Modify: `package.json`

- [ ] **Step 1:** Instalar devDependencies.

Run: `npm install -D vite vitest`
Expected: instala sem erro; `vite` e `vitest` aparecem em `package.json` devDependencies.

- [ ] **Step 2:** Commit.

```bash
git add package.json package-lock.json
git commit -m "chore: adiciona vite e vitest"
```

### Task 0.2: Configurar Vite multi-page

**Files:**
- Create: `vite.config.js`

- [ ] **Step 1:** Criar `vite.config.js`.

```js
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'web/editor/index.html'),
        playground: resolve(__dirname, 'web/playground/index.html'),
      },
    },
  },
});
```

- [ ] **Step 2:** Commit.

```bash
git add vite.config.js
git commit -m "chore: configura vite multi-page (editor + playground)"
```

### Task 0.3: Scripts no package.json

**Files:**
- Modify: `package.json` (bloco `scripts`)

- [ ] **Step 1:** Substituir o bloco `scripts` por:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:lib": "tsc",
    "start": "node dist/cli.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "deploy:worker": "wrangler deploy api/worker.ts --name floorplan-api",
    "prepublishOnly": "npm run build:lib",
    "prepare": "npm run build:lib"
  },
```

Nota: `prepare`/`prepublishOnly` passam a usar `build:lib` (tsc) para o pacote npm, separando do build web (`build` → vite).

- [ ] **Step 2:** Verificar typecheck ainda passa.

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3:** Commit.

```bash
git add package.json
git commit -m "chore: scripts vite/vitest/tsc separados (web vs lib npm)"
```

### Task 0.4: Ajustar tsconfig para uso isolado de módulos

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1:** Adicionar `"moduleResolution": "node"` e `"isolatedModules": true` em `compilerOptions` (garante compatibilidade com o esbuild do Vite/Wrangler que transpila arquivo-a-arquivo). Manter `module: commonjs` para o output npm.

- [ ] **Step 2:** Verificar typecheck.

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3:** Commit.

```bash
git add tsconfig.json
git commit -m "chore: tsconfig isolatedModules p/ esbuild"
```

---

## Fase 1 — Testes da engine (rede de segurança ANTES de mexer)

### Task 1.1: Teste de snapshot da engine sobre os exemplos

**Files:**
- Create: `tests/engine.test.js`

- [ ] **Step 1: Escrever o teste.**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '../src/index';

const examplesDir = join(__dirname, '..', 'examples');
const files = readdirSync(examplesDir).filter((f) => f.endsWith('.yaml'));

describe('engine.render sobre examples/', () => {
  for (const file of files) {
    it(`renderiza ${file} para SVG válido`, () => {
      const yaml = readFileSync(join(examplesDir, file), 'utf8');
      const svg = render(yaml);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('</svg>');
      expect(svg.length).toBeGreaterThan(100);
    });
    it(`snapshot estável de ${file}`, () => {
      const yaml = readFileSync(join(examplesDir, file), 'utf8');
      expect(render(yaml)).toMatchSnapshot();
    });
  }
});
```

- [ ] **Step 2: Rodar.**

Run: `npm test`
Expected: PASS (cria snapshots na primeira execução). Estes snapshots são a referência de "comportamento atual" da engine.

- [ ] **Step 3: Commit.**

```bash
git add tests/engine.test.js tests/__snapshots__
git commit -m "test: snapshots da engine sobre os exemplos (rede de seguranca)"
```

---

## Fase 2 — Worker importa a engine

### Task 2.1: Reescrever worker como handler fino em TS

**Files:**
- Create: `api/worker.ts`
- Delete (no fim, após validar): `api/worker.js`

- [ ] **Step 1:** Criar `api/worker.ts`. O `HTML_DOCS` (string da doc `GET /`) deve ser copiado **na íntegra** do `api/worker.js` atual (linhas 1115–1278). O restante:

```ts
import { render } from '../src/index';

const HTML_DOCS = `...`; // copiar literalmente de api/worker.js (linhas 1115-1278)

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function svgResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml', ...CORS_HEADERS },
  });
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (method === 'GET' && (path === '/' || path === '')) {
      return htmlResponse(HTML_DOCS);
    }

    if (method === 'POST' && path === '/render') {
      const contentType = request.headers.get('Content-Type') || '';
      if (
        !contentType.includes('text/plain') &&
        !contentType.includes('yaml') &&
        !contentType.includes('application/octet-stream')
      ) {
        return json(
          { error: 'Content-Type deve ser text/plain ou application/x-yaml' },
          400,
        );
      }

      let yamlText: string;
      try {
        yamlText = await request.text();
      } catch {
        return json({ error: 'Corpo da requisição inválido' }, 400);
      }
      if (!yamlText || yamlText.trim().length === 0) {
        return json({ error: 'Corpo da requisição vazio' }, 400);
      }

      try {
        const svg = render(yamlText);
        return svgResponse(svg);
      } catch (e) {
        return json(
          { error: 'Erro ao renderizar', details: [(e as Error).message] },
          400,
        );
      }
    }

    return json({ error: 'Rota não encontrada. Use GET / ou POST /render' }, 404);
  },
};
```

- [ ] **Step 2:** Verificar typecheck (worker.ts está em `api/`, fora do `include` do tsconfig da lib; criar verificação dedicada — rodar `npx tsc --noEmit api/worker.ts --moduleResolution node --target ES2022 --strict --skipLibCheck` aceitando erros de tipos de ambiente Worker se houver, mas sem erros de import da engine).

Run: `npx tsc --noEmit --skipLibCheck --moduleResolution node --target ES2022 api/worker.ts`
Expected: sem erros de resolução de `../src/index`.

- [ ] **Step 3:** Migrar o teste do worker para Vitest. Substituir `tests/test-worker-api.js` por `tests/worker.test.js`:

```js
import { describe, it, expect } from 'vitest';
import worker from '../api/worker.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const examplesDir = join(__dirname, '..', 'examples');

function post(body, contentType = 'text/plain') {
  return worker.fetch(
    new Request('https://x/render', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    }),
  );
}

describe('worker', () => {
  it('GET / retorna doc HTML', async () => {
    const res = await worker.fetch(new Request('https://x/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('POST /render com YAML válido retorna SVG', async () => {
    for (const f of readdirSync(examplesDir).filter((f) => f.endsWith('.yaml'))) {
      const res = await post(readFileSync(join(examplesDir, f), 'utf8'));
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
      expect(await res.text()).toMatch(/^<svg/);
    }
  });

  it('POST /render vazio retorna 400', async () => {
    const res = await post('');
    expect(res.status).toBe(400);
  });

  it('rota inexistente retorna 404', async () => {
    const res = await worker.fetch(new Request('https://x/nope'));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4:** Rodar testes.

Run: `npm test`
Expected: PASS (engine + worker).

- [ ] **Step 5:** Remover o monólito e o teste antigo.

```bash
git rm api/worker.js tests/test-worker-api.js
```

- [ ] **Step 6:** Atualizar `api/README.md`: trocar `api/worker.js` por `api/worker.ts` no comando de deploy e remover a seção "Estrutura do Worker" que descreve o port inline (substituir por "importa a engine de `src/`").

- [ ] **Step 7:** Commit.

```bash
git add api/worker.ts api/README.md tests/worker.test.js
git commit -m "refactor(worker): handler fino importando engine de src/ (remove re-port de 1408 linhas)"
```

---

## Fase 3 — Estrutura de diretórios web + public

### Task 3.1: Criar esqueleto de diretórios e mover assets estáticos

**Files:**
- Create: `web/editor/`, `web/playground/`, `web/shared/`, `web/public/`
- Move: `web/_headers`, `web/_redirects`, `web/robots.txt`, `web/templates/` → `web/public/`
- Move: `web/symbols.js` → `web/shared/symbols.js` (e convertê-lo em módulo ESM: adicionar `export { SYMBOLS, SYMBOL_CATEGORIES };` ao final)

- [ ] **Step 1:** Mover assets.

```bash
mkdir -p web/public web/editor/js web/playground web/shared
git mv web/_headers web/public/_headers
git mv web/_redirects web/public/_redirects
git mv web/robots.txt web/public/robots.txt
git mv web/templates web/public/templates
git mv web/symbols.js web/shared/symbols.js
```

- [ ] **Step 2:** Adicionar export ESM ao final de `web/shared/symbols.js`:

```js
export { SYMBOLS, SYMBOL_CATEGORIES };
```

- [ ] **Step 3:** Atualizar `web/public/_redirects` para o roteamento dos dois apps:

```
/            /editor/index.html   200
/playground  /playground/index.html  200
/*           /editor/index.html   200
```

- [ ] **Step 4:** Commit.

```bash
git add -A
git commit -m "chore(web): estrutura de diretorios (editor, playground, shared, public)"
```

---

## Fase 4 — Playground (app menor, valida o padrão de import)

### Task 4.1: Construir o playground a partir da engine

**Files:**
- Create: `web/playground/index.html`, `web/playground/playground.css`, `web/playground/main.js`
- Reference: `web/playground.html` (monólito atual — extrair marcação/estilo)
- Delete (após validar): `web/playground.html`, `playground.html` (raiz)

- [ ] **Step 1:** Ler `web/playground.html` e identificar as 3 partes: `<style>` (→ `playground.css`), marcação do `<body>` (→ `index.html`), lógica (→ `main.js`). A lógica de parse/render inline deve ser **descartada** e substituída por `import { render } from '../../src/index'`.

- [ ] **Step 2:** Criar `web/playground/index.html` com a marcação extraída, referenciando `<link rel="stylesheet" href="./playground.css">` e `<script type="module" src="./main.js"></script>`. Remover qualquer `<script>` de CDN (js-yaml) — a engine cobre parse.

- [ ] **Step 3:** Criar `web/playground/playground.css` com o conteúdo do `<style>` extraído.

- [ ] **Step 4:** Criar `web/playground/main.js`: liga o textarea YAML ao preview, chamando `render(yamlText)` em cada mudança (debounced) e injetando o SVG no container. Tratar erro com try/catch exibindo a mensagem.

- [ ] **Step 5:** Validar no dev server.

Run: `npm run dev` (abrir `/playground/`), verificar preview ao vivo. Ou validar o build: `npm run build` e conferir `dist/playground/index.html` gerado.
Expected: build sem erro; playground renderiza um exemplo.

- [ ] **Step 6:** Remover monólitos do playground.

```bash
git rm web/playground.html playground.html
```

- [ ] **Step 7:** Commit.

```bash
git add web/playground
git commit -m "refactor(web): playground importa engine (remove ports inline e duplicata da raiz)"
```

---

## Fase 5 — Editor (maior; migração incremental com preservação de comportamento)

> Estratégia: extrair em ordem CSS → marcação → módulos JS, trocando o motor inline (`renderFloorplanSVG`/`renderFloorplanDXF`) por imports da engine **por último**. Verificar a cada passo que o app ainda renderiza. O `web/editor.html` atual (3.444 linhas) é a referência.

### Task 5.1: Extrair CSS e marcação do editor

**Files:**
- Create: `web/editor/index.html`, `web/editor/editor.css`
- Reference: `web/editor.html` linhas 7–647 (`<style>`), corpo HTML

- [ ] **Step 1:** Copiar o conteúdo de `<style>...</style>` (linhas 8–646) para `web/editor/editor.css`.
- [ ] **Step 2:** Criar `web/editor/index.html` com toda a marcação do `<body>` do editor, com `<link rel="stylesheet" href="./editor.css">` no `<head>` e, antes do `</body>`, `<script type="module" src="./js/main.js"></script>`. Remover o `<script src="symbols.js">` (virará import ESM).
- [ ] **Step 3:** Commit.

```bash
git add web/editor/index.html web/editor/editor.css
git commit -m "refactor(editor): extrai CSS e marcacao do monolito"
```

### Task 5.2: Extrair a lógica JS em módulos ESM

**Files:**
- Create: `web/editor/js/main.js` e módulos por responsabilidade
- Reference: `web/editor.html` linhas 1050–3442 (bloco `<script>`)

> O bloco `<script>` (linhas 1050–3442) será dividido. Mapear as funções existentes (`render`, `renderYAMLProps`, `renderProperties`, `renderLayers`, `renderStairPreview`, `renderPreview`, `renderRoomPreview`, `parseFloorplanInput`, `renderFloorplanSVG`, `renderFloorplanDXF`, etc.) para módulos:
> - `state.js` — estado do documento e seletores
> - `yaml-sync.js` — `parseFloorplanInput` e sincronização textarea↔modelo (usar `parseFloorPlan` da engine onde possível)
> - `preview.js` — `renderPreview`, `renderRoomPreview`, `renderStairPreview`, drag-and-drop
> - `properties.js` — `renderProperties`, `renderYAMLProps`
> - `layers.js` — `renderLayers`
> - `export.js` — download SVG/DXF/PDF
> - `main.js` — bootstrap, wiring de eventos, `import { SYMBOLS, SYMBOL_CATEGORIES } from '../../shared/symbols.js'`

- [ ] **Step 1:** Criar os módulos extraindo as funções correspondentes do bloco `<script>`, ajustando para `export`/`import` entre eles. Manter a lógica idêntica nesta etapa (sem trocar o motor ainda) para isolar a refatoração estrutural da troca de engine.
- [ ] **Step 2:** `main.js` importa e liga tudo, reproduzindo a ordem de inicialização do script original.
- [ ] **Step 3:** Validar build.

Run: `npm run build`
Expected: build sem erro; `dist/editor/index.html` gerado.

- [ ] **Step 4:** Validar runtime no dev server.

Run: `npm run dev` → abrir `/editor/`, carregar um template, confirmar preview, propriedades, camadas, drag-and-drop e exports funcionando como antes.

- [ ] **Step 5:** Commit.

```bash
git add web/editor/js
git commit -m "refactor(editor): divide script monolitico em modulos ESM"
```

### Task 5.3: Trocar o motor inline pela engine de src/

**Files:**
- Modify: `web/editor/js/preview.js`, `web/editor/js/export.js`, `web/editor/js/yaml-sync.js`

- [ ] **Step 1:** Substituir `renderFloorplanSVG(input)` por `import { render } from '../../../src/index'` usando `render(yamlText)` — ou, se o editor precisar do SVG a partir do **modelo** já parseado, usar `resolveLayout` + `renderSvg` da engine. Comparar o SVG gerado com a saída anterior em um exemplo conhecido.
- [ ] **Step 2:** Substituir `renderFloorplanDXF(input)` por `import { exportDXF } from '../../../src/index'`. Para PDF, usar `renderPDFHtml`.
- [ ] **Step 3:** Remover do editor as funções `renderFloorplanSVG`, `renderFloorplanDXF`, `parseFloorplanInput` (e o port inline) que agora vêm da engine.
- [ ] **Step 4:** Validar que o preview e os exports continuam idênticos.

Run: `npm run dev` → comparar SVG renderizado de `apartamento` contra o snapshot da engine; conferir export DXF/PDF.
Expected: saída equivalente; nenhuma regressão visível.

- [ ] **Step 5:** Remover o monólito antigo.

```bash
git rm web/editor.html web/index.html
```

Nota: confirmar antes que toda feature útil de `web/index.html` (o app simples antes deployado) está coberta pelo editor; se houver algo único, migrar primeiro.

- [ ] **Step 6:** Commit.

```bash
git add -A
git commit -m "refactor(editor): usa engine de src/ (remove motor inline; remove editor.html/index.html)"
```

---

## Fase 6 — Deploy e documentação

### Task 6.1: Atualizar wrangler.toml para build do Vite

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1:** Alterar `pages_build_output_dir = "web"` para `pages_build_output_dir = "dist"`.
- [ ] **Step 2:** Validar build.

Run: `npm run build`
Expected: `dist/` contém `editor/index.html`, `playground/index.html`, `_headers`, `_redirects`, `templates/`.

- [ ] **Step 3:** Commit.

```bash
git add wrangler.toml
git commit -m "chore(deploy): Pages serve dist/ (build do vite)"
```

### Task 6.2: Atualizar README e AGENTS

**Files:**
- Modify: `README.md`, `AGENTS.md`

- [ ] **Step 1:** Atualizar a seção "Estrutura" do `README.md` para refletir a nova árvore (engine única em `src/`, apps em `web/editor` e `web/playground`, build com Vite → `dist/`). Atualizar a seção "Web App" e "Desenvolvimento" (`npm run dev`, `npm run build`). Remover a afirmação de "engine portada para JS inline".
- [ ] **Step 2:** Atualizar `AGENTS.md` (estrutura do projeto) se necessário.
- [ ] **Step 3:** Commit.

```bash
git add README.md AGENTS.md
git commit -m "docs: atualiza estrutura e instrucoes de build"
```

---

## Fase 7 — Verificação final

### Task 7.1: Suite verde

- [ ] **Step 1:** `npm run typecheck` → sem erros.
- [ ] **Step 2:** `npm test` → todos os testes (engine + worker) passam.
- [ ] **Step 3:** `npm run build` → `dist/` gerado sem erro.
- [ ] **Step 4:** `npm run build:lib` → `dist/` da lib npm (cli/index) gerado sem erro. (Nota: `build` web e `build:lib` usam o mesmo `dist/`; rodar separadamente para validar, o deploy real usa `build`.)
- [ ] **Step 5:** Verificar ausência de duplicação: nenhuma reimplementação de parse/layout/render fora de `src/`.

Run: `grep -rl "function resolveLayout\|function renderSvg" web/ api/`
Expected: nenhum resultado.

- [ ] **Step 6:** Confirmar que nenhum HTML tem `<style>` ou `<script>` inline com lógica de engine.

---

## Critérios de sucesso (checklist final)

- [ ] Nenhuma lógica de parse/layout/render fora de `src/`.
- [ ] Nenhum HTML com CSS+JS+engine inline.
- [ ] `npm run build` produz `dist/` deployável no Cloudflare Pages.
- [ ] Worker importa a engine (sem re-port).
- [ ] `npm run typecheck` e `npm test` passam.
- [ ] README/AGENTS refletem a nova estrutura.
</content>
