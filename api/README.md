# Floorplan API — Cloudflare Worker

Renderiza plantas baixas descritas em YAML para SVG arquitetônico.

## Deploy

```bash
npx wrangler deploy api/worker.js --name floorplan-api
```

Requer [Wrangler](https://developers.cloudflare.com/workers/wrangler/) instalado e autenticado na Cloudflare.

### Pré-requisitos

- Node.js 18+
- Conta Cloudflare (free tier funciona)

```bash
npm install -g wrangler
wrangler login
npx wrangler deploy api/worker.js --name floorplan-api
```

A URL do worker será exibida após o deploy (formato `https://floorplan-api.<subdomain>.workers.dev`).

## Endpoints

| Método | Rota     | Descrição                    |
|--------|----------|------------------------------|
| GET    | `/`      | Documentação HTML            |
| POST   | `/render`| YAML no corpo → SVG          |

## Exemplo de uso

```bash
curl -X POST https://floorplan-api.<seu-subdominio>.workers.dev/render \
  -H "Content-Type: text/plain" \
  --data-binary @examples/apartamento.yaml \
  -o planta.svg
```

## Formato YAML

Ver documentação completa em `GET /` após o deploy.

Exemplo mínimo:

```yaml
version: 1
scale: 2
rooms:
  - id: sala
    name: Sala de Estar
    x: 0
    y: 0
    width: 500
    height: 400
```

## Estrutura do Worker

O worker é auto-contido — sem dependências npm externas. Inclui inline:

- **Parser YAML** simplificado (subconjunto compatível com o DSL do projeto)
- **Motor de layout** — resolve geometria, portas, janelas, cotas
- **Renderer SVG** — gera SVG arquitetônico com paleta de cores

## Limitações

- YAML parser suporta subconjunto do padrão: apenas o formato usado pelo DSL de plantas baixas
- Sem rate limiting no free tier (Cloudflare impõe 100k req/dia)
