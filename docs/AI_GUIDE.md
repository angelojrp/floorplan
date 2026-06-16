# Floorplan — Guia de Geração por IA

Guia para LLMs (Claude, GPT, Gemini etc.) gerarem plantas baixas no formato YAML do Floorplan.

---

## Quick Start para Agentes de IA

### O que é o Floorplan

Um renderizador YAML→SVG. Você descreve cômodos, portas e janelas em YAML, e ele gera a planta baixa em SVG.

### Schema de validação

O arquivo `docs/schema.json` contém um JSON Schema (draft-07) completo. **Sempre valide seu YAML contra ele antes de enviar ao renderizador.**

### Estrutura mínima

```yaml
version: 1
scale: 2
wallThickness: 15
grid: 100
rooms:
  - id: sala
    name: Sala
    x: 0
    y: 0
    width: 400
    height: 400
    doors:
      - wall: south
        offset: 160
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: north
        offset: 100
        width: 200
        height: 120
        sill: 110
```

### Como usar

```bash
npx floorplan input.yaml -o output.svg
```

### Regras obrigatórias (as 5 mais importantes)

1. **Adjacência sem gaps**: se o cômodo B está à direita de A, então `B.x = A.x + A.width`. Se abaixo, `B.y = A.y + A.height`.
2. **Porta cabe na parede**: `offset + width ≤ comprimento_da_parede`. Para parede norte/sul o comprimento é `width` do cômodo; para leste/oeste é `height`.
3. **IDs únicos**: cada `id` de cômodo deve ser diferente.
4. **Portas entre cômodos são espelhadas**: se A tem porta na parede sul, B deve ter porta na parede norte com mesmo `offset` e `width`.
5. **Janelas só em paredes externas**: nunca coloque janela em parede compartilhada com outro cômodo.

### Dimensões típicas (cm)

| Cômodo | Mínimo | Ideal |
|--------|--------|-------|
| Sala de Estar | 350×350 | 450×500 |
| Cozinha | 200×250 | 300×350 |
| Quarto | 250×300 | 350×400 |
| Banheiro | 150×180 | 200×220 |
| Corredor | 100 largura | 120 largura |

---

## JSON Schema Reference

Use `docs/schema.json` para validação automática. Ele impõe todas as restrições formais:

- `version`: sempre `1` (literal)
- `scale`: número positivo (2 = 1:50, 1 = 1:100)
- `wallThickness`: número positivo (padrão 15)
- `grid`: número positivo ou `false` (padrão 100)
- `rooms`: array com no mínimo 1 item
  - `id`, `name`: strings não-vazias
  - `x`, `y`: números (qualquer sinal)
  - `width`, `height`: números ≥ 100 (mínimo de 100 cm por cômodo)
  - `doors[].wall`: `north` | `south` | `east` | `west`
  - `doors[].width`: 60–500 cm
  - `doors[].type`: `pivot` | `sliding` | `double` (padrão `pivot`)
  - `doors[].swing`: `left` | `right` | `none` (padrão `left`)
  - `windows[].wall`: mesmo enum
  - `hatch`: `solid` | `diagonal` | `cross` | `dots` | `horizontal` | `vertical`
  - `area`, `label`: opcionais
- `walls`: array opcional de `{from: [x,y], to: [x,y], thickness?: number}`
- `lot`: objeto opcional `{width, height}`

---

## Common Mistakes (o que IAs erram)

### 1. Indentação incorreta

**Errado** (4 espaços inconsistente, mistura de tabs):
```yaml
rooms:
    - id: sala
      name: Sala
       x: 0    # 3 espaços extra
```

**Certo** (2 espaços consistente):
```yaml
rooms:
  - id: sala
    name: Sala
    x: 0
```

### 2. Cômodos com gaps ou sobreposição

**Errado** (gap de 50cm entre Sala e Cozinha):
```yaml
- id: sala
  x: 0
  width: 500
- id: cozinha
  x: 550    # deveria ser 500
```

**Certo**:
```yaml
- id: sala
  x: 0
  width: 500
- id: cozinha
  x: 500    # exatamente x + width do cômodo anterior
```

### 3. Porta maior que a parede

**Errado** (offset 400 + width 120 = 520 > 500):
```yaml
# cômodo com width=500
doors:
  - wall: north
    offset: 400
    width: 120
```

**Certo**:
```yaml
doors:
  - wall: north
    offset: 200
    width: 80    # 200+80=280 ≤ 500 ✓
```

### 4. Janela em parede interna

**Errado** (janela entre cômodos adjacentes):
```yaml
- id: sala
  x: 0
  width: 500
  windows:
    - wall: east     # esta parede é compartilhada com a cozinha!
      offset: 100
      width: 150
- id: cozinha
  x: 500
  width: 300
```

**Certo**: janelas apenas em paredes que dão para o exterior (não compartilhadas).

### 5. IDs duplicados

**Errado**:
```yaml
rooms:
  - id: quarto
    name: Quarto 1
  - id: quarto    # duplicado!
    name: Quarto 2
```

**Certo**: use IDs únicos como `quarto_1`, `quarto_2`.

### 6. Uso de YAML flow style para portas/janelas

**Errado** (sintaxe inline — o renderizador não suporta):
```yaml
doors: [{wall: south, offset: 160, width: 80, type: pivot, swing: left}]
```

**Certo** (block style):
```yaml
doors:
  - wall: south
    offset: 160
    width: 80
    type: pivot
    swing: left
```

### 7. Portas não espelhadas entre cômodos adjacentes

Se a Sala tem porta na parede `south` com offset=200, width=80, o cômodo abaixo dela (ex: Corredor) precisa ter uma porta na parede `north` com os **mesmos** offset e width:
```yaml
- id: sala
  doors:
    - wall: south
      offset: 200
      width: 80
- id: corredor
  doors:
    - wall: north
      offset: 200    # mesmo offset
      width: 80      # mesma largura
```

---

## Prompt Templates

Copie e cole um destes prompts no seu LLM:

### Template 1 — Studio (30m²)

```
Gere uma planta baixa no formato YAML do Floorplan para um apartamento studio de ~30m².

Regras:
- Use version: 1, scale: 2, wallThickness: 15, grid: 100
- Crie 2 cômodos: "Sala/Cozinha Integrada" (ampla) e "Banheiro" (compacto)
- Sala/Cozinha com janelas em duas paredes externas e uma porta de entrada
- Banheiro anexo à Sala, com porta sliding e janela alta
- Dimensões em cm, todos os cômodos ≥ 100cm
- IDs únicos (ex: "living", "bath")
- offset + width ≤ comprimento da parede para todas as portas e janelas
- Cômodos adjacentes sem gaps
- Saída: apenas o YAML válido, sem explicações

Exemplos de referência em: examples/studio.yaml
```

### Template 2 — Casa 2 quartos (80m²)

```
Gere uma planta baixa no formato YAML do Floorplan para uma casa térrea de ~80m² com:
- Sala de Estar (com porta dupla de entrada e janela ampla)
- Cozinha (adjacente à sala, com porta sliding)
- Corredor central ligando os quartos
- Quarto 1 (casal, ~350×350)
- Quarto 2 (solteiro, ~300×350)
- Banheiro

Regras:
- Use version: 1, scale: 2, wallThickness: 15, grid: 100
- Layout: Sala e Cozinha lado a lado no topo; Corredor abaixo deles; Quartos e Banheiro abaixo do Corredor
- Adjacência sem gaps (B.x = A.x + A.width para vizinhos horizontais; B.y = A.y + A.height para verticais)
- Portas entre cômodos adjacentes DEVEM ser espelhadas (mesmo offset+width no cômodo de origem e destino)
- Janelas apenas em paredes externas
- Banheiro com porta pivot (70-80cm) e janela alta (sill ≥ 160)
- Dimensões múltiplas de 5 ou 10
- offset + width ≤ comprimento da parede para todas as aberturas
- Saída: apenas o YAML válido, sem explicações

Exemplos de referência em: examples/casa.yaml
```

### Template 3 — Escritório open-plan (100m²)

```
Gere uma planta baixa no formato YAML do Floorplan para um escritório comercial de ~100m² com:
- Recepção na entrada (com porta dupla)
- Sala de Reunião (adjacente à recepção)
- Banheiro (compacto, próximo à recepção)
- Área Open Plan (grande, ocupando a faixa central)
- 3 Salas Privativas (abaixo do open plan, lado a lado)

Regras:
- Use version: 1, scale: 2, wallThickness: 15, grid: 100
- Recepção, Reunião e Banheiro lado a lado no topo
- Open Plan abaixo deles (largura total)
- 3 Salas Privativas lado a lado abaixo do Open Plan
- Adjacência sem gaps
- Portas espelhadas entre cômodos adjacentes
- Janelas apenas em paredes externas (norte, sul, leste, oeste do perímetro)
- offset + width ≤ comprimento da parede
- Dimensões múltiplas de 5
- Saída: apenas o YAML válido, sem explicações

Exemplos de referência em: examples/comercial.yaml
```

---

## Schema YAML Completo (referência canônica)

```yaml
version: 1                    # obrigatório, fixo em 1
title: "string"               # opcional, título da planta
scale: number                 # px por cm (2 = escala 1:50, 1 = 1:100)
wallThickness: number         # espessura da parede em cm (padrão: 15)
grid: number | false          # espaçamento do grid em cm (100 recomendado)

lot:                          # terreno/lote (opcional)
  width: number               # largura em cm
  height: number              # altura em cm

rooms:                        # lista de cômodos (obrigatório, min 1)
  - id: string                # identificador único (ex: "sala", "quarto_1")
    name: string              # nome exibido no desenho
    x: number                 # posição X do canto superior esquerdo (cm)
    y: number                 # posição Y do canto superior esquerdo (cm)
    width: number             # largura do cômodo (cm)
    height: number            # altura do cômodo (cm)
    area: string              # opcional, ex: "12.5 m²"
    hatch: solid|diagonal|cross|dots|horizontal|vertical  # opcional
    label:                    # opcional, posição customizada do label
      x: number
      y: number
    doors:                    # lista de portas (opcional)
      - wall: north|south|east|west
        offset: number        # distância da extremidade esquerda/inferior (cm)
        width: number         # largura da porta (cm), típico: 70-100
        type: pivot|sliding|double
        swing: left|right|none
    windows:                  # lista de janelas (opcional)
      - wall: north|south|east|west
        offset: number        # distância da extremidade (cm)
        width: number         # largura da janela (cm)
        height: number        # altura da janela (cm), típico: 100-150
        sill: number          # altura do peitoril (cm), típico: 100-160

walls:                        # paredes avulsas (opcional)
  - from: [number, number]    # ponto inicial (x, y) em cm
    to: [number, number]      # ponto final (x, y) em cm
    thickness: number         # espessura em cm (padrão: 15)
```

---

## Regras Fundamentais

### 1. Adjacência de cômodos

Cômodos adjacentes devem compartilhar paredes. As coordenadas devem garantir que não haja gaps:

```
Sala:      x=0,   y=0,   width=500, height=400
Cozinha:   x=500, y=0,   width=300, height=400   ← parede leste da Sala = parede oeste da Cozinha
Quarto:    x=0,   y=400, width=500, height=350   ← parede sul da Sala = parede norte do Quarto
```

**Regra**: Se o cômodo B está à direita do A, então `B.x = A.x + A.width`.  
**Regra**: Se o cômodo B está abaixo do A, então `B.y = A.y + A.height`.

### 2. Portas dentro dos limites da parede

A porta deve caber inteiramente na parede: `offset + width ≤ comprimento da parede`.

Exemplo: parede sul de 500cm, porta com offset=200 e width=80 → 200+80=280 ≤ 500 ✓

### 3. Direção da parede para portas/janelas

- **north**: parede superior (y fixo), offset medido da esquerda (x)
- **south**: parede inferior (y fixo), offset medido da esquerda (x)
- **east**: parede direita (x fixo), offset medido de cima (y)
- **west**: parede esquerda (x fixo), offset medido de cima (y)

### 4. Swing das portas

- `left`: dobradiça no lado esquerdo da abertura (vista de dentro do cômodo)
- `right`: dobradiça no lado direito
- `none`: sem swing (usar com `type: sliding`)

### 5. Tipos de porta

| Tipo | Uso típico | Largura recomendada |
|------|-----------|-------------------|
| `pivot` | Portas internas padrão | 70-90 cm |
| `double` | Entrada principal, salas | 100-160 cm |
| `sliding` | Banheiros pequenos, closets | 70-90 cm |

### 6. Escala

`scale: 2` = escala 1:50 (cada cm real = 2px no SVG). Este é o padrão recomendado.
`scale: 1` = escala 1:100. Para plantas maiores.

---

## Convenções de Dimensionamento

### Dimensões mínimas realistas (cm)

| Cômodo | Largura mín | Altura mín | Ideal |
|--------|-----------|-----------|-------|
| Sala de Estar | 350 | 350 | 450×500 |
| Sala de Jantar | 300 | 300 | 350×400 |
| Cozinha | 200 | 250 | 300×350 |
| Quarto (solteiro) | 250 | 300 | 300×350 |
| Quarto (casal) | 300 | 350 | 350×400 |
| Banheiro | 150 | 180 | 200×220 |
| Corredor | 100 | — | 120 de largura |
| Escritório | 250 | 300 | 300×350 |
| Varanda | 150 | 200 | 200×300 |
| Garagem | 300 | 500 | 350×550 |

### Posicionamento de portas

- Portas externas: centralizadas na parede, offset ≈ (width_parede - width_porta) / 2
- Portas internas: próximas a um canto (offset 60-150), deixando espaço para móveis
- Porta do banheiro: offset pequeno (40-70) para maximizar espaço interno
- Porta dupla: centralizada, largura 100-160

### Posicionamento de janelas

- Janelas na parede externa (não em paredes que dão para outros cômodos)
- Centralizadas ou com offset 60-150
- Altura típica: 100-150 cm
- Peitoril: 100-110 cm (sala/quarto), 160-200 cm (banheiro)

---

## Padrões de Layout

### Apartamento compacto
```
+------------------+
| Sala/Cozinha     |
|                  |
|  [janela]        |
|        +----+    |
|        |Bnh |    |
| [porta]+----+    |
+------------------+
```
Sala/Cozinha integrada (0,0, 450, 500) + Banheiro (450,0, 220, 220)

### Casa com corredor
```
+--------+--------+
| Sala   | Cozinha|
|        |        |
+---[corredor]----+
| Quarto1|Quarto2 |
|        |        |
+--------+--------+
```
Corredor central (200,400, 600, 120) conectando os cômodos

### Escritório
```
+--------+--------+
|Recepção|Reunião |
|        +--------+
|        | Open   |
+--------+ Plan   |
| S1 | S2|        |
+----+---+--------+
```

---

## Validation Checklist

Antes de enviar o YAML ao renderizador, verifique **todos** os itens:

- [ ] `version: 1` está presente e é o primeiro campo
- [ ] `scale`, `wallThickness`, `grid` estão definidos com valores positivos
- [ ] Todos os `id` de cômodos são únicos
- [ ] Todos os `id` e `name` são strings não-vazias
- [ ] Cômodos adjacentes sem gaps: `B.x = A.x + A.width` ou `B.y = A.y + A.height`
- [ ] `offset + width ≤ comprimento_da_parede` para toda porta
- [ ] `offset + width ≤ comprimento_da_parede` para toda janela
- [ ] Portas entre cômodos adjacentes são espelhadas (mesmo offset e width em ambos)
- [ ] Janelas apenas em paredes externas (não compartilhadas com outro cômodo)
- [ ] Nenhum cômodo menor que 100×100 cm
- [ ] `door.width` está entre 60 e 500
- [ ] `door.swing` é `none` quando `door.type` é `sliding`
- [ ] Dimensões são múltiplos de 5 ou 10 para construção realista
- [ ] YAML usa indentação consistente de 2 espaços
- [ ] Nenhum flow style (`{}`, `[]` inline) para objetos/arrays aninhados
- [ ] O YAML é válido (sem erros de sintaxe)
- [ ] Validar contra `docs/schema.json` se possível

---

## Exemplo Mínimo (YAML válido)

```yaml
version: 1
scale: 2
wallThickness: 15
grid: 100
rooms:
  - id: sala
    name: Sala
    x: 0
    y: 0
    width: 400
    height: 400
    doors:
      - wall: south
        offset: 160
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: north
        offset: 100
        width: 200
        height: 120
        sill: 110
```

---

## Integração com LLMs

1. Inclua este documento como contexto/system prompt
2. Descreva o programa arquitetônico desejado
3. Use um dos Prompt Templates acima
4. Valide a saída com o Validation Checklist
5. Se disponível, valide contra `docs/schema.json`
6. Renderize com `npx floorplan input.yaml -o output.svg`
