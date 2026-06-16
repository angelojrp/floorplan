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

Abra [`web/index.html`](web/index.html) no navegador — **sem instalação, sem build**.

Editor YAML à esquerda, preview SVG em tempo real à direita.

### Deploy no Cloudflare Pages

```bash
npx wrangler pages deploy web/
```

Ou configure pelo dashboard apontando para o diretório `web/`.

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
├── src/            # Engine TypeScript
│   ├── types.ts    # Tipos e interfaces
│   ├── parser.ts   # Parser YAML + validação Zod
│   ├── layout.ts   # Engine de geometria
│   ├── renderer.ts # Renderizador SVG
│   ├── cli.ts      # CLI
│   └── index.ts    # API pública
├── web/
│   ├── index.html  # App web (autossuficiente)
│   ├── _headers    # Cloudflare config
│   └── _redirects
├── examples/       # 5 exemplos YAML + SVGs
├── playground.html # Playground standalone
├── wrangler.toml   # Deploy config
└── LICENSE         # MIT
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
npm run build      # compilar TypeScript
npm run typecheck  # verificar tipos
```

A engine está em [`src/`](src/) (TypeScript, compila para `dist/`).  
O app web em [`web/index.html`](web/index.html) contém a engine portada para JS inline — sem dependências de build.

---

**Licença**: MIT — veja [LICENSE](LICENSE)
