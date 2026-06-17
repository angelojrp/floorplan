import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../src/index';

const here = fileURLToPath(new URL('.', import.meta.url));
const examplesDir = join(here, '..', 'examples');
const files = readdirSync(examplesDir).filter((f) => f.endsWith('.yaml'));

describe('engine.render sobre examples/', () => {
  for (const file of files) {
    it(`renderiza ${file} para SVG válido`, () => {
      const yaml = readFileSync(join(examplesDir, file), 'utf8');
      const svg = render(yaml);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('</svg>');
      expect(svg.length).toBeGreaterThan(100);
    });

    it(`snapshot estável de ${file}`, () => {
      const yaml = readFileSync(join(examplesDir, file), 'utf8');
      expect(render(yaml)).toMatchSnapshot();
    });
  }
});
