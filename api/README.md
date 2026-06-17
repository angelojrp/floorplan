# Floorplan API — Cloudflare Worker

Renderiza plantas baixas descritas em YAML para SVG arquitetônico.

## Deploy

```bash
npm run deploy:worker
# equivalente a: npx wrangler deploy api/worker.ts --name floorplan-api
```

Requer [Wrangler](https://developers.cloudflare.com/workers/wrangler/) instalado e autenticado na Cloudflare. O Wrangler empacota o TypeScript e os imports da engine automaticamente (via esbuild).

### Pré-requisitos

- Node.js 18+
- Conta Cloudflare (free tier funciona)

```bash
npm install -g wrangler
wrangler login
npm run deploy:worker
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

O worker (`api/worker.ts`) é um handler fino que **importa a engine de `src/`**
(`render`) — sem reimplementar parse/layout/render. O Wrangler empacota a engine
e suas dependências (`yaml`, `zod`) automaticamente. Responsabilidades do worker:

- Roteamento (`GET /` documentação, `POST /render`)
- CORS
- Tratamento de erros → respostas `400`/`404`

## Limitações

- Sem rate limiting no free tier (Cloudflare impõe 100k req/dia)
