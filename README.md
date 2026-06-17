# 🏠 Floorplan

[![npm version](https://img.shields.io/npm/v/@angelojrp/floorplan)](https://www.npmjs.com/package/@angelojrp/floorplan)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **AI-ready**: use via `npx @angelojrp/floorplan input.yaml -o output.svg` — zero install.

**Renderizador de plantas baixas YAML → SVG**. Descreva cômodos, portas e janelas em YAML e obtenha um desenho arquitetônico profissional em SVG.

---

## ✨ Funcionalidades

- 🧱 **Paredes preenchidas** com espessura real (estilo AutoCAD)
- 🚪 **Portas**: pivot, sliding, double — com arco de abertura e batentes
- 🪟 **Janelas** com moldura e gap na parede
- 📐 **Cotas** externas com ticks arquitetônicos
- 🏡 **Terreno** (lot) — contorno tracejado do lote
- 🧩 **Biblioteca** de 10 cômodos prontos (clique para inserir)
- 🖱️ **Drag-and-drop** — reposicione cômodos direto no preview SVG
- 📊 **Resumo executivo** — áreas, quantidade de cômodos/portas/janelas
- 🔲 Grid configurável (pontos)
- 🎨 Paleta arquitetônica (paredes cinza, cotas vermelhas)

---

## 🚀 Uso rápido

```bash
# Via npx (zero instalação)
npx @angelojrp/floorplan examples/apartamento.yaml -o saida.svg

# Via npm global
npm install -g @angelojrp/floorplan
floorplan input.yaml -o output.svg
```

### Web App

Dois apps compartilham a mesma engine (`src/`):

- **Editor** (`web/editor/`) — editor visual completo (canvas, ferramentas, pavimentos, camadas, exports).
- **Playground** (`web/playground/`) — sandbox YAML → SVG com preview ao vivo.

Desenvolvimento local:

```bash
npm install
npm run dev      # Vite dev server — /editor/ e /playground/
```

### Deploy no Cloudflare Pages

O build é feito pelo Vite e a saída vai para `dist-web/`.

```bash
npm run build
npx wrangler pages deploy dist-web/
```

Ou configure pelo dashboard com **build command** `npm run build` e **output directory** `dist-web`.

---

## 📋 Schema YAML

```yaml
version: 1
title: "Minha Planta"
scale: 2              # px por cm (2 = escala 1:50)
wallThickness: 15     # cm
grid: 100             # cm (ou false para desligar)

lot:                  # terreno (opcional)
  width: 2000         # cm
  height: 2500        # cm

rooms:
  - id: sala
    name: Sala de Estar
    x: 0              # posição X (cm)
    y: 0              # posição Y (cm)
    width: 500        # largura (cm)
    height: 400       # altura (cm)
    doors:
      - wall: south   # north | south | east | west
        offset: 200   # distância da extremidade (cm)
        width: 80     # largura (cm)
        type: pivot   # pivot | sliding | double
        swing: left   # left | right | none
    windows:
      - wall: north
        offset: 100
        width: 200
        height: 120   # altura da janela (cm)
        sill: 110     # altura do peitoril (cm)

walls:                # paredes avulsas (opcional)
  - from: [0, 800]
    to: [600, 800]
    thickness: 15
```

### Tipos de porta

| Tipo | Descrição |
|------|-----------|
| `pivot` | Porta comum com dobradiça (arco de 90°) |
| `sliding` | Porta de correr (sem arco) |
| `double` | Porta dupla (duas folhas, arcos opostos) |

### Direção do swing

`left` = dobradiça no lado esquerdo da abertura  
`right` = dobradiça no lado direito da abertura  
`none` = sem swing (usado com `sliding`)

---

## 📂 Estrutura

```
floorplan/
├── src/                # Engine TypeScript — ÚNICA fonte da verdade
│   ├── types.ts        # Tipos e interfaces
│   ├── parser.ts       # Parser YAML + validação Zod
│   ├── layout.ts       # Engine de geometria
│   ├── renderer.ts     # Renderizador SVG
│   ├── dxf.ts          # Exportador DXF
│   ├── pdf.ts          # Geração de HTML p/ PDF
│   ├── cli.ts          # CLI
│   └── index.ts        # API pública
├── web/                # Apps web (JS + ESM, importam a engine de src/)
│   ├── editor/         # Editor visual (index.html + editor.css + js/)
│   ├── playground/     # Playground YAML→SVG (index.html + css + js)
│   ├── shared/         # Símbolos e utilitários compartilhados
│   └── public/         # _headers, _redirects, robots.txt, templates/
├── api/
│   └── worker.ts       # Cloudflare Worker (importa a engine)
├── examples/           # Exemplos YAML
├── vite.config.js      # Build dos apps web → dist-web/
├── wrangler.toml       # Deploy config (Cloudflare Pages)
└── LICENSE             # MIT
```

---

## 📐 Exemplos inclusos

| Exemplo | Área | Cômodos |
|---------|------|---------|
| Apartamento 2 Quartos | ~85m² | Sala, Cozinha, Banheiro, 2 Quartos |
| Studio Compacto | ~25m² | Sala/Cozinha, Banheiro |
| Casa Pequena | ~75m² | Sala, Cozinha, Corredor, 2 Quartos, Banheiro |
| Escritório Comercial | ~82m² | Recepção, Reunião, Open Plan, 3 Salas, Banheiro |
| Galpão Industrial | ~162m² | Armazenagem, Doca, Escritório, Banheiro |

---

## 🛠️ Desenvolvimento

```bash
npm install        # instalar dependências
npm run dev        # Vite dev server (apps web)
npm run build      # build dos apps web → dist-web/ (deploy Cloudflare Pages)
npm run build:lib  # compilar a engine/CLI (pacote npm) com tsc → dist/
npm run typecheck  # verificar tipos
npm test           # testes (Vitest) da engine + worker
```

A engine está em [`src/`](src/) (TypeScript) e é a **única fonte da verdade**:
os apps web ([`web/`](web/)) e o worker ([`api/worker.ts`](api/worker.ts)) importam dela.
Vite (web) e Wrangler (worker) fazem o bundle — sem código de engine duplicado.

---

**Licença**: MIT — veja [LICENSE](LICENSE)
