# Reorganização Arquitetural do Floorplan — Design

**Data:** 2026-06-17
**Branch:** `chore/reorganizacao-arquitetura`
**Status:** Aprovado (execução autônoma autorizada)

## Problema

A lógica da engine (parse YAML → validação → layout → render SVG) está
**triplicada** no projeto:

| Arquivo | Linhas | Conteúdo |
|---|---|---|
| `src/*.ts` | ~1.600 | Engine canônica TS, modular ✅ |
| `api/worker.js` | 1.408 | Re-port completo em JS vanilla |
| `web/editor.html` | 3.444 | HTML + CSS + JS inline + re-port + DXF + painéis |
| `web/playground.html` | 1.961 | Mais um port inline |
| `web/index.html` | 1.245 | Mais um port inline |
| `playground.html` (raiz) | 691 | Variante duplicada |

Consequências: corrigir um bug de renderização exige editar a mesma lógica em
4+ arquivos; os HTMLs misturam CSS, marcação e lógica em arquivos gigantes,
dificultando manutenção e onboarding.

Causa raiz: a promessa de "zero build / HTML autossuficiente" levou a copiar a
engine inline em cada consumidor. O Cloudflare (Pages + Workers) já roda build
na nuvem, tornando essa restrição desnecessária.

## Princípio central

A engine TypeScript em `src/` é a **única fonte da verdade**. Web e worker
**importam** dela; ninguém mais reescreve parse/layout/render. Vite (web) e
Wrangler (worker, via esbuild) fazem o bundle.

A API pública em `src/index.ts` já expõe o necessário: `render`,
`parseFloorPlan`, `resolveLayout`, `renderSvg`, `exportDXF`, `renderPDFHtml` e
os tipos. Mudanças na engine são mínimas (apenas garantir exports usados pela UI).

## Decisões

- **Bundler:** Vite (multi-page nativo, bom DX, integra com Cloudflare Pages e Vitest).
- **Escopo:** tudo de uma vez, implementado em ordem segura (ver abaixo).
- **Apps web:** dois — `editor` (completo) e `playground` (sandbox YAML→SVG simples),
  como páginas separadas no setup multi-page do Vite, compartilhando a engine.
- **Linguagem da UI web:** JavaScript com módulos ES (não TS). A engine permanece
  em TS; a UI importa dela. Vite resolve `.ts` a partir de `.js`.
- **Pacote npm:** continua publicado via `tsc` (CLI/engine) — fluxo inalterado.

## Estrutura-alvo

```
floorplan/
├── vite.config.js          # multi-page: editor + playground
├── wrangler.toml           # Pages → pages_build_output_dir = dist/
├── tsconfig.json           # engine (tsc → dist/ p/ npm)
├── src/                    # ENGINE (TS) — praticamente intacta
│   ├── types.ts parser.ts layout.ts renderer.ts dxf.ts pdf.ts cli.ts index.ts
├── web/                    # SOURCE dos apps (JS + ESM, importam ../src)
│   ├── editor/
│   │   ├── index.html      # apenas marcação
│   │   ├── editor.css      # estilos extraídos
│   │   └── js/             # main.js, state.js, preview.js, properties.js,
│   │                       # layers.js, yaml-sync.js, export.js, library.js
│   ├── playground/
│   │   ├── index.html
│   │   ├── playground.css
│   │   └── main.js
│   ├── shared/             # symbols.js, helpers DOM, paleta de cores
│   └── public/             # _headers, _redirects, robots.txt, templates/
├── api/
│   └── worker.ts           # handler fino: importa render de ../src (~150 linhas)
├── tests/                  # Vitest: engine + worker
├── examples/  docs/
```

Saída do build → `dist/` (Pages serve `dist/`). Roteamento: `/` → editor,
`/playground` → playground.

## Transformação de cada monólito

- **`api/worker.js` (1.408) → `api/worker.ts`**: importa `render`/`exportDXF` de
  `../src`. Remove o re-port; sobra roteamento, CORS, e a doc HTML (`GET /`).
- **`web/editor.html` (3.444)**: dividido em `editor/index.html` (marcação) +
  `editor.css` + módulos JS por responsabilidade. O motor inline
  (`renderFloorplanSVG`, `renderFloorplanDXF`) é trocado por imports de `src`
  (`render`, `exportDXF`).
- **`web/playground.html` (1.961) → app `playground`**: enxuto, importa a engine
  (remove o CDN js-yaml e o port inline).
- **`web/index.html` (1.245) + `playground.html` (raiz, 691)**: consolidados/
  removidos. Features úteis migram para o editor; cada caso confirmado durante a
  implementação antes de remover.

## Módulos do editor (responsabilidade única)

- `main.js` — bootstrap, wiring de eventos, estado global da app
- `state.js` — modelo do documento (rooms/walls), undo/redo se existir
- `yaml-sync.js` — sincronização textarea YAML ↔ modelo
- `preview.js` — render do SVG (via engine) + drag-and-drop no preview
- `properties.js` — painel de propriedades (formulários por elemento)
- `layers.js` — painel de camadas
- `library.js` — biblioteca de cômodos/templates (fetch de `templates/`)
- `export.js` — download SVG/DXF/PDF (via engine)

Boundaries confirmados na implementação conforme o código real for lido; a lista
acima é o alvo, ajustável se o monólito revelar outra divisão mais natural.

## Tooling

- Adicionar `vite` e `vitest` como devDependencies.
- Scripts em `package.json`:
  - `dev` — Vite dev server
  - `build` — Vite build → `dist/` (usado pelo Cloudflare Pages)
  - `build:lib` — `tsc` → `dist/` para o pacote npm (CLI/engine)
  - `typecheck` — `tsc --noEmit`
  - `test` — Vitest
  - `deploy:worker` — `wrangler deploy api/worker.ts --name floorplan-api`
- `wrangler.toml`: `pages_build_output_dir = "dist"`; Cloudflare Pages configurado
  com build command `npm run build`.
- Atenção à coexistência: `tsc` (module commonjs) gera o pacote npm; Vite/Wrangler
  consomem o **source TS** diretamente (não o output commonjs). Sem conflito.

## Ordem de implementação (segura)

1. **Tooling** — Vite/Vitest, scripts, configs, sem quebrar o estado atual.
2. **Engine** — garantir exports necessários (já quase completos).
3. **Worker** — `worker.js` → `worker.ts` importando a engine; validar com o
   teste existente migrado.
4. **Playground** — reconstruir a partir do import da engine (valida o padrão).
5. **Editor** — dividir o monólito em HTML + CSS + módulos JS, trocando o motor
   inline por imports. Migração incremental mantendo o app funcionando.
6. **Limpeza** — remover duplicatas, atualizar `README.md`/`AGENTS.md` e config de
   deploy.
7. **Verificação** — `typecheck`, `test`, `build` verdes.

## Testes

Vitest com:
- Testes unitários da engine: para cada exemplo em `examples/`, `parse → layout →
  render` não lança e produz SVG válido (snapshot/contém elementos esperados).
- Migração de `tests/test-worker-api.js` para Vitest, testando o handler do worker.

## Risco principal

Dividir o editor (3.444 linhas) deve **preservar comportamento**. Mitigação:
migração incremental mantendo o app renderizando a cada passo; comparar o SVG
gerado contra o atual nos exemplos antes de declarar concluído.

## Critérios de sucesso

- Nenhuma lógica de parse/layout/render duplicada fora de `src/`.
- Nenhum arquivo HTML com CSS+JS+engine inline; marcação, estilo e lógica separados.
- `npm run build` produz `dist/` deployável no Cloudflare Pages.
- Worker deploya importando a engine (sem re-port).
- `npm run typecheck` e `npm test` passam.
- README/AGENTS refletem a nova estrutura.
```
