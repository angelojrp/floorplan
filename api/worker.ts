import { render } from '../src/index';

const HTML_DOCS = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Floorplan API</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; background: #fafafa; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 20px; margin: 32px 0 12px; border-bottom: 2px solid #2d2d2d; padding-bottom: 4px; }
    h3 { font-size: 16px; margin: 20px 0 8px; }
    p { line-height: 1.6; margin-bottom: 12px; }
    pre { background: #2d2d2d; color: #f0f0f0; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
    code { background: #e8e8e8; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
    pre code { background: none; padding: 0; }
    .endpoint { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0; }
    .method { display: inline-block; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 12px; margin-right: 8px; }
    .method.post { background: #d6eaf8; color: #1a5276; }
    .method.get { background: #d5f5e3; color: #1e8449; }
    .path { font-family: monospace; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { text-align: left; padding: 8px 12px; border: 1px solid #ddd; font-size: 14px; }
    th { background: #f0f0f0; }
    a { color: #2d2d2d; }
  </style>
</head>
<body>
  <h1>Floorplan API</h1>
  <p>Renderiza plantas baixas descritas em YAML para SVG arquitetônico.</p>

  <h2>Endpoints</h2>

  <div class="endpoint">
    <span class="method post">POST</span>
    <span class="path">/render</span>
    <p>Envia um documento YAML no corpo da requisição. Retorna SVG.</p>

    <h3>Content-Type</h3>
    <p><code>text/plain</code> ou <code>application/x-yaml</code></p>

    <h3>Resposta</h3>
    <p><code>200</code> — <code>image/svg+xml</code> com o SVG renderizado.</p>
    <p><code>400</code> — JSON com <code>{ "error": "...", "details": [...] }</code>.</p>

    <h3>Exemplo — curl</h3>
    <pre><code>curl -X POST https://floorplan-api.&lt;seu-subdominio&gt;.workers.dev/render \\
  -H "Content-Type: text/plain" \\
  --data-binary @apartamento.yaml \\
  -o planta.svg</code></pre>

    <h3>Exemplo — fetch (browser)</h3>
    <pre><code>const yaml = \`version: 1
scale: 2
rooms:
  - id: sala
    name: Sala
    x: 0
    y: 0
    width: 500
    height: 400
\`;

const resp = await fetch('https://floorplan-api.&lt;seu-subdominio&gt;.workers.dev/render', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: yaml,
});
const svg = await resp.text();
document.body.innerHTML = svg;</code></pre>
  </div>

  <div class="endpoint">
    <span class="method get">GET</span>
    <span class="path">/</span>
    <p>Esta documentação.</p>
  </div>

  <h2>Formato YAML</h2>

  <table>
    <tr><th>Campo</th><th>Tipo</th><th>Descrição</th></tr>
    <tr><td><code>version</code></td><td>number</td><td>Versão do schema (sempre <code>1</code>)</td></tr>
    <tr><td><code>title</code></td><td>string</td><td>Título da planta</td></tr>
    <tr><td><code>scale</code></td><td>number</td><td>Pixels por cm (ex: <code>2</code> = 1:50)</td></tr>
    <tr><td><code>wallThickness</code></td><td>number</td><td>Espessura das paredes em cm (padrão: 15)</td></tr>
    <tr><td><code>grid</code></td><td>number | false</td><td>Espaçamento do grid em cm (padrão: 100)</td></tr>
    <tr><td><code>rooms</code></td><td>list</td><td>Lista de cômodos</td></tr>
    <tr><td><code>walls</code></td><td>list</td><td>Paredes avulsas (opcional)</td></tr>
  </table>

  <h3>Cômodo (room)</h3>
  <table>
    <tr><th>Campo</th><th>Tipo</th><th>Descrição</th></tr>
    <tr><td><code>id</code></td><td>string</td><td>Identificador único</td></tr>
    <tr><td><code>name</code></td><td>string</td><td>Nome exibido no label</td></tr>
    <tr><td><code>x</code>, <code>y</code></td><td>number</td><td>Posição em cm</td></tr>
    <tr><td><code>width</code>, <code>height</code></td><td>number</td><td>Dimensões em cm</td></tr>
    <tr><td><code>doors</code></td><td>list</td><td>Portas do cômodo</td></tr>
    <tr><td><code>windows</code></td><td>list</td><td>Janelas do cômodo</td></tr>
    <tr><td><code>hatch</code></td><td>string</td><td>Hachura: solid, diagonal, cross, dots, horizontal, vertical</td></tr>
  </table>

  <h3>Porta (door)</h3>
  <table>
    <tr><th>Campo</th><th>Valores</th></tr>
    <tr><td><code>wall</code></td><td>north, south, east, west</td></tr>
    <tr><td><code>offset</code></td><td>Distância da extremidade (cm)</td></tr>
    <tr><td><code>width</code></td><td>Largura da porta (cm)</td></tr>
    <tr><td><code>type</code></td><td>pivot, sliding, double (padrão: pivot)</td></tr>
    <tr><td><code>swing</code></td><td>left, right, none (padrão: left)</td></tr>
  </table>

  <h3>Exemplo completo</h3>
  <pre><code>version: 1
title: "Apartamento 2 Quartos"
scale: 2
wallThickness: 15
grid: 100

rooms:
  - id: sala
    name: Sala de Estar
    x: 0
    y: 0
    width: 550
    height: 420
    doors:
      - wall: south
        offset: 200
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: west
        offset: 60
        width: 200

  - id: cozinha
    name: Cozinha
    x: 550
    y: 0
    width: 300
    height: 420
    doors:
      - wall: west
        offset: 150
        width: 80

  - id: quarto
    name: Quarto
    x: 0
    y: 420
    width: 550
    height: 380
    doors:
      - wall: east
        offset: 200
        width: 80</code></pre>

  <h2>Deploy</h2>
  <pre><code>npx wrangler deploy api/worker.ts --name floorplan-api</code></pre>
  <p><a href="https://github.com/anomalyco/opencode">GitHub</a></p>
</body>
</html>`;

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
