import type { FloorPlanInput, Room, Floor } from './types';

// ── Ferramentas de apoio: memorial descritivo, materiais e recuos ──
// Todas derivam do FloorPlanInput já validado pelo parser. Unidades de entrada em cm.

const M2 = 10000; // cm² por m²

function fmt(n: number, d = 2): string {
  return n.toFixed(d).replace('.', ',');
}

export function getFloors(plan: FloorPlanInput): Floor[] {
  if (plan.floors && plan.floors.length) return plan.floors;
  return [{ id: 'main', name: 'Térreo', level: 0, rooms: plan.rooms || [] }];
}

export function roomArea(r: Room): number {
  return (r.width * r.height) / M2;
}

function roomPerimeter(r: Room): number {
  return (2 * (r.width + r.height)) / 100;
}

function openingsArea(r: Room): number {
  const w = (r.windows || []).reduce((s, x) => s + (x.width * (x.height ?? 120)) / M2, 0);
  const d = (r.doors || []).reduce((s, x) => s + (x.width * 210) / M2, 0);
  return w + d;
}

/** Pavimento de menor nível — projeção da edificação no terreno. */
function groundFloor(plan: FloorPlanInput): Floor {
  return [...getFloors(plan)].sort((a, b) => a.level - b.level)[0];
}

// ── Memorial descritivo ──

export function generateMemorial(plan: FloorPlanInput): string {
  const floors = getFloors(plan);
  const L: string[] = [];
  const title = plan.title || 'Projeto Residencial';
  L.push(`# MEMORIAL DESCRITIVO — ${title}`, '');
  const total = floors.reduce((s, f) => s + f.rooms.reduce((a, r) => a + roomArea(r), 0), 0);
  L.push('## 1. Objeto', '',
    `O presente memorial descreve as características técnicas da edificação "${title}", composta por ${floors.length} pavimento(s) e área construída útil total de ${fmt(total)} m², conforme planta baixa que o acompanha.`, '');
  if (plan.lot) {
    L.push('## 2. Terreno', '',
      `Terreno de ${fmt(plan.lot.width / 100)} m x ${fmt(plan.lot.height / 100)} m, área de ${fmt((plan.lot.width * plan.lot.height) / M2)} m².`, '');
  }
  L.push('## 3. Ambientes', '');
  for (const f of floors) {
    L.push(`### ${f.name} (nível ${f.level})`, '');
    for (const r of f.rooms) {
      const doors = (r.doors || []).length, wins = (r.windows || []).length;
      L.push(`- **${r.name}**: ${fmt(r.width / 100)} m x ${fmt(r.height / 100)} m, área ${fmt(roomArea(r))} m²; ${doors} porta(s), ${wins} janela(s).`);
    }
    L.push('');
  }
  const t = plan.wallThickness ?? 15;
  L.push('## 4. Especificações gerais', '',
    `- **Paredes**: alvenaria com espessura de ${t} cm, revestidas e pintadas.`,
    '- **Pisos**: cerâmico/porcelanato em áreas molhadas e cozinha; demais ambientes conforme projeto.',
    '- **Esquadrias**: portas internas e janelas conforme quadro de esquadrias abaixo.',
    '- **Instalações**: elétricas e hidrossanitárias conforme projetos complementares.', '',
    '## 5. Quadro de esquadrias', '');
  for (const f of floors) for (const r of f.rooms) {
    for (const d of r.doors || []) L.push(`- ${r.name}: porta ${d.type}, ${fmt(d.width / 100)} m (parede ${d.wall}).`);
    for (const w of r.windows || []) L.push(`- ${r.name}: janela ${fmt(w.width / 100)} x ${fmt((w.height ?? 120) / 100)} m, peitoril ${fmt((w.sill ?? 110) / 100)} m (parede ${w.wall}).`);
  }
  L.push('');
  return L.join('\n');
}

// ── Calculadora de materiais ──

export interface MaterialOptions {
  wallHeight?: number;      // m — pé-direito (padrão 2,70)
  paintCoats?: number;      // demãos (padrão 2)
  paintYield?: number;      // m²/L por demão (padrão 10)
  tileWaste?: number;       // perda de piso (padrão 0,10)
  mortarKgPerM2?: number;   // argamassa colante (padrão 5)
}

export interface MaterialRow { room: string; floorArea: number; paintArea: number; paintLiters: number; tileArea: number; mortarKg: number }
export interface MaterialResult { rows: MaterialRow[]; totals: Omit<MaterialRow, 'room'> }

export function calculateMaterials(plan: FloorPlanInput, o: MaterialOptions = {}): MaterialResult {
  const h = o.wallHeight ?? 2.7, coats = o.paintCoats ?? 2, yld = o.paintYield ?? 10;
  const waste = o.tileWaste ?? 0.1, kg = o.mortarKgPerM2 ?? 5;
  const rows: MaterialRow[] = [];
  for (const f of getFloors(plan)) for (const r of f.rooms) {
    const floorArea = roomArea(r);
    // paredes + teto, descontando vãos
    const paintArea = Math.max(0, roomPerimeter(r) * h - openingsArea(r)) + floorArea;
    const tileArea = floorArea * (1 + waste);
    rows.push({ room: r.name, floorArea, paintArea, paintLiters: (paintArea * coats) / yld, tileArea, mortarKg: tileArea * kg });
  }
  const sum = (k: keyof Omit<MaterialRow, 'room'>) => rows.reduce((s, r) => s + r[k], 0);
  return { rows, totals: { floorArea: sum('floorArea'), paintArea: sum('paintArea'), paintLiters: sum('paintLiters'), tileArea: sum('tileArea'), mortarKg: sum('mortarKg') } };
}

export function formatMaterials(res: MaterialResult): string {
  const L = ['Ambiente | Área piso (m²) | Pintura (m²) | Tinta (L) | Piso c/ perda (m²) | Argamassa (kg)', '--- | --- | --- | --- | --- | ---'];
  for (const r of res.rows) L.push(`${r.room} | ${fmt(r.floorArea)} | ${fmt(r.paintArea)} | ${fmt(r.paintLiters)} | ${fmt(r.tileArea)} | ${fmt(r.mortarKg, 1)}`);
  const t = res.totals;
  L.push(`**Total** | ${fmt(t.floorArea)} | ${fmt(t.paintArea)} | ${fmt(t.paintLiters)} | ${fmt(t.tileArea)} | ${fmt(t.mortarKg, 1)}`);
  return L.join('\n');
}

// ── Verificador de recuos e taxa de ocupação ──

export interface SetbackRules {
  front?: number;       // m — recuo frontal mínimo (padrão 5)
  side?: number;        // m — recuo lateral mínimo (padrão 1,5)
  back?: number;        // m — recuo de fundos mínimo (padrão 1,5)
  maxOccupancy?: number; // taxa de ocupação máxima, 0–1 (padrão 0,6)
}

export interface SetbackCheck { name: string; value: number; limit: number; ok: boolean; kind: 'min' | 'max' }
export interface SetbackResult { occupancy: number; footprint: number; checks: SetbackCheck[]; ok: boolean }

/**
 * Convenção: origem (0,0) no canto superior esquerdo do terreno; frente = lado sul
 * (y máximo), fundos = norte (y = 0), laterais = oeste/leste.
 */
export function checkSetbacks(plan: FloorPlanInput, rules: SetbackRules = {}): SetbackResult {
  if (!plan.lot) throw new Error('O YAML precisa do campo "lot" (width/height em cm) para verificar recuos.');
  const rooms = groundFloor(plan).rooms;
  const minX = Math.min(...rooms.map(r => r.x)), minY = Math.min(...rooms.map(r => r.y));
  const maxX = Math.max(...rooms.map(r => r.x + r.width)), maxY = Math.max(...rooms.map(r => r.y + r.height));
  const footprint = rooms.reduce((s, r) => s + roomArea(r), 0);
  const lotArea = (plan.lot.width * plan.lot.height) / M2;
  const occupancy = footprint / lotArea;
  const sideRule = rules.side ?? 1.5, maxOcc = rules.maxOccupancy ?? 0.6;
  const checks: SetbackCheck[] = [
    { name: 'Recuo frontal (sul)', value: (plan.lot.height - maxY) / 100, limit: rules.front ?? 5, ok: false, kind: 'min' },
    { name: 'Recuo de fundos (norte)', value: minY / 100, limit: rules.back ?? 1.5, ok: false, kind: 'min' },
    { name: 'Recuo lateral esquerdo (oeste)', value: minX / 100, limit: sideRule, ok: false, kind: 'min' },
    { name: 'Recuo lateral direito (leste)', value: (plan.lot.width - maxX) / 100, limit: sideRule, ok: false, kind: 'min' },
    { name: 'Taxa de ocupação', value: occupancy, limit: maxOcc, ok: false, kind: 'max' },
  ];
  for (const c of checks) c.ok = c.kind === 'min' ? c.value >= c.limit - 1e-9 : c.value <= c.limit + 1e-9;
  return { occupancy, footprint, checks, ok: checks.every(c => c.ok) };
}

export function formatSetbacks(res: SetbackResult): string {
  const L = res.checks.map(c => {
    const pct = c.kind === 'max';
    const v = pct ? `${fmt(c.value * 100, 1)}%` : `${fmt(c.value)} m`;
    const l = pct ? `${fmt(c.limit * 100, 1)}%` : `${fmt(c.limit)} m`;
    return `${c.ok ? 'OK    ' : 'FALHA '} ${c.name}: ${v} (${pct ? 'máx' : 'mín'} ${l})`;
  });
  L.push('', res.ok ? 'Resultado: atende aos parâmetros informados.' : 'Resultado: NÃO atende aos parâmetros informados.');
  return L.join('\n');
}
