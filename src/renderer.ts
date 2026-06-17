import type { ResolvedFloorPlan, ResolvedRoom, ResolvedDoor, ResolvedWindow, ResolvedStair, ResolvedFreeWall, WallSegment, Dimension, Arc } from './types';

// ── paleta arquitetônica ──

const C = {
  wall:          '#2d2d2d',
  wallStroke:    '#1a1a1a',
  roomBg:        '#fafafa',
  door:          '#2d2d2d',
  doorArc:       '#555555',
  windowStroke:  '#4a90d9',
  windowGlass:   '#d6eaf8',
  dimLine:       '#b71c1c',
  dimText:       '#b71c1c',
  gridDot:       '#e0e0e0',
  label:         '#1a1a1a',
  areaLabel:     '#666666',
  title:         '#1a1a1a',
  freeWall:      '#e0e0e0',
  freeWallStroke:'#2d2d2d',
  jamb:          '#2d2d2d',
};

const WALL_STROKE = 0.8;
const DOOR_PANEL = 1.8;
const DOOR_ARC_W = 1.2;
const WINDOW_LINE = 1.5;
const JAMB_WIDTH = 3;
const DIM_LINE_W = 0.8;
const GRID_R = 0.6;

/**
 * Gera SVG arquitetônico da planta baixa.
 */
export function renderSvg(input: ResolvedFloorPlan): string {
  const { rooms, stairs, freeWalls, wallThicknessPx, grid, dimensions, title, lot } = input;
  const wt = wallThicknessPx;

  const bounds = computeBounds(rooms, freeWalls, dimensions);
  // o terreno pode ser maior que a planta — garante que entre no viewBox
  if (lot) {
    bounds.minX = Math.min(bounds.minX, lot.x);
    bounds.minY = Math.min(bounds.minY, lot.y);
    bounds.maxX = Math.max(bounds.maxX, lot.x + lot.width);
    bounds.maxY = Math.max(bounds.maxY, lot.y + lot.height);
  }
  const { minX, minY, maxX, maxY } = bounds;
  const margin = 70;
  const vbX = minX - margin;
  const vbY = minY - margin;
  const vbW = maxX - minX + margin * 2;
  const vbH = maxY - minY + margin * 2;

  const out: string[] = [];

  // header
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="100%" height="100%">`,
    '<style>',
    `  .wall-fill { fill: ${C.wall}; stroke: ${C.wallStroke}; stroke-width: ${WALL_STROKE}; }`,
    `  .room-bg { fill: ${C.roomBg}; }`,
    `  .door-panel { stroke: ${C.door}; stroke-width: ${DOOR_PANEL}; stroke-linecap: round; }`,
    `  .door-arc { fill: none; stroke: ${C.doorArc}; stroke-width: ${DOOR_ARC_W}; stroke-dasharray: 5 4; }`,
    `  .window-frame { stroke: ${C.windowStroke}; stroke-width: ${WINDOW_LINE}; }`,
    `  .window-glass { fill: ${C.windowGlass}; stroke: ${C.windowStroke}; stroke-width: 0.6; }`,
    `  .jamb { stroke: ${C.jamb}; stroke-width: ${JAMB_WIDTH}; stroke-linecap: round; }`,
    `  .dim-line { fill: none; stroke: ${C.dimLine}; stroke-width: ${DIM_LINE_W}; }`,
    `  .dim-tick { stroke: ${C.dimLine}; stroke-width: ${DIM_LINE_W}; }`,
    `  .dim-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: ${C.dimText}; text-anchor: middle; }`,
    `  .room-name { font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; font-weight: 600; fill: ${C.label}; text-anchor: middle; dominant-baseline: middle; }`,
    `  .room-area { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 500; fill: ${C.areaLabel}; text-anchor: middle; dominant-baseline: middle; }`,
    `  .room-dim { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: ${C.dimText}; text-anchor: middle; dominant-baseline: middle; }`,
    `  .title-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 20px; font-weight: 700; fill: ${C.title}; text-anchor: middle; }`,
    `  .grid-dot { fill: ${C.gridDot}; }`,
    `  .free-wall-fill { fill: ${C.freeWall}; stroke: ${C.freeWallStroke}; stroke-width: ${WALL_STROKE}; }`,
    `  .stair-fill { fill: #f5f0e8; stroke: #8a7b6b; stroke-width: 1.5; }`,
    `  .stair-label { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 700; fill: #6d5d4b; text-anchor: middle; dominant-baseline: middle; }`,
    `  .lot { fill: #f0f4e8; stroke: #8a9b68; stroke-width: 1.5; stroke-dasharray: 8 4; }`,
    '</style>',
    '<defs>',
    `  <pattern id="hatch-diagonal" patternUnits="userSpaceOnUse" width="8" height="8">
       <rect width="8" height="8" fill="#fafafa"/>
       <line x1="0" y1="0" x2="8" y2="8" stroke="#e0e0e0" stroke-width="1"/>
     </pattern>`,
    `  <pattern id="hatch-cross" patternUnits="userSpaceOnUse" width="8" height="8">
       <rect width="8" height="8" fill="#fafafa"/>
       <line x1="0" y1="0" x2="8" y2="8" stroke="#e0e0e0" stroke-width="1"/>
       <line x1="8" y1="0" x2="0" y2="8" stroke="#e0e0e0" stroke-width="1"/>
     </pattern>`,
    `  <pattern id="hatch-dots" patternUnits="userSpaceOnUse" width="6" height="6">
       <rect width="6" height="6" fill="#fafafa"/>
       <circle cx="3" cy="3" r="1" fill="#e0e0e0"/>
     </pattern>`,
    `  <pattern id="hatch-horizontal" patternUnits="userSpaceOnUse" width="6" height="6">
       <rect width="6" height="6" fill="#fafafa"/>
       <line x1="0" y1="3" x2="6" y2="3" stroke="#e0e0e0" stroke-width="1"/>
     </pattern>`,
    `  <pattern id="hatch-vertical" patternUnits="userSpaceOnUse" width="6" height="6">
       <rect width="6" height="6" fill="#fafafa"/>
       <line x1="3" y1="0" x2="3" y2="6" stroke="#e0e0e0" stroke-width="1"/>
     </pattern>`,
    `  <pattern id="stair-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
       <rect width="10" height="10" fill="#f5f0e8"/>
       <line x1="0" y1="5" x2="10" y2="5" stroke="#d4c9b8" stroke-width="1.5"/>
     </pattern>`,
    `  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
       <polygon points="0 0, 8 3, 0 6" fill="#6d5d4b"/>
     </marker>`,
    '</defs>'
  );

  // background
  out.push(`<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#ffffff"/>`);

  // terreno (lot) — borda tracejada desenhada antes da planta
  if (lot) {
    out.push(`<rect x="${rnd(lot.x)}" y="${rnd(lot.y)}" width="${rnd(lot.width)}" height="${rnd(lot.height)}" class="lot"/>`);
  }

  // grid (pontos)
  if (grid !== false) {
    out.push(renderGrid(vbX, vbY, vbW, vbH, grid));
  }

  // título
  if (title) {
    out.push(`<text x="${(minX + maxX) / 2}" y="${minY - 40}" class="title-text">${esc(title)}</text>`);
  }

  // fundo dos cômodos
  for (const room of rooms) {
    if (room.hatch && room.hatch !== 'solid') {
      out.push(`<rect x="${room.rect.x}" y="${room.rect.y}" width="${room.rect.width}" height="${room.rect.height}" fill="url(#hatch-${room.hatch})" data-room-id="${esc(room.id)}"/>`);
    } else {
      out.push(`<rect x="${room.rect.x}" y="${room.rect.y}" width="${room.rect.width}" height="${room.rect.height}" class="room-bg" data-room-id="${esc(room.id)}"/>`);
    }
  }

  // paredes preenchidas (deduplicadas para evitar sobreposição entre cômodos adjacentes)
  out.push(...renderAllWalls(rooms, wt));

  // paredes avulsas
  for (const fw of freeWalls) {
    out.push(renderFreeWall(fw));
  }

  // janelas (desenhadas sobre as paredes)
  for (const room of rooms) {
    for (const win of room.windows) {
      out.push(renderWindow(win, wt));
    }
  }

  // batentes das portas
  for (const room of rooms) {
    for (const door of room.doors) {
      out.push(renderDoorJambs(door, wt));
    }
  }

  // arcos e painéis das portas
  for (const room of rooms) {
    for (const door of room.doors) {
      out.push(renderDoorPanels(door));
    }
  }

  // preenchimento de cantos — fecha gaps onde paredes perpendiculares se encontram
  out.push(...renderCornerFills(rooms, wt));

  // labels dos cômodos
  for (const room of rooms) {
    out.push(renderRoomLabel(room, input.scale));
  }

  // stairs
  if (stairs) for (const stair of stairs) {
    out.push(renderStair(stair));
  }

  // cotas
  for (const dim of dimensions) {
    out.push(renderDimension(dim));
  }

  out.push('</svg>');
  return out.join('\n');
}

// ── grid como pontos ──

function renderGrid(x: number, y: number, w: number, h: number, spacing: number): string {
  const lines: string[] = [];
  const r = GRID_R;
  for (let cx = Math.ceil(x / spacing) * spacing; cx <= x + w; cx += spacing) {
    for (let cy = Math.ceil(y / spacing) * spacing; cy <= y + h; cy += spacing) {
      lines.push(`<circle cx="${cx}" cy="${cy}" r="${r}" class="grid-dot"/>`);
    }
  }
  return lines.join('\n');
}

// ── paredes preenchidas (com deduplicação respeitando aberturas) ──

interface Span {
  a: number;
  b: number;
}

function renderAllWalls(rooms: ResolvedRoom[], wt: number): string[] {
  // coleta sólidos e aberturas por coordenada
  const hSolids = new Map<number, Span[]>();   // key=y
  const hOpenings = new Map<number, Span[]>();  // key=y
  const vSolids = new Map<number, Span[]>();   // key=x
  const vOpenings = new Map<number, Span[]>();  // key=x

  for (const room of rooms) {
    // segmentos de parede (sólidos)
    for (const seg of room.wallRects) {
      const isH = seg.direction === 'north' || seg.direction === 'south';
      if (isH) {
        const list = hSolids.get(seg.y1) || [];
        list.push({ a: Math.min(seg.x1, seg.x2), b: Math.max(seg.x1, seg.x2) });
        hSolids.set(seg.y1, list);
      } else {
        const list = vSolids.get(seg.x1) || [];
        list.push({ a: Math.min(seg.y1, seg.y2), b: Math.max(seg.y1, seg.y2) });
        vSolids.set(seg.x1, list);
      }
    }

    // aberturas (portas + janelas)
    for (const door of room.doors) {
      const isH = door.wall === 'north' || door.wall === 'south';
      const y = isH ? door.start.y : door.start.x;
      const a = isH ? Math.min(door.start.x, door.end.x) : Math.min(door.start.y, door.end.y);
      const b = isH ? Math.max(door.start.x, door.end.x) : Math.max(door.start.y, door.end.y);
      const map = isH ? hOpenings : vOpenings;
      const list = map.get(y) || [];
      list.push({ a, b });
      map.set(y, list);
    }
    for (const win of room.windows) {
      const isH = win.wall === 'north' || win.wall === 'south';
      const y = isH ? win.start.y : win.start.x;
      const a = isH ? Math.min(win.start.x, win.end.x) : Math.min(win.start.y, win.end.y);
      const b = isH ? Math.max(win.start.x, win.end.x) : Math.max(win.start.y, win.end.y);
      const map = isH ? hOpenings : vOpenings;
      const list = map.get(y) || [];
      list.push({ a, b });
      map.set(y, list);
    }
  }

  const out: string[] = [];
  const hw = wt / 2;

  // renderiza paredes horizontais
  for (const [y, solids] of hSolids) {
    const openings = mergeSpans(hOpenings.get(y) || []);
    const merged = subtractOpenings(mergeSpans(solids), openings);
    for (const s of merged) {
      const w = s.b - s.a;
      if (w <= 0) continue;
      out.push(`<rect x="${rnd(s.a)}" y="${rnd(y - hw)}" width="${rnd(w)}" height="${rnd(wt)}" class="wall-fill"/>`);
    }
  }

  // renderiza paredes verticais
  for (const [x, solids] of vSolids) {
    const openings = mergeSpans(vOpenings.get(x) || []);
    const merged = subtractOpenings(mergeSpans(solids), openings);
    for (const s of merged) {
      const h = s.b - s.a;
      if (h <= 0) continue;
      out.push(`<rect x="${rnd(x - hw)}" y="${rnd(s.a)}" width="${rnd(wt)}" height="${rnd(h)}" class="wall-fill"/>`);
    }
  }

  return out;
}

function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.a - b.a);
  const result: Span[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1];
    if (sorted[i].a <= last.b) {
      last.b = Math.max(last.b, sorted[i].b);
    } else {
      result.push(sorted[i]);
    }
  }
  return result;
}

function subtractOpenings(solids: Span[], openings: Span[]): Span[] {
  if (openings.length === 0) return solids;
  const result: Span[] = [];
  for (const solid of solids) {
    let cursor = solid.a;
    for (const op of openings) {
      if (op.b <= cursor) continue;
      if (op.a >= solid.b) break;
      const gapStart = Math.max(cursor, op.a);
      const gapEnd = Math.min(solid.b, op.b);
      if (gapStart > cursor) {
        result.push({ a: cursor, b: gapStart });
      }
      cursor = Math.max(cursor, gapEnd);
    }
    if (cursor < solid.b) {
      result.push({ a: cursor, b: solid.b });
    }
  }
  return result;
}

// ── parede avulsa ──

function renderFreeWall(fw: ResolvedFreeWall): string {
  const dx = fw.to.x - fw.from.x;
  const dy = fw.to.y - fw.from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return '';

  const nx = -dy / len;
  const ny = dx / len;
  const ht = fw.thickness / 2;

  const pts = [
    fw.from.x + nx * ht, fw.from.y + ny * ht,
    fw.to.x + nx * ht, fw.to.y + ny * ht,
    fw.to.x - nx * ht, fw.to.y - ny * ht,
    fw.from.x - nx * ht, fw.from.y - ny * ht,
  ];
  return `<polygon points="${pts.map(p => rnd(p)).join(',')}" class="free-wall-fill"/>`;
}

// ── janela (gap na parede + linhas de vidro) ──

function renderWindow(win: ResolvedWindow, wt: number): string {
  const parts: string[] = [];
  const isH = win.wall === 'north' || win.wall === 'south';
  const sideGap = 2;
  const hw = wt / 2;

  if (isH) {
    const y = win.start.y;
    // retângulo branco para "apagar" a parede no vão
    parts.push(`<rect x="${win.start.x + sideGap}" y="${y - hw}" width="${win.end.x - win.start.x - sideGap * 2}" height="${wt}" fill="${C.roomBg}" stroke="none"/>`);
    // linhas da janela (3 linhas paralelas)
    for (let i = -1; i <= 1; i++) {
      const yOff = y + hw * 0.6 * i;
      parts.push(`<line x1="${win.start.x}" y1="${yOff}" x2="${win.end.x}" y2="${yOff}" class="window-frame"/>`);
    }
    // conectores laterais
    parts.push(`<line x1="${win.start.x}" y1="${y - hw}" x2="${win.start.x}" y2="${y + hw}" class="window-frame"/>`);
    parts.push(`<line x1="${win.end.x}" y1="${y - hw}" x2="${win.end.x}" y2="${y + hw}" class="window-frame"/>`);
  } else {
    const x = win.start.x;
    parts.push(`<rect x="${x - hw}" y="${win.start.y + sideGap}" width="${wt}" height="${win.end.y - win.start.y - sideGap * 2}" fill="${C.roomBg}" stroke="none"/>`);
    for (let i = -1; i <= 1; i++) {
      const xOff = x + hw * 0.6 * i;
      parts.push(`<line x1="${xOff}" y1="${win.start.y}" x2="${xOff}" y2="${win.end.y}" class="window-frame"/>`);
    }
    parts.push(`<line x1="${x - hw}" y1="${win.start.y}" x2="${x + hw}" y2="${win.start.y}" class="window-frame"/>`);
    parts.push(`<line x1="${x - hw}" y1="${win.end.y}" x2="${x + hw}" y2="${win.end.y}" class="window-frame"/>`);
  }

  return parts.join('\n');
}

// ── batentes da porta (linhas perpendiculares na abertura) ──

function renderDoorJambs(door: ResolvedDoor, wt: number): string {
  const parts: string[] = [];
  const jambLen = wt * 0.5;
  const hw = wt / 2;
  const isH = door.wall === 'north' || door.wall === 'south';

  if (isH) {
    const sign = door.wall === 'north' ? -1 : 1;
    const y1 = door.start.y - hw * sign;
    const y2 = door.start.y + hw * sign;
    parts.push(`<line x1="${door.start.x}" y1="${y1}" x2="${door.start.x}" y2="${y2}" class="jamb"/>`);
    parts.push(`<line x1="${door.end.x}" y1="${y1}" x2="${door.end.x}" y2="${y2}" class="jamb"/>`);
  } else {
    const sign = door.wall === 'west' ? -1 : 1;
    const x1 = door.start.x - hw * sign;
    const x2 = door.start.x + hw * sign;
    parts.push(`<line x1="${x1}" y1="${door.start.y}" x2="${x2}" y2="${door.start.y}" class="jamb"/>`);
    parts.push(`<line x1="${x1}" y1="${door.end.y}" x2="${x2}" y2="${door.end.y}" class="jamb"/>`);
  }

  return parts.join('\n');
}

// ── painéis e arcos da porta ──

function renderDoorPanels(door: ResolvedDoor): string {
  if (door.type === 'sliding') {
    return `<line x1="${door.start.x}" y1="${door.start.y}" x2="${door.end.x}" y2="${door.end.y}" class="door-panel" stroke-dasharray="6 3"/>`;
  }

  const parts: string[] = [];
  for (const arc of door.swingArcs) {
    if (arc.r <= 0) continue;
    // painel
    parts.push(
      `<line x1="${arc.cx}" y1="${arc.cy}" x2="${arc.x2}" y2="${arc.y2}" class="door-panel"/>`
    );
    // arco
    parts.push(
      `<path d="M ${arc.x1} ${arc.y1} A ${arc.r} ${arc.r} 0 0 ${arc.sweep} ${arc.x2} ${arc.y2}" class="door-arc"/>`
    );
  }
  return parts.join('\n');
}

// ── preenchimento de cantos ──

function renderCornerFills(rooms: ResolvedRoom[], wt: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const room of rooms) {
    const corners = [
      [room.rect.x, room.rect.y],
      [room.rect.x + room.rect.width, room.rect.y],
      [room.rect.x, room.rect.y + room.rect.height],
      [room.rect.x + room.rect.width, room.rect.y + room.rect.height],
    ];
    for (const [cx, cy] of corners) {
      const key = `${rnd(cx)},${rnd(cy)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(`<rect x="${rnd(cx - wt / 2)}" y="${rnd(cy - wt / 2)}" width="${rnd(wt)}" height="${rnd(wt)}" class="wall-fill"/>`);
      }
    }
  }
  return out;
}

// ── label do cômodo ──

function renderRoomLabel(room: ResolvedRoom, scale: number): string {
  const x = room.labelPos.x;
  const y = room.labelPos.y;
  // dimensões reais em cm (rect está em px = cm * scale)
  const wCm = room.rect.width / scale;
  const hCm = room.rect.height / scale;
  const areaM2 = (wCm * hCm) / 10000;
  // só mostra área/cotas em cômodos grandes o suficiente p/ caber o texto
  const showInfo = room.rect.width > 130 && room.rect.height > 95;

  const parts = [
    `<text x="${x}" y="${showInfo ? y - 10 : y}" class="room-name">${esc(room.name)}</text>`,
  ];
  if (showInfo) {
    parts.push(`<text x="${x}" y="${y + 7}" class="room-area">${areaM2.toFixed(1)} m²</text>`);
    parts.push(`<text x="${x}" y="${y + 22}" class="room-dim">${(wCm / 100).toFixed(2)} × ${(hCm / 100).toFixed(2)} m</text>`);
  }
  return parts.join('\n');
}

// ── cota arquitetônica (linhas com ticks) ──

function renderDimension(dim: Dimension): string {
  const parts: string[] = [];
  const isH = Math.abs(dim.y2 - dim.y1) < Math.abs(dim.x2 - dim.x1);
  const tick = 7;

  // linha principal
  parts.push(`<line x1="${dim.x1}" y1="${dim.y1}" x2="${dim.x2}" y2="${dim.y2}" class="dim-line"/>`);

  // ticks (diagonais a 45°)
  if (isH) {
    // tick esquerdo: \ diagonal
    parts.push(`<line x1="${dim.x1}" y1="${dim.y1 - tick}" x2="${dim.x1}" y2="${dim.y1 + tick}" class="dim-tick"/>`);
    // tick direito: / diagonal
    parts.push(`<line x1="${dim.x2}" y1="${dim.y2 - tick}" x2="${dim.x2}" y2="${dim.y2 + tick}" class="dim-tick"/>`);
  } else {
    parts.push(`<line x1="${dim.x1 - tick}" y1="${dim.y1}" x2="${dim.x1 + tick}" y2="${dim.y1}" class="dim-tick"/>`);
    parts.push(`<line x1="${dim.x2 - tick}" y1="${dim.y2}" x2="${dim.x2 + tick}" y2="${dim.y2}" class="dim-tick"/>`);
  }

  // texto
  const mx = (dim.x1 + dim.x2) / 2;
  const my = (dim.y1 + dim.y2) / 2;
  const textOff = isH ? -14 : 14;
  const tx = isH ? mx : mx + textOff;
  const ty = isH ? my + textOff : my;

  // fundo branco atrás do texto para legibilidade
  parts.push(`<text x="${tx}" y="${ty}" class="dim-text">${esc(dim.value)}</text>`);

  return parts.join('\n');
}

// ── escada ──

function renderStair(stair: ResolvedStair): string {
  const dir = stair.direction || 'up';
  const sx = stair.x, sy = stair.y, sw = stair.width, sh = stair.height;
  const midX = sx + sw / 2, midY = sy + sh / 2;
  const parts: string[] = [];

  // fill with stair pattern
  parts.push(`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" class="stair-fill" fill="url(#stair-hatch)"/>`);

  // diagonal line
  parts.push(`<line x1="${sx}" y1="${sy}" x2="${sx + sw}" y2="${sy + sh}" stroke="#c4b5a5" stroke-width="1"/>`);

  // arrow
  let ax1: number, ay1: number, ax2: number, ay2: number;
  if (dir === 'up') {
    ax1 = midX; ay1 = sy + sh * 0.75;
    ax2 = midX; ay2 = sy + sh * 0.25;
  } else {
    ax1 = midX; ay1 = sy + sh * 0.25;
    ax2 = midX; ay2 = sy + sh * 0.75;
  }
  parts.push(`<line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" stroke="#6d5d4b" stroke-width="2" marker-end="url(#arrowhead)"/>`);

  // label
  parts.push(`<text x="${midX}" y="${midY}" class="stair-label">${dir === 'up' ? 'UP' : 'DOWN'}</text>`);

  return parts.join('\n');
}

// ── utilitários ──

function computeBounds(
  rooms: ResolvedRoom[],
  freeWalls: ResolvedFreeWall[],
  dimensions: Dimension[]
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const room of rooms) {
    minX = Math.min(minX, room.rect.x);
    minY = Math.min(minY, room.rect.y);
    maxX = Math.max(maxX, room.rect.x + room.rect.width);
    maxY = Math.max(maxY, room.rect.y + room.rect.height);
  }

  for (const fw of freeWalls) {
    minX = Math.min(minX, fw.from.x, fw.to.x);
    minY = Math.min(minY, fw.from.y, fw.to.y);
    maxX = Math.max(maxX, fw.from.x, fw.to.x);
    maxY = Math.max(maxY, fw.from.y, fw.to.y);
  }

  for (const dim of dimensions) {
    minX = Math.min(minX, dim.x1, dim.x2);
    minY = Math.min(minY, dim.y1, dim.y2);
    maxX = Math.max(maxX, dim.x1, dim.x2);
    maxY = Math.max(maxY, dim.y1, dim.y2);
  }

  return { minX, minY, maxX, maxY };
}

function rnd(n: number): number {
  return Math.round(n * 10) / 10;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
