import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planStats, parseFloorPlan } from '../src/index.ts';

const examples = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'examples');
const plan = (f) => parseFloorPlan(readFileSync(join(examples, f), 'utf8'));

describe('planStats', () => {
  it('converte cm² em m² e conta os cômodos', () => {
    expect(planStats({ rooms: [{ width: 500, height: 400 }, { width: 300, height: 200 }] }))
      .toEqual({ roomCount: 2, areaM2: 26 }); // 20 + 6
  });

  it('trata planta sem cômodos', () => {
    expect(planStats({})).toEqual({ roomCount: 0, areaM2: 0 });
    expect(planStats({ rooms: [] })).toEqual({ roomCount: 0, areaM2: 0 });
  });

  it('arredonda para uma casa decimal', () => {
    // 333 x 333 cm = 11.0889 m²
    expect(planStats({ rooms: [{ width: 333, height: 333 }] }).areaM2).toBe(11.1);
  });

  it('soma todos os pavimentos de uma planta multi-andar', () => {
    // O parser achata os cômodos de todos os pavimentos em `rooms`.
    const p = plan('casa2pav.yaml');
    const perFloor = p.floors.map((f) => f.rooms.length);
    expect(perFloor.length).toBeGreaterThan(1);
    expect(planStats(p).roomCount).toBe(perFloor.reduce((a, b) => a + b, 0));
  });

  it('não depende da escala', () => {
    const p = plan('casa.yaml');
    const base = planStats(p);
    expect(planStats({ ...p, scale: p.scale * 4 })).toEqual(base);
    expect(base.areaM2).toBeGreaterThan(0);
  });
});
