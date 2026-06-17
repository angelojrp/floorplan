# Floorplan — AI Agent Instructions

## What is Floorplan
A YAML-to-SVG floor plan renderer. AI agents use it to generate architectural floor plans programmatically.

## How to use Floorplan from an AI agent

### Option A: CLI (recommended)
```bash
npx floorplan input.yaml -o output.svg
```

### Option B: Web API (Cloudflare Worker)
```bash
curl -X POST https://floorplan-api.YOURDOMAIN.workers.dev/render \
  -H "Content-Type: application/yaml" \
  --data-binary @plan.yaml \
  -o plan.svg
```

### Option C: Use the TypeScript engine directly
```typescript
import { render } from 'floorplan';
const svg = render(yamlString);
```

## Generating floor plans with AI
When asked to create a floor plan:
1. Read `docs/AI_GUIDE.md` for the YAML schema
2. Use `docs/schema.json` for validation
3. Output valid YAML following the schema exactly
4. Common pitfalls: indentation (2 spaces), room adjacency (no gaps), door offset+width ≤ wall length

## Project structure
- `src/` — TypeScript engine (single source of truth: parse → layout → render → DXF/PDF)
- `web/` — Web apps (editor + playground); JS/ESM importing the engine, bundled by Vite
- `api/worker.ts` — Cloudflare Worker importing the engine
- `docs/` — Documentation
- `examples/` — Example YAML files

Build: `npm run build` (web apps → `dist/`), `npm run build:lib` (engine/CLI npm package), `npm test` (Vitest).
