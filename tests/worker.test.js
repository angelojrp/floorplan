import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../api/worker.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const examplesDir = join(here, '..', 'examples');

function post(body, contentType = 'text/plain') {
  return worker.fetch(
    new Request('https://x/render', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    }),
  );
}

describe('worker', () => {
  it('GET / retorna doc HTML', async () => {
    const res = await worker.fetch(new Request('https://x/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('POST /render com YAML válido retorna SVG', async () => {
    for (const f of readdirSync(examplesDir).filter((f) => f.endsWith('.yaml'))) {
      const res = await post(readFileSync(join(examplesDir, f), 'utf8'));
      expect(res.status, `${f} deve render`).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
      expect(await res.text()).toMatch(/^<svg/);
    }
  });

  it('POST /render vazio retorna 400', async () => {
    const res = await post('');
    expect(res.status).toBe(400);
  });

  it('POST /render com Content-Type inválido retorna 400', async () => {
    const res = await post('version: 1', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rota inexistente retorna 404', async () => {
    const res = await worker.fetch(new Request('https://x/nope'));
    expect(res.status).toBe(404);
  });

  it('OPTIONS retorna 204 com CORS', async () => {
    const res = await worker.fetch(
      new Request('https://x/render', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
