# Floorplan

Renderizador de plantas baixas a partir de descrições YAML. Descreva cômodos, portas e janelas em um arquivo `.yaml` e gere um SVG pronto para uso — via CLI ou interface web.

## Uso via CLI

```bash
node dist/cli.js examples/apartamento.yaml -o output.svg
```

Opcões:

| Opção            | Descrição                              |
|------------------|----------------------------------------|
| `-o`, `--output` | Arquivo SVG de saída (padrão: stdout)  |
| `-s`, `--scale`  | Escala em px/cm (ex: 2 = 1:50)         |

Compile o projeto com `npm run build` antes de usar a CLI.

## Aplicação Web

Abra `web/index.html` diretamente no navegador ou faça o deploy no Cloudflare Pages.

### Deploy no Cloudflare Pages

1. Instale o [Wrangler](https://developers.cloudflare.com/workers/wrangler/):
   ```bash
   npm install -g wrangler
   ```

2. Faça login:
   ```bash
   wrangler login
   ```

3. Faça o deploy:
   ```bash
   wrangler pages deploy web --project-name floorplan
   ```

O projeto inclui `wrangler.toml`, `_headers`, `_redirects` e `robots.txt` pré-configurados.

## Referência do esquema YAML

```yaml
version: 1
title: "Minha Planta"
scale: 2            # px por cm (1:50)
wallThickness: 15   # cm (padrão)
grid: 100           # espaçamento do grid em cm (ou false para desabilitar)

rooms:
  - id: sala
    name: Sala de Estar
    x: 0             # posição X em cm
    y: 0             # posição Y em cm
    width: 550       # largura em cm
    height: 420      # altura em cm
    doors:
      - wall: south  # north | south | east | west
        offset: 200  # distância da extremidade da parede (cm)
        width: 80    # largura da porta (cm)
        type: pivot  # pivot | sliding | double
        swing: left  # left | right | none
    windows:
      - wall: west
        offset: 60
        width: 200
        height: 120  # altura da janela (cm)
        sill: 110    # altura do peitoril (cm)

walls:               # paredes avulsas (opcional)
  - from: [0, 800]
    to: [600, 800]
    thickness: 15
```

Veja `examples/apartamento.yaml` para um exemplo completo.
