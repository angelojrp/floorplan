# Guia para Geração Automática de Plantas Baixas

Este documento descreve o schema YAML e as regras para que ferramentas de IA (Claude, GPT, etc.) possam gerar plantas baixas automaticamente usando o Floorplan.

---

## Schema YAML Completo

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
      - wall: south; offset: 160; width: 80; type: pivot; swing: left
    windows:
      - wall: north; offset: 100; width: 200; height: 120; sill: 110
```

---

## Checklist para Geração Automática

Ao gerar uma planta, verifique:

- [ ] Todos os `id` são únicos
- [ ] Cômodos adjacentes não têm gaps (B.x = A.x + A.width ou B.y = A.y + A.height)
- [ ] `offset + width ≤ comprimento_da_parede` para toda porta
- [ ] `offset + width ≤ comprimento_da_parede` para toda janela
- [ ] Janelas apenas em paredes externas (não em paredes compartilhadas com outros cômodos)
- [ ] Portas entre cômodos adjacentes existem em AMBOS os cômodos (se A tem porta sul, B tem porta norte na mesma posição)
- [ ] Dimensões são múltiplos de 5 ou 10 para construção realista
- [ ] Banheiro tem janela ou porta com `type: sliding` se muito pequeno
- [ ] Nenhum cômodo é menor que 150×180 cm
- [ ] `scale: 2` e `wallThickness: 15` são valores padrão

---

## Integração com LLMs

Para usar este schema com um LLM:

1. Inclua este documento como contexto/system prompt
2. Descreva o programa arquitetônico desejado (ex: "apartamento 2 quartos, 70m²")
3. Solicite a saída em YAML seguindo exatamente o schema acima
4. Valide com as regras da checklist

### Prompt template

```
Gere uma planta baixa no formato YAML do Floorplan para: [DESCRIÇÃO].

Requisitos:
- Use scale: 2, wallThickness: 15, grid: 100
- Cômodos devem ser adjacentes (sem gaps)
- Dimensões em centímetros
- Portas e janelas devem caber nas paredes
- IDs únicos para cada cômodo
- Apenas YAML válido como saída

Schema:
[colar schema da seção acima]
```
