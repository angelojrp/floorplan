// Floorplan Editor — UI sobre a engine canônica (src/)
import { render as engineRender, resolveLayout, parseFloorPlan, exportDXF as engineExportDXF } from '../../../src/index';
import { SYMBOLS, SYMBOL_CATEGORIES } from '../../shared/symbols.js';

// ═══════════════════════════════════════════════════
//  DATA MODEL
// ═══════════════════════════════════════════════════

const DEFAULT_SCALE = 2; // px per cm

let state = {
  title: '',
  rooms: [],
  symbols: [],
  floors: [{ id: 'terreo', name: 'Térreo', level: 0, rooms: [], stairs: [] }],
  activeFloor: 'terreo',
  scale: DEFAULT_SCALE,
  wallThickness: 15,
  gridSize: 50,
  selectedId: null,
  selectedIds: new Set(),
  tool: 'select',
  zoom: 1,
  panX: 0, panY: 0,
  gridVisible: true,
  showCotas: false,
  lot: { enabled: true, width: 1000, height: 1000, front: 0, back: 0, left: 0, right: 0 },
  nextId: 1,
  nextSymId: 1,
  clipboard: null,
  snapLines: [],
  layers: { rooms: true, walls: true, doors: true, windows: true, symbols: true }
};

let undoStack = [], redoStack = [];
const MAX_UNDO = 50;

function getFloor() { return state.floors.find(f => f.id === state.activeFloor) || state.floors[0]; }
function ensureRooms() { const f = getFloor(); if (!f.rooms) f.rooms = []; return f; }

function saveUndo() {
  undoStack.push(JSON.parse(JSON.stringify({ floors: state.floors, symbols: state.symbols, title: state.title, nextId: state.nextId, nextSymId: state.nextSymId, activeFloor: state.activeFloor })));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
}

function undo() { if (!undoStack.length) return; redoStack.push(JSON.parse(JSON.stringify({ floors: state.floors, symbols: state.symbols, title: state.title, nextId: state.nextId, nextSymId: state.nextSymId, activeFloor: state.activeFloor }))); const s = undoStack.pop(); state.floors = s.floors || [{ id: 'terreo', name: 'Térreo', level: 0, rooms: s.rooms || [], stairs: [] }]; state.symbols = s.symbols || []; state.title = s.title; state.nextId = s.nextId || 1; state.nextSymId = s.nextSymId || 1; state.activeFloor = s.activeFloor || 'terreo'; state.selectedId = null; render(); toast('Desfeito'); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.parse(JSON.stringify({ floors: state.floors, symbols: state.symbols, title: state.title, nextId: state.nextId, nextSymId: state.nextSymId, activeFloor: state.activeFloor }))); const s = redoStack.pop(); state.floors = s.floors || [{ id: 'terreo', name: 'Térreo', level: 0, rooms: s.rooms || [], stairs: [] }]; state.symbols = s.symbols || []; state.title = s.title; state.nextId = s.nextId || 1; state.nextSymId = s.nextSymId || 1; state.activeFloor = s.activeFloor || 'terreo'; state.selectedId = null; render(); toast('Refeito'); }

function generateId() { return 'r_' + (state.nextId++); }

// ═══════════════════════════════════════════════════
//  PALETTE
// ═══════════════════════════════════════════════════

const PALETTE = [
  { icon:'🛋️', name:'Sala Estar', w:500, h:400 },
  { icon:'🍳', name:'Cozinha', w:300, h:350 },
  { icon:'🛏️', name:'Quarto', w:350, h:350 },
  { icon:'🚿', name:'Banheiro', w:200, h:220, hatch:'diagonal' },
  { icon:'🚪', name:'Corredor', w:400, h:120 },
  { icon:'💼', name:'Escritório', w:350, h:350 },
  { icon:'🍽️', name:'Sala Jantar', w:350, h:350 },
  { icon:'🌿', name:'Varanda', w:300, h:150 },
  { icon:'🏠', name:'Hall', w:250, h:200 },
  { icon:'🧺', name:'Lavanderia', w:200, h:200 }
];

function initPalette() {
  document.getElementById('palette').innerHTML = PALETTE.map(p => `
    <div class="palette-item" draggable="true" ondragstart="onPaletteDrag(event,'${p.name}',${p.w},${p.h},'${p.hatch||''}')">
      <span class="pi-icon">${p.icon}</span>
      <span class="pi-name">${p.name}</span>
      <span class="pi-size">${p.w}×${p.h}cm</span>
    </div>
  `).join('');
}

function initSymbolPalette() {
  for (const cat of SYMBOL_CATEGORIES) {
    const el = document.getElementById(cat.id);
    if (!el) continue;
    el.innerHTML = cat.keys.map(key => {
      const s = SYMBOLS[key];
      if (!s) return '';
      return `<div class="palette-item" draggable="true" ondragstart="onSymbolDrag(event,'${key}')">
        <span class="pi-icon">${s.icon}</span>
        <span class="pi-name">${s.name}</span>
        <span class="pi-size">${s.w}×${s.h}cm</span>
      </div>`;
    }).join('');
  }
}

function onSymbolDrag(ev, type) {
  ev.dataTransfer.setData('text/plain', JSON.stringify({type}));
}

function generateSymbolId() { return 'sym_' + (state.nextSymId++); }

// ═══════════════════════════════════════════════════
//  CANVAS RENDERING
// ═══════════════════════════════════════════════════

function getSharedWalls(rooms) {
  // Maps roomId → Set of wall sides that are hidden because the adjacent room
  // already draws that wall. Only ONE side per shared boundary is suppressed
  // (the "inner" room absorbs into the "outer" room's wall) so no gap appears.
  const shared = {};
  for (const r of rooms) shared[r.id] = new Set();
  const tol = 2; // cm tolerance
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      // A east / B west → A keeps its east wall, B suppresses its west wall
      if (Math.abs((a.x + a.width) - b.x) <= tol) {
        const top = Math.max(a.y, b.y), bot = Math.min(a.y + a.height, b.y + b.height);
        if (bot > top + tol) { shared[b.id].add('west'); }
      }
      // B east / A west → B keeps its east wall, A suppresses its west wall
      if (Math.abs((b.x + b.width) - a.x) <= tol) {
        const top = Math.max(a.y, b.y), bot = Math.min(a.y + a.height, b.y + b.height);
        if (bot > top + tol) { shared[a.id].add('west'); }
      }
      // A south / B north → A keeps its south wall, B suppresses its north wall
      if (Math.abs((a.y + a.height) - b.y) <= tol) {
        const left = Math.max(a.x, b.x), right = Math.min(a.x + a.width, b.x + b.width);
        if (right > left + tol) { shared[b.id].add('north'); }
      }
      // B south / A north → B keeps its south wall, A suppresses its north wall
      if (Math.abs((b.y + b.height) - a.y) <= tol) {
        const left = Math.max(a.x, b.x), right = Math.min(a.x + a.width, b.x + b.width);
        if (right > left + tol) { shared[a.id].add('north'); }
      }
    }
  }
  return shared;
}

// True while the user is actively dragging/panning/resizing. Used to skip the
// expensive side-panel rebuilds (properties/layers/minimap/floor tabs) during
// high-frequency mousemove renders — they get a final refresh on mouseup.
function isInteracting() {
  return !!(moveState || resizeState || openingDragState || isPanning);
}

// Coalesce renders triggered by high-frequency events (drag/resize/pan) into at
// most one render per animation frame. Without this, render() runs once per
// mousemove event — far more often than the browser can paint — rebuilding the
// whole SVG each time and causing the canvas to freeze while moving a room.
let _renderScheduled = false;
function scheduleRender() {
  if (_renderScheduled) return;
  _renderScheduled = true;
  requestAnimationFrame(() => { _renderScheduled = false; render(); });
}

function render() {
  const svg = document.getElementById('canvas-svg');
  const sc = state.scale * state.zoom;
  const wt = state.wallThickness * state.scale;

  svg.innerHTML = '';
  svg.setAttribute('viewBox', `${-state.panX/state.zoom} ${-state.panY/state.zoom} ${svg.clientWidth/state.zoom} ${svg.clientHeight/state.zoom}`);

  // pattern defs for hatches
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = '<pattern id="hatch-diagonal" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#fafafa"/><line x1="0" y1="0" x2="8" y2="8" stroke="#e0e0e0" stroke-width="1"/></pattern><pattern id="hatch-cross" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#fafafa"/><line x1="0" y1="0" x2="8" y2="8" stroke="#e0e0e0" stroke-width="1"/><line x1="8" y1="0" x2="0" y2="8" stroke="#e0e0e0" stroke-width="1"/></pattern><pattern id="hatch-dots" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#fafafa"/><circle cx="3" cy="3" r="1" fill="#e0e0e0"/></pattern><pattern id="hatch-horizontal" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#fafafa"/><line x1="0" y1="3" x2="6" y2="3" stroke="#e0e0e0" stroke-width="1"/></pattern><pattern id="hatch-vertical" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#fafafa"/><line x1="3" y1="0" x2="3" y2="6" stroke="#e0e0e0" stroke-width="1"/></pattern><pattern id="stair-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><rect width="10" height="10" fill="#f5f0e8"/><line x1="0" y1="5" x2="10" y2="5" stroke="#d4c9b8" stroke-width="1.5"/></pattern><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#6d5d4b"/></marker>';
  svg.appendChild(defs);

  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    // viewBox already handles zoom + pan; group is identity
    svg.appendChild(g);

  // grid
  if (state.gridVisible) {
    const gs = state.gridSize;
    const vb = svg.viewBox.baseVal;
    for (let x = Math.floor(vb.x/gs)*gs; x < vb.x+vb.width+gs; x += gs) {
      for (let y = Math.floor(vb.y/gs)*gs; y < vb.y+vb.height+gs; y += gs) {
        const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 0.5);
        c.setAttribute('fill','#bbb'); g.appendChild(c);
      }
    }
  }

  // terreno (lot) — borda tracejada ancorada na origem (0,0); desenhada atrás da planta
  if (state.lot && state.lot.enabled) {
    const sc2 = state.scale;
    const lr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    lr.setAttribute('x', 0); lr.setAttribute('y', 0);
    lr.setAttribute('width', state.lot.width * sc2);
    lr.setAttribute('height', state.lot.height * sc2);
    lr.setAttribute('fill', '#f0f4e8');
    lr.setAttribute('stroke', '#8a9b68');
    lr.setAttribute('stroke-width', 1.5);
    lr.setAttribute('stroke-dasharray', '8 4');
    lr.setAttribute('pointer-events', 'none');
    g.appendChild(lr);

    // área edificável (terreno menos recuos) — guia tracejada laranja
    const bw = state.lot.width - state.lot.left - state.lot.right;
    const bh = state.lot.height - state.lot.front - state.lot.back;
    if (bw > 0 && bh > 0 && (state.lot.front || state.lot.back || state.lot.left || state.lot.right)) {
      const br = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      br.setAttribute('x', state.lot.left * sc2); br.setAttribute('y', state.lot.front * sc2);
      br.setAttribute('width', bw * sc2); br.setAttribute('height', bh * sc2);
      br.setAttribute('fill', 'none');
      br.setAttribute('stroke', '#d08a3e');
      br.setAttribute('stroke-width', 1);
      br.setAttribute('stroke-dasharray', '4 3');
      br.setAttribute('pointer-events', 'none');
      g.appendChild(br);
    }
  }

  // rooms — two-layer rendering: walls behind, fills/content in front
  const floor = getFloor();
  const rooms = floor.rooms || [];
  let totalArea = 0;

  // Three-layer rendering: fills (behind) → walls → content/gaps (top)
  const fillsLayer = document.createElementNS('http://www.w3.org/2000/svg','g');
  const wallsLayer = document.createElementNS('http://www.w3.org/2000/svg','g');
  const topLayer   = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.appendChild(fillsLayer);
  g.appendChild(wallsLayer);
  g.appendChild(topLayer);

  for (const room of rooms) {
    const rx = room.x * state.scale, ry = room.y * state.scale;
    const rw = room.width * state.scale, rh = room.height * state.scale;
    totalArea += room.width * room.height;

    const hw = wt / 2;
    // wall style colors
    const wallStyle = room.wallStyle || 'alvenaria';
    let wallFill, wallStroke, wallDash;
    if (wallStyle === 'drywall') { wallFill = '#dde3ea'; wallStroke = '#9aa3ae'; wallDash = null; }
    else if (wallStyle === 'vidro') { wallFill = 'rgba(147,210,240,0.6)'; wallStroke = '#70b8d4'; wallDash = '4,2'; }
    else if (wallStyle === 'divisoria') { wallFill = '#e8e0d0'; wallStroke = '#9aa3ae'; wallDash = null; }
    else { wallFill = '#c8cdd4'; wallStroke = '#9aa3ae'; wallDash = null; }

    function makeWallRect(x, y, w, h) {
      const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
      r.setAttribute('x', x); r.setAttribute('y', y);
      r.setAttribute('width', w); r.setAttribute('height', h);
      r.setAttribute('fill', wallFill);
      r.setAttribute('stroke', wallStroke);
      r.setAttribute('stroke-width', 0.5);
      if (wallDash) r.setAttribute('stroke-dasharray', wallDash);
      return r;
    }

    // Add all 4 wall rects to wallsLayer (no shared-wall suppression needed —
    // the fill rects in fillsLayer naturally cover the inner halves of adjacent walls)
    if (state.layers.walls) {
      wallsLayer.appendChild(makeWallRect(rx - hw, ry - hw, rw + wt, wt));        // north
      wallsLayer.appendChild(makeWallRect(rx - hw, ry + rh - hw, rw + wt, wt));   // south
      wallsLayer.appendChild(makeWallRect(rx - hw, ry - hw, wt, rh + wt));        // west
      wallsLayer.appendChild(makeWallRect(rx + rw - hw, ry - hw, wt, rh + wt));   // east
    }

    // Fill group goes into fillsLayer (has data-id for event handling)
    const isSelected = state.selectedIds.has(room.id);
    const group = document.createElementNS('http://www.w3.org/2000/svg','g');
    group.setAttribute('data-id', room.id);
    group.style.cursor = state.tool === 'select' ? 'move' : 'crosshair';
    if (isSelected) group.setAttribute('filter','drop-shadow(0 0 3px rgba(37,99,235,0.5))');

    // Room fill goes to fillsLayer (BEHIND walls so walls are always visible)
    {
      const fillRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      fillRect.setAttribute('x', rx); fillRect.setAttribute('y', ry);
      fillRect.setAttribute('width', rw); fillRect.setAttribute('height', rh);
      fillRect.setAttribute('fill', isSelected ? '#eff6ff' : (room.hatch && room.hatch !== 'solid' ? `url(#hatch-${room.hatch})` : '#fafafa'));
      fillRect.setAttribute('pointer-events', 'none');
      fillsLayer.appendChild(fillRect);
    }
    // Transparent hit-rect inside topLayer group (captures clicks over room interior)
    {
      const hitRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      hitRect.setAttribute('x', rx); hitRect.setAttribute('y', ry);
      hitRect.setAttribute('width', rw); hitRect.setAttribute('height', rh);
      hitRect.setAttribute('fill', 'transparent');
      hitRect.setAttribute('stroke', isSelected ? '#2563eb' : 'none');
      hitRect.setAttribute('stroke-width', isSelected ? 2 : 0);
      group.appendChild(hitRect);
    }

    // doors
    if (state.layers.doors) {
      for (let i = 0; i < (room.doors || []).length; i++) {
        const d = room.doors[i];
        const doorG = document.createElementNS('http://www.w3.org/2000/svg','g');
        const op = openingOnWall(d.wall, rx, ry, rw, rh, d.offset * state.scale, d.width * state.scale);
        const dw = (d.wall==='north'||d.wall==='south') ? op.ex - op.sx : op.ey - op.sy;
        const ar = swingArc(d, op.sx, op.sy, op.ex, op.ey, dw);
        for (const a of ar) {
          if (a.r <= 0) continue;
          const line = document.createElementNS('http://www.w3.org/2000/svg','line');
          line.setAttribute('x1', a.cx); line.setAttribute('y1', a.cy);
          line.setAttribute('x2', a.x2); line.setAttribute('y2', a.y2);
          line.setAttribute('stroke','#2d2d2d'); line.setAttribute('stroke-width',1.8);
          doorG.appendChild(line);
          const arc = document.createElementNS('http://www.w3.org/2000/svg','path');
          arc.setAttribute('d', `M${a.x1},${a.y1}A${a.r},${a.r} 0 0 ${a.sweep} ${a.x2},${a.y2}`);
          arc.setAttribute('fill','none'); arc.setAttribute('stroke','#555');
          arc.setAttribute('stroke-width',1.2); arc.setAttribute('stroke-dasharray','5 4');
          doorG.appendChild(arc);
        }
        // wall gap
        const gap = document.createElementNS('http://www.w3.org/2000/svg','rect');
        if (d.wall==='north'||d.wall==='south') {
          gap.setAttribute('x', op.sx); gap.setAttribute('y', (d.wall==='north'?ry:ry+rh)-hw);
          gap.setAttribute('width', op.ex-op.sx); gap.setAttribute('height', wt);
        } else {
          gap.setAttribute('x', (d.wall==='west'?rx:rx+rw)-hw);
          gap.setAttribute('y', op.sy); gap.setAttribute('width', wt);
          gap.setAttribute('height', op.ey-op.sy);
        }
        gap.setAttribute('fill','#fafafa'); doorG.appendChild(gap);
        // drag handle (select tool only)
        if (state.tool === 'select') {
          const hcx = (op.sx + op.ex) / 2;
          const hcy = (op.sy + op.ey) / 2;
          const handle = document.createElementNS('http://www.w3.org/2000/svg','circle');
          handle.setAttribute('cx', hcx);
          handle.setAttribute('cy', hcy);
          handle.setAttribute('r', 5 / state.zoom);
          handle.setAttribute('fill', '#3b82f6');
          handle.setAttribute('stroke', '#fff');
          handle.setAttribute('stroke-width', 1.5 / state.zoom);
          handle.style.cursor = (d.wall==='north'||d.wall==='south') ? 'ew-resize' : 'ns-resize';
          handle.addEventListener('mousedown', ev => {
            ev.stopPropagation();
            ev.preventDefault();
            hasDragged = false;
            openingDragState = { roomId: room.id, type: 'door', index: i };
          });
          doorG.appendChild(handle);
        }
        group.appendChild(doorG);
      }
    }

    // windows
    if (state.layers.windows) {
      for (let i = 0; i < (room.windows || []).length; i++) {
        const w = room.windows[i];
        const winG = document.createElementNS('http://www.w3.org/2000/svg','g');
        const op = openingOnWall(w.wall, rx, ry, rw, rh, w.offset * state.scale, w.width * state.scale);
        const gap = document.createElementNS('http://www.w3.org/2000/svg','rect');
        if (w.wall==='north'||w.wall==='south') {
          gap.setAttribute('x', op.sx); gap.setAttribute('y', (w.wall==='north'?ry:ry+rh)-hw);
          gap.setAttribute('width', op.ex-op.sx); gap.setAttribute('height', wt);
        } else {
          gap.setAttribute('x', (w.wall==='west'?rx:rx+rw)-hw);
          gap.setAttribute('y', op.sy); gap.setAttribute('width', wt);
          gap.setAttribute('height', op.ey-op.sy);
        }
        gap.setAttribute('fill','#fafafa'); winG.appendChild(gap);
        const frame = document.createElementNS('http://www.w3.org/2000/svg','rect');
        frame.setAttribute('x', gap.getAttribute('x')); frame.setAttribute('y', gap.getAttribute('y'));
        frame.setAttribute('width', gap.getAttribute('width')); frame.setAttribute('height', gap.getAttribute('height'));
        frame.setAttribute('fill','none'); frame.setAttribute('stroke','#4a90d9'); frame.setAttribute('stroke-width',1.5);
        winG.appendChild(frame);
        // drag handle (select tool only)
        if (state.tool === 'select') {
          const hcx = (op.sx + op.ex) / 2;
          const hcy = (op.sy + op.ey) / 2;
          const handle = document.createElementNS('http://www.w3.org/2000/svg','circle');
          handle.setAttribute('cx', hcx);
          handle.setAttribute('cy', hcy);
          handle.setAttribute('r', 5 / state.zoom);
          handle.setAttribute('fill', '#3b82f6');
          handle.setAttribute('stroke', '#fff');
          handle.setAttribute('stroke-width', 1.5 / state.zoom);
          handle.style.cursor = (w.wall==='north'||w.wall==='south') ? 'ew-resize' : 'ns-resize';
          handle.addEventListener('mousedown', ev => {
            ev.stopPropagation();
            ev.preventDefault();
            hasDragged = false;
            openingDragState = { roomId: room.id, type: 'window', index: i };
          });
          winG.appendChild(handle);
        }
        group.appendChild(winG);
      }
    }

    // label: nome + área (m²) + dimensões (cotas)
    if (state.layers.rooms) {
      const SVGNS = 'http://www.w3.org/2000/svg';
      const cx = rx + rw/2, cy = ry + rh/2;
      const showInfo = rw > 130 && rh > 95; // só mostra detalhes em cômodos grandes o suficiente
      const label = document.createElementNS(SVGNS,'text');
      label.setAttribute('x', cx); label.setAttribute('y', showInfo ? cy - 10 : cy);
      label.setAttribute('text-anchor','middle'); label.setAttribute('dominant-baseline','middle');
      label.setAttribute('font-size', Math.min(14, rw/20)); label.setAttribute('font-weight','600');
      label.setAttribute('fill','#1a1a2e'); label.textContent = room.name;
      group.appendChild(label);
      if (showInfo) {
        const areaM2 = (room.width * room.height / 10000).toFixed(1);
        const area = document.createElementNS(SVGNS,'text');
        area.setAttribute('x', cx); area.setAttribute('y', cy + 7);
        area.setAttribute('text-anchor','middle'); area.setAttribute('dominant-baseline','middle');
        area.setAttribute('font-size', Math.min(11, rw/26)); area.setAttribute('font-weight','500');
        area.setAttribute('fill','#4b5563'); area.textContent = `${areaM2} m²`;
        group.appendChild(area);
        // texto de dimensão — sempre visível
        const dim = document.createElementNS(SVGNS,'text');
        dim.setAttribute('x', cx); dim.setAttribute('y', cy + 21);
        dim.setAttribute('text-anchor','middle'); dim.setAttribute('dominant-baseline','middle');
        dim.setAttribute('font-size', Math.min(10, rw/30));
        dim.setAttribute('fill','#9aa3ae'); dim.textContent = `${(room.width/100).toFixed(2)} × ${(room.height/100).toFixed(2)} m`;
        group.appendChild(dim);
      }
    }

    // cotas arquitetônicas (linhas com ticks) — alternadas pela toolbar
    if (state.showCotas && rw > 70 && rh > 70) {
      drawRoomCotas(topLayer, rx, ry, rw, rh, room.width, room.height);
    }

    // resize handles (se selecionado)
    if (state.selectedId === room.id && state.tool === 'select') {
      const htypes = [
        {r:'nw', x:rx,     y:ry},
        {r:'ne', x:rx+rw,  y:ry},
        {r:'sw', x:rx,     y:ry+rh},
        {r:'se', x:rx+rw,  y:ry+rh},
        {r:'n',  x:rx+rw/2,y:ry},
        {r:'s',  x:rx+rw/2,y:ry+rh},
        {r:'w',  x:rx,     y:ry+rh/2},
        {r:'e',  x:rx+rw,  y:ry+rh/2}
      ];
      const cursors = {nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',n:'ns-resize',s:'ns-resize',w:'ew-resize',e:'ew-resize'};
      for (const {r:ht,x:hx,y:hy} of htypes) {
        const h = document.createElementNS('http://www.w3.org/2000/svg','rect');
        h.setAttribute('x', hx-4); h.setAttribute('y', hy-4);
        h.setAttribute('width',8); h.setAttribute('height',8);
        h.setAttribute('fill','#fff'); h.setAttribute('stroke','#2563eb');
        h.setAttribute('stroke-width',2); h.setAttribute('rx',1);
        h.style.cursor = cursors[ht];
        h.addEventListener('mousedown', e => { e.stopPropagation(); startResize(room.id, ht, e); });
        group.appendChild(h);
      }
    }

    topLayer.appendChild(group);
  }

  // stairs
  for (const stair of (floor.stairs || [])) {
    const sx = stair.x * state.scale, sy = stair.y * state.scale;
    const sw = stair.width * state.scale, sh = stair.height * state.scale;
    const dir = stair.direction || 'up';
    const sg = document.createElementNS('http://www.w3.org/2000/svg','g');
    sg.setAttribute('data-id', stair.id);
    sg.style.cursor = state.tool === 'select' ? 'move' : 'default';
    const isSelected = state.selectedIds.has(stair.id);
    if (isSelected) sg.setAttribute('filter','drop-shadow(0 0 3px rgba(37,99,235,0.5))');

    // fill with stair pattern
    const sr = document.createElementNS('http://www.w3.org/2000/svg','rect');
    sr.setAttribute('x', sx); sr.setAttribute('y', sy);
    sr.setAttribute('width', sw); sr.setAttribute('height', sh);
    sr.setAttribute('fill', 'url(#stair-hatch)');
    sr.setAttribute('stroke', isSelected ? '#2563eb' : '#8a7b6b');
    sr.setAttribute('stroke-width', isSelected ? 2 : 1.5);
    sg.appendChild(sr);

    // diagonal center lines
    const dline = document.createElementNS('http://www.w3.org/2000/svg','line');
    dline.setAttribute('x1', sx); dline.setAttribute('y1', sy);
    dline.setAttribute('x2', sx + sw); dline.setAttribute('y2', sy + sh);
    dline.setAttribute('stroke', '#c4b5a5'); dline.setAttribute('stroke-width', '1');
    sg.appendChild(dline);

    // arrow indicator
    const midX = sx + sw/2, midY = sy + sh/2;
    const arrowLen = Math.min(sw, sh) * 0.4;
    let ax1, ay1, ax2, ay2;
    if (dir === 'up') {
      ax1 = midX; ay1 = sy + sh * 0.75;
      ax2 = midX; ay2 = sy + sh * 0.25;
    } else {
      ax1 = midX; ay1 = sy + sh * 0.25;
      ax2 = midX; ay2 = sy + sh * 0.75;
    }
    const arrow = document.createElementNS('http://www.w3.org/2000/svg','line');
    arrow.setAttribute('x1', ax1); arrow.setAttribute('y1', ay1);
    arrow.setAttribute('x2', ax2); arrow.setAttribute('y2', ay2);
    arrow.setAttribute('stroke', '#6d5d4b'); arrow.setAttribute('stroke-width', '2');
    arrow.setAttribute('marker-end', 'url(#arrowhead)');
    sg.appendChild(arrow);

    // label
    const sl = document.createElementNS('http://www.w3.org/2000/svg','text');
    sl.setAttribute('x', midX); sl.setAttribute('y', midY);
    sl.setAttribute('text-anchor','middle'); sl.setAttribute('dominant-baseline','middle');
    sl.setAttribute('font-size','10'); sl.setAttribute('font-weight','700');
    sl.setAttribute('fill','#6d5d4b');
    sl.textContent = dir === 'up' ? 'UP' : 'DOWN';
    sg.appendChild(sl);

    g.appendChild(sg);
  }

  // symbols (overlay on floor plan)
  if (state.layers.symbols) {
    for (const sym of state.symbols) {
      const def = SYMBOLS[sym.type];
      if (!def) continue;
      const sx = sym.x * state.scale, sy = sym.y * state.scale;
      const sw = sym.w * state.scale, sh = sym.h * state.scale;
      const group = document.createElementNS('http://www.w3.org/2000/svg','g');
      group.setAttribute('data-id', sym.id);
      group.style.cursor = state.tool === 'select' ? 'move' : 'default';
      const isSelected = state.selectedIds.has(sym.id);
      if (isSelected) group.setAttribute('filter','drop-shadow(0 0 3px rgba(37,99,235,0.5))');
      const inner = document.createElementNS('http://www.w3.org/2000/svg','g');
      const scX = sw / def.w, scY = sh / def.h;
      const rot = sym.rotation ? ` rotate(${sym.rotation} ${def.w/2} ${def.h/2})` : '';
      inner.setAttribute('transform', `translate(${sx},${sy}) scale(${scX},${scY})${rot}`);
      inner.innerHTML = def.svg;
      group.appendChild(inner);
      if (isSelected) {
        const selG = document.createElementNS('http://www.w3.org/2000/svg','g');
        if (sym.rotation) {
          const cx = sx + sw / 2, cy = sy + sh / 2;
          selG.setAttribute('transform', `rotate(${sym.rotation} ${cx} ${cy})`);
        }
        const selRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
        selRect.setAttribute('x', sx - 2); selRect.setAttribute('y', sy - 2);
        selRect.setAttribute('width', sw + 4); selRect.setAttribute('height', sh + 4);
        selRect.setAttribute('fill','none'); selRect.setAttribute('stroke','#2563eb');
        selRect.setAttribute('stroke-width',1.5); selRect.setAttribute('stroke-dasharray','4 2');
        selRect.setAttribute('pointer-events','none');
        selG.appendChild(selRect);
        group.appendChild(selG);
      }
      g.appendChild(group);
    }
  }

  // status
  document.getElementById('status-rooms').textContent = `Cômodos: ${rooms.length} | Símbolos: ${state.symbols.length}`;
  document.getElementById('status-area').textContent = `Área: ${(totalArea/10000).toFixed(1)} m²`;
  document.getElementById('global-title').value = state.title;

  // canvas empty state
  const isEmpty = rooms.length === 0 && (state.symbols || []).length === 0;
  const emptyEl = document.getElementById('canvas-empty');
  if (emptyEl) emptyEl.style.display = isEmpty ? 'flex' : 'none';

  // Skip the heavy side-panel rebuilds while dragging/resizing/panning — they
  // don't change the canvas geometry and are refreshed once on mouseup.
  if (!isInteracting()) {
    renderProperties();
    renderLayers();
    updateMinimap();
    updateFloorTabs();
  }
}

function openingOnWall(wall, rx, ry, rw, rh, off, wid) {
  switch(wall) {
    case 'north': return {sx:rx+off, sy:ry, ex:rx+off+wid, ey:ry};
    case 'south': return {sx:rx+off, sy:ry+rh, ex:rx+off+wid, ey:ry+rh};
    case 'east': return {sx:rx+rw, sy:ry+off, ex:rx+rw, ey:ry+off+wid};
    case 'west': return {sx:rx, sy:ry+off, ex:rx, ey:ry+off+wid};
  }
}

function swingArc(d, sx, sy, ex, ey, dw) {
  if (d.type === 'sliding') return [];
  let ix=0, iy=0;
  switch(d.wall){case'north':iy=1;break;case'south':iy=-1;break;case'east':ix=-1;break;case'west':ix=1;break}
  const hl = d.swing === 'left';
  return [buildArc(hl?sx:ex, hl?sy:ey, dw, hl?ex:sx, hl?ey:sy, ix, iy, dw)];
}

function buildArc(cx, cy, r, clX, clY, ix, iy, id) {
  const ox=cx+ix*id, oy=cy+iy*id;
  return {cx,cy,r,x1:clX,y1:clY,x2:ox,y2:oy,sweep:(clX-cx)*(oy-cy)-(clY-cy)*(ox-cx)>0?0:1};
}

// ═══════════════════════════════════════════════════
//  INTERACTIONS
// ═══════════════════════════════════════════════════

const canvasWrap = document.getElementById('canvas-wrap');

// pan (middle mouse | alt+drag | hand tool | space+drag)
let isPanning = false, panStart = {x:0,y:0, ox:0, oy:0};
let spaceDown = false;
canvasWrap.addEventListener('mousedown', e => {
  const panTrigger = e.button === 1 || (e.button === 0 && e.altKey)
                  || (e.button === 0 && (state.tool === 'hand' || spaceDown));
  if (panTrigger) {
    e.preventDefault(); isPanning = true; hasDragged = false;
    panStart = {x:e.clientX-state.panX, y:e.clientY-state.panY, ox:e.clientX, oy:e.clientY};
    canvasWrap.classList.add('panning');
    return;
  }
});
canvasWrap.addEventListener('contextmenu', e => {
  if (isPanning) e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (isPanning) {
    state.panX = e.clientX - panStart.x; state.panY = e.clientY - panStart.y;
    if (Math.abs(e.clientX - panStart.ox) > 2 || Math.abs(e.clientY - panStart.oy) > 2) hasDragged = true;
    scheduleRender(); return;
  }
  // wall tool: track mouse for preview line
  if (state.tool === 'wall' && wallState.active) {
    const pt = svgPoint(e.clientX, e.clientY);
    wallState.mouseX = pt.x; wallState.mouseY = pt.y;
    renderPreview();
    return;
  }
  // room tool: update preview
  if (state.tool === 'room' && roomDrawState) {
    updateRoomDraw(e);
    return;
  }
  // stair tool: update preview
  if (state.tool === 'stair' && stairDrawState) {
    updateStairDraw(e);
    return;
  }
  // update coords
  const svg = document.getElementById('canvas-svg');
  if (svg) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());
    document.getElementById('status-coords').textContent = `x:${Math.round(svgPt.x/state.scale)} y:${Math.round(svgPt.y/state.scale)} cm`;
  }
});
document.addEventListener('mouseup', () => {
  const wasPanning = isPanning;
  isPanning = false; canvasWrap.classList.remove('panning');
  if (wasPanning) render(); // final full render to refresh side panels/minimap
});

// zoom
canvasWrap.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  state.zoom = Math.max(0.2, Math.min(3, state.zoom + delta));
  updateZoomLabel();
  render();
}, {passive:false});

function zoomIn() { state.zoom = Math.min(3, state.zoom + 0.15); updateZoomLabel(); render(); }
function zoomOut() { state.zoom = Math.max(0.2, state.zoom - 0.15); updateZoomLabel(); render(); }
function zoomReset() { state.zoom = 1; updateZoomLabel(); render(); }
function updateZoomLabel() {
  document.getElementById('zoom-label').textContent = Math.round(state.zoom*100)+'%';
  document.getElementById('status-zoom').textContent = 'Zoom: '+Math.round(state.zoom*100)+'%';
}

// select room
let hasDragged = false;
canvasWrap.addEventListener('click', e => {
  if (hasDragged) { hasDragged = false; return; }
  if (roomDrawState) return;

  // ── wall tool: add vertex ──
  if (state.tool === 'wall') {
    const pt = svgPoint(e.clientX, e.clientY);
    if (!wallState.active) {
      wallState.active = true;
      wallState.vertices = [pt];
    } else {
      wallState.vertices.push(pt);
    }
    renderPreview();
    return;
  }

  // ── room tool is handled via mousedown/mouseup ──
  if (state.tool === 'room') return;

  const g = e.target.closest('[data-id]');
  const elId = g ? g.getAttribute('data-id') : null;

  if (!elId) {
    if (state.tool === 'select' && !e.shiftKey) { state.selectedId = null; state.selectedIds.clear(); render(); }
    return;
  }

  // symbol click
  const sym = state.symbols.find(s => s.id === elId);
  if (sym) {
    if (state.tool === 'door' || state.tool === 'window' || state.tool === 'stair') { toast('⬜ Use esta ferramenta em paredes de cômodos'); return; }
    if (e.shiftKey) {
      if (state.selectedIds.has(sym.id)) state.selectedIds.delete(sym.id);
      else state.selectedIds.add(sym.id);
      state.selectedId = sym.id;
    } else {
      state.selectedId = sym.id;
      state.selectedIds.clear();
      state.selectedIds.add(sym.id);
    }
    render();
    return;
  }

  if (state.tool === 'door' || state.tool === 'window') {
    addOpening(elId, e);
    return;
  }

  if (e.shiftKey) {
    if (state.selectedIds.has(elId)) state.selectedIds.delete(elId);
    else state.selectedIds.add(elId);
    state.selectedId = elId;
  } else {
    state.selectedId = elId;
    state.selectedIds.clear();
    state.selectedIds.add(elId);
  }
  render();
});

// ── double-click on wall tool: finish ──
canvasWrap.addEventListener('dblclick', e => {
  if (state.tool === 'wall' && wallState.vertices.length >= 3) {
    finishWallDraw();
  }
});

let openingDragState = null; // { roomId, type:'door'|'window', index }

// move room
let moveState = null, moveOrigin = null;
canvasWrap.addEventListener('mousedown', e => {
  if (openingDragState) return; // guard: don't start room move while dragging an opening
  if (isPanning || e.button !== 0) return;
  if (e.altKey || state.tool === 'hand' || spaceDown) return; // pan is handled separately

  // ── wall tool: ignore mousedown (handled via click) ──
  if (state.tool === 'wall') return;

  // ── room tool: start draw ──
  if (state.tool === 'room') {
    startRoomDraw(e);
    hasDragged = false;
    return;
  }

  // ── stair tool: start draw ──
  if (state.tool === 'stair') {
    startStairDraw(e);
    hasDragged = false;
    return;
  }

  if (state.tool !== 'select') return;
  const g = e.target.closest('[data-id]');
  if (!g || e.target.closest('rect[fill="#fff"]')) return;
  const elId = g.getAttribute('data-id');
  const floor = getFloor();
  const room = (floor.rooms || []).find(r => r.id === elId);
  const stair = (floor.stairs || []).find(s => s.id === elId);
  const sym = state.symbols.find(s => s.id === elId);

  if (!room && !sym && !stair) return;

  hasDragged = false;
  if (!e.shiftKey && !state.selectedIds.has(elId)) {
    state.selectedId = elId; state.selectedIds.clear(); state.selectedIds.add(elId);
  }
  state.selectedId = elId;
  moveState = { ids: [elId], sx: e.clientX, sy: e.clientY, origins: {} };
  if (room) {
    for (const id of moveState.ids) {
      const r = (floor.rooms || []).find(rr => rr.id === id);
      if (r) moveState.origins[id] = { x: r.x, y: r.y };
    }
  } else if (sym) {
    moveState.origins[elId] = { x: sym.x, y: sym.y };
  } else if (stair) {
    moveState.origins[elId] = { x: stair.x, y: stair.y };
  }
  moveOrigin = { x: (room||sym||stair).x, y: (room||sym||stair).y };
  e.preventDefault();
});

let resizeState = null, resizeOrigin = null;
function startResize(roomId, handleType, e) {
  const floor = getFloor();
  const room = (floor.rooms || []).find(r => r.id === roomId);
  if (!room) return;
  hasDragged = false;
  resizeState = {
    id: roomId,
    sx: e.clientX, sy: e.clientY,
    ox: room.x, oy: room.y, ow: room.width, oh: room.height,
    handle: handleType
  };
  resizeOrigin = { x: room.x, y: room.y, w: room.width, h: room.height };
  e.preventDefault(); e.stopPropagation();
}

document.addEventListener('mousemove', e => {
  if (openingDragState) {
    const { roomId, type, index } = openingDragState;
    const floor = getFloor();
    const room = (floor.rooms || []).find(r => r.id === roomId);
    if (!room) { openingDragState = null; return; }
    const opening = (type === 'door' ? room.doors : room.windows)[index];
    if (!opening) { openingDragState = null; return; }

    // Convert mouse to SVG coordinates
    const svg = document.getElementById('canvas-svg');
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());

    const rx = room.x * state.scale, ry = room.y * state.scale;
    const wall = opening.wall;
    const isHoriz = wall === 'north' || wall === 'south';

    // Raw offset: mouse position along wall minus half opening width
    const rawOffset = isHoriz
      ? (svgPt.x - rx) / state.scale - opening.width / 2
      : (svgPt.y - ry) / state.scale - opening.width / 2;

    const wallLen = isHoriz ? room.width : room.height;
    const maxOffset = wallLen - opening.width;
    const snap = state.gridVisible ? Math.max(1, Math.round(state.gridSize / 10)) : 1;

    opening.offset = Math.round(Math.max(0, Math.min(rawOffset, maxOffset)) / snap) * snap;
    hasDragged = true;
    scheduleRender();
    return; // don't process move/resize while dragging opening
  }
  if (moveState) {
    const dx = (e.clientX - moveState.sx) / (state.scale * state.zoom);
    const dy = (e.clientY - moveState.sy) / (state.scale * state.zoom);
    const snap = state.gridVisible ? state.gridSize : 1;
    const pxDelta = Math.abs(e.clientX - moveState.sx) + Math.abs(e.clientY - moveState.sy);
    let moved = false;

    for (const id of moveState.ids) {
      const sym = state.symbols.find(s => s.id === id);
      if (sym && moveState.origins[id]) {
        let nx = Math.round(Math.max(0, moveState.origins[id].x + dx));
        let ny = Math.round(Math.max(0, moveState.origins[id].y + dy));
        if (pxDelta > 3 && (nx !== moveState.origins[id].x || ny !== moveState.origins[id].y)) { hasDragged = true; moved = true; }
        sym.x = nx; sym.y = ny;
        continue;
      }

      const floor = getFloor();
      const stair = (floor.stairs || []).find(s => s.id === id);
      if (stair && moveState.origins[id]) {
        let nx = Math.round(Math.max(0, moveState.origins[id].x + dx));
        let ny = Math.round(Math.max(0, moveState.origins[id].y + dy));
        if (pxDelta > 3 && (nx !== moveState.origins[id].x || ny !== moveState.origins[id].y)) { hasDragged = true; moved = true; }
        stair.x = nx; stair.y = ny;
        continue;
      }

      const room = (floor.rooms || []).find(r => r.id === id);
      if (!room || !moveState.origins[id]) continue;
      let nx = Math.round(Math.max(0, moveState.origins[id].x + dx) / snap) * snap;
      let ny = Math.round(Math.max(0, moveState.origins[id].y + dy) / snap) * snap;

      // smart snap: alinhar a bordas de outros cômodos
      if (state.gridVisible) {
        const threshold = 15; // px tolerance in cm
        for (const other of (floor.rooms || [])) {
          if (moveState.ids.includes(other.id)) continue;
          const edges = [
            { v: other.x, t: other.x + other.width, snap: other.x, name: 'left' },
            { v: other.x + other.width, t: other.x, snap: other.x + other.width, name: 'right' },
            { v: other.y, t: other.y + other.height, snap: other.y, name: 'top' },
            { v: other.y + other.height, t: other.y, snap: other.y + other.height, name: 'bottom' },
          ];
          for (const edge of edges) {
            // snap vertical edges
            if ((edge.name === 'left' || edge.name === 'right') && Math.abs(ny - edge.v) < threshold) {
              if (ny >= edge.v - threshold && ny <= edge.v + threshold) {
                // check horizontal overlap
                if (nx + room.width > other.x && nx < other.x + other.width) {
                  ny = edge.v;
                }
              }
            }
            // snap horizontal edges
            if ((edge.name === 'top' || edge.name === 'bottom') && Math.abs(nx - edge.v) < threshold) {
              if (nx >= edge.v - threshold && nx <= edge.v + threshold) {
                if (ny + room.height > other.y && ny < other.y + other.height) {
                  nx = edge.v;
                }
              }
            }
          }
        }
      }

      if (pxDelta > 3 && (nx !== moveState.origins[id].x || ny !== moveState.origins[id].y)) { hasDragged = true; moved = true; }
      room.x = nx; room.y = ny;
      clampRoomToLot(room);
    }
    if (moved) scheduleRender();
  }
  if (resizeState) {
    const dx = (e.clientX - resizeState.sx) / (state.scale * state.zoom);
    const dy = (e.clientY - resizeState.sy) / (state.scale * state.zoom);
    const floor = getFloor();
    const room = (floor.rooms || []).find(r => r.id === resizeState.id);
    if (!room) return;
    let {ox, oy, ow, oh} = resizeState;
    const ht = resizeState.handle;
    let nx=ox, ny=oy, nw=ow, nh=oh;
    if (ht.includes('w')) { nw = Math.max(50, ow - dx); nx = ox + ow - nw; }
    if (ht.includes('e')) { nw = Math.max(50, ow + dx); }
    if (ht.includes('n')) { nh = Math.max(50, oh - dy); ny = oy + oh - nh; }
    if (ht.includes('s')) { nh = Math.max(50, oh + dy); }
    if (nx < 0) { nw += nx; nx = 0; }
    if (ny < 0) { nh += ny; ny = 0; }
    room.x = Math.round(nx); room.y = Math.round(ny);
    room.width = Math.round(nw); room.height = Math.round(nh);
    clampRoomToLot(room);
    if (room.x !== resizeOrigin.x || room.y !== resizeOrigin.y || room.width !== resizeOrigin.w || room.height !== resizeOrigin.h) hasDragged = true;
    scheduleRender();
  }
});

document.addEventListener('mouseup', e => {
  if (openingDragState) {
    if (hasDragged) saveUndo();
    openingDragState = null;
    hasDragged = false;
    render(); // final full render to refresh side panels skipped during drag
    return;
  }
  if (moveState) { if (hasDragged) saveUndo(); moveState = null; moveOrigin = null; render(); }
  if (resizeState) { if (hasDragged) saveUndo(); resizeState = null; resizeOrigin = null; render(); }
  if (roomDrawState) {
    finishRoomDraw();
    return;
  }
  if (stairDrawState) {
    finishStairDraw();
    return;
  }
});

// palette drag to canvas
function onPaletteDrag(ev, name, w, h, hatch) {
  ev.dataTransfer.setData('text/plain', JSON.stringify({name,w,h,hatch}));
}
canvasWrap.addEventListener('dragover', e => e.preventDefault());
canvasWrap.addEventListener('drop', e => {
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('text/plain'));

  // symbol drop
  if (data.type) {
    const def = SYMBOLS[data.type];
    if (!def) return;
    saveUndo();
    const svg = document.getElementById('canvas-svg');
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());
    const x = Math.round(Math.max(0, svgPt.x / state.scale));
    const y = Math.round(Math.max(0, svgPt.y / state.scale));
    state.symbols.push({ id: generateSymbolId(), type: data.type, x, y, w: def.w, h: def.h, rotation: 0 });
    state.selectedId = state.symbols[state.symbols.length-1].id;
    state.selectedIds.clear(); state.selectedIds.add(state.selectedId);
    render();
    toast(`➕ ${def.name} adicionado`);
    return;
  }

  if (!data.name) return;
  saveUndo();
  const svg = document.getElementById('canvas-svg');
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const ctm = svg.getScreenCTM(); if (!ctm) return;
  const svgPt = pt.matrixTransform(ctm.inverse());
  const x = Math.round(Math.max(0, svgPt.x / state.scale / (state.gridVisible ? state.gridSize : 1))) * (state.gridVisible ? state.gridSize : 1);
  const y = Math.round(Math.max(0, svgPt.y / state.scale / (state.gridVisible ? state.gridSize : 1))) * (state.gridVisible ? state.gridSize : 1);
  const floor = ensureRooms();
  const newRoom = { id: generateId(), name: data.name, x, y, width: data.w, height: data.h, doors: [], windows: [], hatch: data.hatch || undefined };
  clampRoomToLot(newRoom);
  floor.rooms.push(newRoom);
  state.selectedId = floor.rooms[floor.rooms.length-1].id;
  render();
  toast(`➕ ${data.name} adicionado`);
});

// add door/window via tool
function addOpening(roomId, e) {
  const floor = getFloor();
  const room = (floor.rooms || []).find(r => r.id === roomId);
  if (!room) return;
  const svg = document.getElementById('canvas-svg');
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const ctm = svg.getScreenCTM(); if (!ctm) return;
  const p = pt.matrixTransform(ctm.inverse());
  const sc = state.scale;
  const wt = state.wallThickness * state.scale;
  const rx = room.x * sc, ry = room.y * sc, rw = room.width * sc, rh = room.height * sc;

  // find closest wall (only consider edges within reasonable proximity)
  const nearNorth = p.y >= ry - wt && p.y <= ry + wt && p.x >= rx && p.x <= rx + rw;
  const nearSouth = p.y >= ry + rh - wt && p.y <= ry + rh + wt && p.x >= rx && p.x <= rx + rw;
  const nearWest  = p.x >= rx - wt && p.x <= rx + wt && p.y >= ry && p.y <= ry + rh;
  const nearEast  = p.x >= rx + rw - wt && p.x <= rx + rw + wt && p.y >= ry && p.y <= ry + rh;

  const distNorth = nearNorth ? Math.abs(p.y - ry) : Infinity;
  const distSouth = nearSouth ? Math.abs(p.y - (ry+rh)) : Infinity;
  const distWest  = nearWest  ? Math.abs(p.x - rx) : Infinity;
  const distEast  = nearEast  ? Math.abs(p.x - (rx+rw)) : Infinity;
  const minD = Math.min(distNorth, distSouth, distWest, distEast);
  if (!isFinite(minD)) { toast('⬜ Clique em uma parede'); return; }

  let wall, offsetPx, maxLen;
  if (minD === distNorth) { wall='north'; offsetPx=p.x-rx; maxLen=rw; }
  else if (minD === distSouth) { wall='south'; offsetPx=p.x-rx; maxLen=rw; }
  else if (minD === distWest) { wall='west'; offsetPx=p.y-ry; maxLen=rh; }
  else { wall='east'; offsetPx=p.y-ry; maxLen=rh; }

  const openingW = state.tool === 'door' ? 80 : 100;
  let offsetCm = Math.round(offsetPx / sc);
  offsetCm = Math.max(0, Math.min(offsetCm, Math.round(maxLen / sc) - openingW));
  if (offsetCm < 0 || maxLen / sc < openingW) { toast('⬜ Parede muito curta'); return; }

  saveUndo();
  if (state.tool === 'door') {
    room.doors.push({ wall, offset: offsetCm, width: openingW, type: 'pivot', swing: 'left' });
    toast('🚪 Porta adicionada');
  } else {
    room.windows.push({ wall, offset: offsetCm, width: openingW, height: 120, sill: 110 });
    toast('🪟 Janela adicionada');
  }
  setTool('select');
  render();
}

// delete (multi)
function deleteSelected() {
  const ids = state.selectedIds.size > 0 ? [...state.selectedIds] : (state.selectedId ? [state.selectedId] : []);
  if (!ids.length) return;
  const roomIds = ids.filter(id => !id.startsWith('sym_') && !id.startsWith('stair_'));
  const symIds = ids.filter(id => id.startsWith('sym_'));
  const stairIds = ids.filter(id => id.startsWith('stair_'));
  saveUndo();
  const floor = getFloor();
  floor.rooms = (floor.rooms || []).filter(r => !roomIds.includes(r.id));
  state.symbols = state.symbols.filter(s => !symIds.includes(s.id));
  if (floor.stairs) floor.stairs = floor.stairs.filter(s => !stairIds.includes(s.id));
  state.selectedId = null; state.selectedIds.clear();
  render();
  const count = roomIds.length + symIds.length + stairIds.length;
  toast(`🗑 ${count} item(ns) removido(s)`);
}

// copy / paste
function copySelected() {
  const ids = state.selectedIds.size > 0 ? [...state.selectedIds] : (state.selectedId ? [state.selectedId] : []);
  if (!ids.length) return;
  const floor = getFloor();
  state.clipboard = (floor.rooms || []).filter(r => ids.includes(r.id)).map(r => ({
    ...JSON.parse(JSON.stringify(r)), id: null
  }));
  toast(`📋 ${state.clipboard.length} cômodo(s) copiado(s)`);
}

function pasteSelected() {
  if (!state.clipboard || !state.clipboard.length) { toast('📋 Nada para colar'); return; }
  saveUndo();
  const floor = ensureRooms();
  state.selectedIds.clear();
  for (const r of state.clipboard) {
    const newRoom = {...JSON.parse(JSON.stringify(r)), id: generateId(), x: r.x + 50, y: r.y + 50};
    floor.rooms.push(newRoom);
    state.selectedId = newRoom.id;
    state.selectedIds.add(newRoom.id);
  }
  render();
  toast(`📌 ${state.clipboard.length} cômodo(s) colado(s)`);
}

// align
function alignSelected(dir) {
  const ids = state.selectedIds.size > 1 ? [...state.selectedIds] : [];
  if (ids.length < 2) { toast('Selecione 2+ cômodos (Shift+click)'); return; }
  saveUndo();
  const floor = getFloor();
  const rooms = (floor.rooms || []).filter(r => ids.includes(r.id));
  switch (dir) {
    case 'left': { const minX = Math.min(...rooms.map(r => r.x)); rooms.forEach(r => r.x = minX); break; }
    case 'right': { const maxR = Math.max(...rooms.map(r => r.x + r.width)); rooms.forEach(r => r.x = maxR - r.width); break; }
    case 'top': { const minY = Math.min(...rooms.map(r => r.y)); rooms.forEach(r => r.y = minY); break; }
    case 'bottom': { const maxB = Math.max(...rooms.map(r => r.y + r.height)); rooms.forEach(r => r.y = maxB - r.height); break; }
    case 'centerX': { const avgX = rooms.reduce((s,r) => s + r.x + r.width/2, 0) / rooms.length; rooms.forEach(r => r.x = Math.round(avgX - r.width/2)); break; }
    case 'centerY': { const avgY = rooms.reduce((s,r) => s + r.y + r.height/2, 0) / rooms.length; rooms.forEach(r => r.y = Math.round(avgY - r.height/2)); break; }
  }
  render();
  toast('📐 Alinhado!');
}

document.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    spaceDown = false;
    if (state.tool !== 'hand') canvasWrap.classList.remove('hand-tool');
  }
});

document.addEventListener('keydown', e => {
  const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  const editable = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement.isContentEditable;
  if (e.code === 'Space' && !editable) { e.preventDefault(); if (!spaceDown) { spaceDown = true; canvasWrap.classList.add('hand-tool'); } return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !editable) { e.preventDefault(); deleteSelected(); }
  if ((e.ctrlKey||e.metaKey) && e.key === 'z' && !e.shiftKey && !editable) { e.preventDefault(); undo(); }
  if ((e.ctrlKey||e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z')) && !editable) { e.preventDefault(); redo(); }
  if ((e.ctrlKey||e.metaKey) && e.key === 'c' && !editable) { e.preventDefault(); copySelected(); }
  if ((e.ctrlKey||e.metaKey) && e.key === 'v' && !editable) { e.preventDefault(); pasteSelected(); }
  if (e.key === 'Escape' && !editable) {
    if (state.tool === 'wall') { cancelWallDraw(); return; }
    if (state.tool === 'room') { state.tool = 'select'; setToolUI('select'); render(); return; }
    if (state.tool === 'stair') { state.tool = 'select'; setToolUI('select'); stairDrawState = null; render(); return; }
    if (state.tool === 'door' || state.tool === 'window') { setTool('select'); render(); return; }
    state.selectedId = null; state.selectedIds.clear(); state.tool = 'select'; setToolUI('select'); render();
  }
  if (e.key === 'Enter' && !editable && state.tool === 'wall' && wallState.vertices.length >= 3) { finishWallDraw(); e.preventDefault(); }
  if (!editable) {
    if (e.key === '1') { setTool('select'); e.preventDefault(); }
    else if (e.key === '2') { setTool('wall'); e.preventDefault(); }
    else if (e.key === '3') { setTool('room'); e.preventDefault(); }
    else if (e.key === '4') { setTool('door'); e.preventDefault(); }
    else if (e.key === '5') { setTool('window'); e.preventDefault(); }
    else if (e.key === '6') { setTool('stair'); e.preventDefault(); }
    else if (e.key === '7' || e.key === 'h' || e.key === 'H') { setTool('hand'); e.preventDefault(); }
    else if (e.key === '[') { toggleSidebar(); e.preventDefault(); }
  }
});

// ═══════════════════════════════════════════════════
//  PROPERTIES PANEL
// ═══════════════════════════════════════════════════

let propsMode = 'basic'; // 'basic' | 'yaml'
let _lastPropsSelId = null;

function togglePropsMode() {
  propsMode = propsMode === 'basic' ? 'yaml' : 'basic';
  const btn = document.getElementById('btn-props-mode');
  btn.classList.toggle('active', propsMode === 'yaml');
  btn.setAttribute('data-tooltip', propsMode === 'yaml' ? 'Voltar ao modo básico' : 'Editar como YAML');
  renderProperties();
}

function getSelectedObject() {
  if (!state.selectedId) return null;
  const sym = state.symbols.find(s => s.id === state.selectedId);
  if (sym) return { type: 'symbol', obj: sym };
  const stair = (getFloor().stairs || []).find(s => s.id === state.selectedId);
  if (stair) return { type: 'stair', obj: stair };
  const room = (getFloor().rooms || []).find(r => r.id === state.selectedId);
  if (room) return { type: 'room', obj: room };
  return null;
}

function renderYAMLProps() {
  const el = document.getElementById('props-content');
  const sel = getSelectedObject();
  if (!sel) { el.innerHTML = '<div class="empty-state">Selecione um elemento</div>'; return; }

  // Serialize without id
  const { id, ...rest } = sel.obj;
  let yamlStr;
  try { yamlStr = jsyaml.dump(rest, { indent: 2, lineWidth: 120 }); } catch(e) { yamlStr = ''; }

  el.innerHTML = `
    <div class="props-yaml-wrap">
      <textarea id="props-yaml-ta" spellcheck="false" data-sel-type="${sel.type}">${escAttr(yamlStr)}</textarea>
      <div class="props-yaml-actions">
        <button class="props-yaml-apply" onclick="applyYAMLProps()">
          Aplicar <kbd style="font-size:9px;opacity:0.7;background:rgba(255,255,255,0.2);padding:1px 4px;border-radius:3px;border:none">Ctrl+↵</kbd>
        </button>
      </div>
      <div id="props-yaml-err" class="props-yaml-err"></div>
    </div>`;

  const ta = document.getElementById('props-yaml-ta');
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); applyYAMLProps(); }
    // Tab inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = s + 2;
    }
  });
  ta.addEventListener('input', () => {
    document.getElementById('props-yaml-err').textContent = '';
  });
}

function applyYAMLProps() {
  const ta = document.getElementById('props-yaml-ta');
  const errEl = document.getElementById('props-yaml-err');
  if (!ta || !errEl) return;
  let parsed;
  try {
    parsed = jsyaml.load(ta.value);
  } catch(e) {
    errEl.textContent = '⚠ YAML inválido: ' + e.message.split('\n')[0];
    return;
  }
  if (!parsed || typeof parsed !== 'object') { errEl.textContent = '⚠ Conteúdo inválido'; return; }

  const sel = getSelectedObject();
  if (!sel) return;

  // Basic validation per type
  if (sel.type === 'room') {
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) { errEl.textContent = '⚠ Campo "name" obrigatório'; return; }
    if (typeof parsed.width !== 'number' || parsed.width <= 0) { errEl.textContent = '⚠ "width" deve ser número positivo'; return; }
    if (typeof parsed.height !== 'number' || parsed.height <= 0) { errEl.textContent = '⚠ "height" deve ser número positivo'; return; }
  }

  saveUndo();
  const { id } = sel.obj; // preserve id
  Object.keys(sel.obj).forEach(k => { if (k !== 'id') delete sel.obj[k]; });
  Object.assign(sel.obj, parsed);
  sel.obj.id = id; // restore id

  errEl.textContent = '';
  errEl.style.color = 'var(--accent)';
  errEl.textContent = '✓ Aplicado';
  setTimeout(() => { if (errEl) { errEl.textContent = ''; errEl.style.color = ''; } }, 1500);
  render();
}

function renderEmptyPanel(el) {
  const lot = state.lot;
  const buildW = lot.width - lot.left - lot.right;
  const buildH = lot.height - lot.front - lot.back;
  const fits = buildW > 0 && buildH > 0;
  const scaleLabel = state.scale === 2 ? '1:50' : state.scale === 1 ? '1:100' : state.scale === 0.5 ? '1:200' : `1:${Math.round(100/state.scale)}`;
  el.innerHTML = `
    <div class="prop-group">
      <label>📋 Planta</label>
      <input value="${escAttr(state.title || '')}" placeholder="Título da planta" onchange="updateMeta('title',this.value)">
      <div class="prop-row" style="margin-top:6px">
        <div class="half"><label>Escala (px/cm)</label><input type=number min=0.2 step=0.1 value="${state.scale}" onchange="updateMeta('scale',+this.value)"></div>
        <div class="half"><label>Parede (cm)</label><input type=number min=1 step=1 value="${state.wallThickness}" onchange="updateMeta('wallThickness',+this.value)"></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">Escala aproximada: ${scaleLabel}</div>
    </div>
    <div class="prop-group">
      <label>📐 Terreno (cm)</label>
      <div class="prop-row">
        <div class="half"><label>Largura (cm)</label><input type=number min=50 step=10 value="${lot.width}" onchange="updateLotProp('width',+this.value)"></div>
        <div class="half"><label>Profundidade (cm)</label><input type=number min=50 step=10 value="${lot.height}" onchange="updateLotProp('height',+this.value)"></div>
      </div>
    </div>
    <div class="prop-group">
      <label>↔ Recuos (cm)</label>
      <div class="prop-row">
        <div class="half"><label>Frontal</label><input type=number min=0 step=10 value="${lot.front}" onchange="updateLotProp('front',+this.value)"></div>
        <div class="half"><label>Fundos</label><input type=number min=0 step=10 value="${lot.back}" onchange="updateLotProp('back',+this.value)"></div>
      </div>
      <div class="prop-row">
        <div class="half"><label>Lateral esq.</label><input type=number min=0 step=10 value="${lot.left}" onchange="updateLotProp('left',+this.value)"></div>
        <div class="half"><label>Lateral dir.</label><input type=number min=0 step=10 value="${lot.right}" onchange="updateLotProp('right',+this.value)"></div>
      </div>
    </div>
    <div class="prop-group">
      <label>Área total do terreno</label>
      <strong>${lot.width} × ${lot.height} cm (${(lot.width*lot.height/10000).toFixed(1)} m²)</strong>
    </div>
    <div class="prop-group">
      <label>Área edificável</label>
      <strong style="color:${fits ? 'var(--text)' : 'var(--danger)'}">${fits ? `${buildW} × ${buildH} cm (${(buildW*buildH/10000).toFixed(1)} m²)` : 'recuos maiores que o terreno'}</strong>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">A planta é reposicionada para o canto frontal-esquerdo e os cômodos respeitam o limite do terreno (área tracejada).</div>
    </div>`;
}

function renderProperties() {
  const el = document.getElementById('props-content');
  const modeBtn = document.getElementById('btn-props-mode');

  // Reset mode when selection changes
  if (state.selectedId !== _lastPropsSelId) {
    propsMode = 'basic';
    _lastPropsSelId = state.selectedId;
    if (modeBtn) { modeBtn.classList.remove('active'); modeBtn.setAttribute('data-tooltip','Editar como YAML'); }
  }

  // Show/hide the YAML toggle button based on whether something is selected
  const hasSelection = !!state.selectedId;
  if (modeBtn) modeBtn.style.display = hasSelection ? '' : 'none';

  // Delegate to YAML mode if active
  if (propsMode === 'yaml' && hasSelection) { renderYAMLProps(); return; }

  // nada selecionado → metadados da planta + configurações do terreno (lote)
  if (!hasSelection) { renderEmptyPanel(el); return; }

  // symbol selected
  const sym = state.symbols.find(s => s.id === state.selectedId);
  if (sym) {
    const def = SYMBOLS[sym.type];
    if (!def) { el.innerHTML = '<div class="empty-state">Símbolo não encontrado</div>'; return; }
    let html = `<div class="prop-group"><label>🪑 Símbolo</label><strong>${def.icon} ${def.name}</strong></div>`;
    html += `<div class="prop-group"><label>Dimensões (cm)</label>
      <div class="prop-row"><div class="half"><label>X</label><input type=number value="${sym.x}" onchange="updateSymbolProp('x',+this.value)"></div>
      <div class="half"><label>Y</label><input type=number value="${sym.y}" onchange="updateSymbolProp('y',+this.value)"></div></div>
      <div class="prop-row"><div class="half"><label>Largura</label><input type=number value="${sym.w}" onchange="updateSymbolProp('w',+this.value)"></div>
      <div class="half"><label>Altura</label><input type=number value="${sym.h}" onchange="updateSymbolProp('h',+this.value)"></div></div>
      <label>Rotação (°)</label><input type=number value="${sym.rotation||0}" onchange="updateSymbolProp('rotation',+this.value)">
    </div>`;
    el.innerHTML = html;
    return;
  }

  // stair selected
  const stair = (getFloor().stairs || []).find(s => s.id === state.selectedId);
  if (stair) {
    let html = `<div class="prop-group"><label>🪜 Escada</label><strong>${stair.width}×${stair.height}cm</strong></div>`;
    html += `<div class="prop-group"><label>Posição (cm)</label>
      <div class="prop-row"><div class="half"><label>X</label><input type=number value="${stair.x}" onchange="updateStairProp('x',+this.value)"></div>
      <div class="half"><label>Y</label><input type=number value="${stair.y}" onchange="updateStairProp('y',+this.value)"></div></div>
      <div class="prop-row"><div class="half"><label>Largura</label><input type=number value="${stair.width}" onchange="updateStairProp('width',+this.value)"></div>
      <div class="half"><label>Altura</label><input type=number value="${stair.height}" onchange="updateStairProp('height',+this.value)"></div></div>
    </div>`;
    html += `<div class="prop-group"><label>Direção</label>
      <select onchange="updateStairProp('direction',this.value)">
        <option value="up" ${stair.direction==='up'?'selected':''}>Up (Sobe)</option>
        <option value="down" ${stair.direction==='down'?'selected':''}>Down (Desce)</option>
      </select>
    </div>`;
    html += `<div class="prop-group"><label>Conecta ao pavimento</label>
      <select onchange="updateStairProp('connectsTo',this.value)">
        <option value="">— Nenhum —</option>
        ${state.floors.filter(f => f.id !== state.activeFloor).map(f => `<option value="${f.id}" ${stair.connectsTo===f.id?'selected':''}>${f.name}</option>`).join('')}
      </select>
    </div>`;
    el.innerHTML = html;
    return;
  }

  const room = (getFloor().rooms || []).find(r => r.id === state.selectedId);
  if (!room) { el.innerHTML = '<div class="empty-state">Selecione um cômodo no canvas</div>'; return; }

  let html = `<div class="prop-group"><label>Nome</label><input value="${escAttr(room.name)}" onchange="updateProp('name',this.value)"></div>`;
  html += `<div class="prop-group"><label>Dimensões (cm)</label><div class="prop-row"><div class="half"><label>X (cm)</label><input type=number value="${room.x}" onchange="updateProp('x',+this.value)"></div><div class="half"><label>Y (cm)</label><input type=number value="${room.y}" onchange="updateProp('y',+this.value)"></div></div><div class="prop-row"><div class="half"><label>Largura (cm)</label><input type=number value="${room.width}" onchange="updateProp('width',+this.value)"></div><div class="half"><label>Profundidade (cm)</label><input type=number value="${room.height}" onchange="updateProp('height',+this.value)"></div></div></div>`;

  // doors
  html += `<div class="prop-group"><label>🚪 Portas (${room.doors.length})</label>`;
  room.doors.forEach((d,i) => {
    html += `<div class="door-entry"><div class="del-btn" onclick="removeOpening('doors',${i})">×</div>`;
    html += `<label>Parede</label><select onchange="updateDoor(${i},'wall',this.value)"><option value=north ${d.wall==='north'?'selected':''}>Norte</option><option value=south ${d.wall==='south'?'selected':''}>Sul</option><option value=east ${d.wall==='east'?'selected':''}>Leste</option><option value=west ${d.wall==='west'?'selected':''}>Oeste</option></select>`;
    html += `<div class="prop-row"><div class="half"><label>Offset</label><input type=number value="${d.offset}" onchange="updateDoor(${i},'offset',+this.value)"></div><div class="half"><label>Largura</label><input type=number value="${d.width}" onchange="updateDoor(${i},'width',+this.value)"></div></div>`;
    html += `<select onchange="updateDoor(${i},'type',this.value)"><option value=pivot ${d.type==='pivot'?'selected':''}>Pivot</option><option value=sliding ${d.type==='sliding'?'selected':''}>Sliding</option><option value=double ${d.type==='double'?'selected':''}>Double</option></select> <select onchange="updateDoor(${i},'swing',this.value)"><option value=left ${d.swing==='left'?'selected':''}>Left</option><option value=right ${d.swing==='right'?'selected':''}>Right</option></select>`;
    html += `</div>`;
  });
  html += `<button class="add-btn" onclick="addDoor()">+ Adicionar Porta</button></div>`;

  // windows
  html += `<div class="prop-group"><label>🪟 Janelas (${room.windows.length})</label>`;
  room.windows.forEach((w,i) => {
    html += `<div class="window-entry"><div class="del-btn" onclick="removeOpening('windows',${i})">×</div>`;
    html += `<label>Parede</label><select onchange="updateWindow(${i},'wall',this.value)"><option value=north ${w.wall==='north'?'selected':''}>Norte</option><option value=south ${w.wall==='south'?'selected':''}>Sul</option><option value=east ${w.wall==='east'?'selected':''}>Leste</option><option value=west ${w.wall==='west'?'selected':''}>Oeste</option></select>`;
    html += `<div class="prop-row"><div class="half"><label>Offset</label><input type=number value="${w.offset}" onchange="updateWindow(${i},'offset',+this.value)"></div><div class="half"><label>Largura</label><input type=number value="${w.width}" onchange="updateWindow(${i},'width',+this.value)"></div></div>`;
    html += `</div>`;
  });
  html += `<button class="add-btn" onclick="addWindow()">+ Adicionar Janela</button></div>`;

  // hatch
  const hatchOptions = [
    { v:'',      l:'Nenhum (sólido)' },
    { v:'diagonal', l:'Diagonal (45°)' },
    { v:'cross', l:'Cruzado' },
    { v:'dots',  l:'Pontilhado' },
    { v:'horizontal', l:'Horizontal' },
    { v:'vertical', l:'Vertical' }
  ];
  html += `<div class="prop-group"><label>🔲 Hachura</label><select onchange="updateProp('hatch',this.value)">
    ${hatchOptions.map(o => `<option value="${o.v}" ${(room.hatch||'')===o.v?'selected':''}>${o.l}</option>`).join('')}
  </select></div>`;

  // wall style
  html += `<div class="prop-group"><label>Estilo de parede</label>
    <select onchange="updateProp('wallStyle',this.value)">
      <option value="alvenaria" ${(room.wallStyle==='alvenaria'||!room.wallStyle)?'selected':''}>Alvenaria</option>
      <option value="drywall" ${room.wallStyle==='drywall'?'selected':''}>Drywall</option>
      <option value="vidro" ${room.wallStyle==='vidro'?'selected':''}>Vidro</option>
      <option value="divisoria" ${room.wallStyle==='divisoria'?'selected':''}>Divisória</option>
    </select>
  </div>`;

  html += `<div class="prop-group"><label>Área</label><strong>${(room.width*room.height/10000).toFixed(1)} m²</strong></div>`;

  el.innerHTML = html;
}

function updateProp(prop, val) {
  const room = (getFloor().rooms || []).find(r => r.id === state.selectedId);
  if (!room) return;
  saveUndo();
  room[prop] = (val === '' && prop === 'hatch') ? undefined : val;
  clampRoomToLot(room);
  render();
}

function updateSymbolProp(prop, val) {
  const sym = state.symbols.find(s => s.id === state.selectedId);
  if (!sym) return;
  saveUndo();
  sym[prop] = val;
  render();
}

function updateStairProp(prop, val) {
  const floor = getFloor();
  const stair = (floor.stairs || []).find(s => s.id === state.selectedId);
  if (!stair) return;
  saveUndo();
  stair[prop] = val;
  render();
}

function renderLayers() {
  const LAYERS = [
    { key:'rooms',   icon:'<rect x="2" y="3" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>', label:'Cômodos' },
    { key:'walls',   icon:'<line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="2"/>', label:'Paredes' },
    { key:'doors',   icon:'<path d="M3 9V3h5a3 3 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>', label:'Portas' },
    { key:'windows', icon:'<rect x="2" y="4" width="8" height="4" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="6" y1="4" x2="6" y2="8" stroke="currentColor" stroke-width="1.2"/>', label:'Janelas' },
    { key:'symbols', icon:'<circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="6" y1="3" x2="6" y2="6" stroke="currentColor" stroke-width="1.2"/>', label:'Símbolos' },
  ];
  const el = document.getElementById('layers-list');
  if (!el) return;
  el.innerHTML = LAYERS.map(l => `
    <div class="layer-row">
      <button class="layer-eye ${state.layers[l.key]?'active':''}" onclick="toggleLayer('${l.key}')" title="${state.layers[l.key]?'Ocultar':'Mostrar'} ${l.label}">
        <svg width="14" height="12" viewBox="0 0 12 12" fill="none">${state.layers[l.key]
          ? `<path d="M1 6s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" stroke="currentColor" stroke-width="1.2"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/>`
          : `<path d="M1 6s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2,1"/><line x1="2" y1="10" x2="10" y2="2" stroke="currentColor" stroke-width="1.2"/>`
        }</svg>
      </button>
      <svg width="14" height="12" viewBox="0 0 12 12" fill="none" style="color:var(--text3)">${l.icon}</svg>
      <span class="layer-label">${l.label}</span>
    </div>
  `).join('');
}

function toggleLayer(key) {
  state.layers[key] = !state.layers[key];
  render();
}

function updateDoor(idx, prop, val) {
  const room = (getFloor().rooms || []).find(r => r.id === state.selectedId);
  if (!room) return;
  saveUndo();
  room.doors[idx][prop] = val;
  render();
}

function updateWindow(idx, prop, val) {
  const room = (getFloor().rooms || []).find(r => r.id === state.selectedId);
  if (!room) return;
  saveUndo();
  room.windows[idx][prop] = val;
  render();
}

function addDoor() {
  const room = (getFloor().rooms || []).find(r => r.id === state.selectedId);
  if (!room) return;
  saveUndo();
  room.doors.push({wall:'south', offset:Math.round(room.width/2-40), width:80, type:'pivot', swing:'left'});
  render();
}

function addWindow() {
  const room = (getFloor().rooms || []).find(r => r.id === state.selectedId);
  if (!room) return;
  saveUndo();
  room.windows.push({wall:'north', offset:Math.round(room.width/2-50), width:100, height:120, sill:110});
  render();
}

function removeOpening(type, idx) {
  const room = (getFloor().rooms || []).find(r => r.id === state.selectedId);
  if (!room) return;
  saveUndo();
  room[type].splice(idx, 1);
  render();
}

// ═══════════════════════════════════════════════════
//  TOOLS & ACTIONS
// ═══════════════════════════════════════════════════

function setTool(tool) {
  state.tool = tool;
  setToolUI(tool);
  if (tool === 'wall') {
    wallState.vertices = [];
    wallState.active = false;
    canvasWrap.classList.add('wall-tool');
    canvasWrap.classList.remove('room-tool','stair-tool');
    document.getElementById('wall-hint').style.display = 'block';
    renderPreview();
  } else if (tool === 'room') {
    canvasWrap.classList.add('room-tool');
    canvasWrap.classList.remove('wall-tool','stair-tool');
    document.getElementById('wall-hint').style.display = 'none';
    renderPreview();
  } else if (tool === 'stair') {
    canvasWrap.classList.add('stair-tool');
    canvasWrap.classList.remove('wall-tool','room-tool');
    document.getElementById('wall-hint').style.display = 'none';
    renderPreview();
  } else if (tool === 'hand') {
    canvasWrap.classList.add('hand-tool');
    canvasWrap.classList.remove('wall-tool','room-tool','stair-tool');
    document.getElementById('wall-hint').style.display = 'none';
    wallState.vertices = []; wallState.active = false;
    roomDrawState = null; stairDrawState = null;
    renderPreview(); renderRoomPreview();
  } else {
    canvasWrap.classList.remove('wall-tool','room-tool','stair-tool','hand-tool');
    document.getElementById('wall-hint').style.display = 'none';
    wallState.vertices = []; wallState.active = false;
    roomDrawState = null;
    stairDrawState = null;
    renderPreview();
    renderRoomPreview();
  }
  render();
}

function setToolUI(tool) {
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tool-' + tool);
  if (btn) btn.classList.add('active');
}

// ═══════════════════════════════════════════════════
//  FLOOR MANAGEMENT
// ═══════════════════════════════════════════════════

function switchFloor(id) {
  state.activeFloor = id;
  state.selectedId = null;
  state.selectedIds.clear();
  render();
}

function addFloor() {
  const existingNames = state.floors.map(f => f.name);
  let num = state.floors.length + 1;
  let name = `Pavimento ${num}`;
  while (existingNames.includes(name)) { num++; name = `Pavimento ${num}`; }
  const id = 'floor' + (state.floors.length + 1);
  saveUndo();
  state.floors.push({ id, name, level: state.floors.length, rooms: [], stairs: [] });
  state.activeFloor = id;
  render();
  toast(`🏢 ${name} adicionado`);
}

function removeFloor(id) {
  if (state.floors.length <= 1) { toast('É necessário ao menos 1 pavimento'); return; }
  saveUndo();
  state.floors = state.floors.filter(f => f.id !== id);
  state.activeFloor = state.floors[0].id;
  state.selectedId = null; state.selectedIds.clear();
  render();
  toast('🏢 Pavimento removido');
}

function updateFloorTabs() {
  const el = document.getElementById('floor-tab-list');
  if (!el) return;
  el.innerHTML = state.floors.map(f => `
    <span class="floor-tab${f.id === state.activeFloor ? ' active' : ''}" onclick="switchFloor('${f.id}')">
      🏠 ${f.name}
      ${state.floors.length > 1 ? `<span class="floor-del" onclick="event.stopPropagation();removeFloor('${f.id}')" title="Remover pavimento">×</span>` : ''}
    </span>
  `).join('');
}

// ═══════════════════════════════════════════════════
//  STAIR DRAWING TOOL (click-drag)
// ═══════════════════════════════════════════════════

let stairDrawState = null;

function startStairDraw(e) {
  const pt = svgPoint(e.clientX, e.clientY);
  stairDrawState = { sx: pt.x, sy: pt.y, ex: pt.x, ey: pt.y };
}

function updateStairDraw(e) {
  if (!stairDrawState) return;
  const pt = svgPoint(e.clientX, e.clientY);
  stairDrawState.ex = pt.x; stairDrawState.ey = pt.y;
  renderStairPreview();
}

function finishStairDraw() {
  if (!stairDrawState) return;
  let x1 = stairDrawState.sx, y1 = stairDrawState.sy;
  let x2 = stairDrawState.ex, y2 = stairDrawState.ey;
  const sc = state.scale;
  let cmX = Math.round(Math.min(x1, x2) / sc);
  let cmY = Math.round(Math.min(y1, y2) / sc);
  let cmW = Math.round(Math.abs(x2 - x1) / sc);
  let cmH = Math.round(Math.abs(y2 - y1) / sc);
  if (cmW < 20 || cmH < 20) { stairDrawState = null; render(); return; }
  saveUndo();
  const floor = ensureRooms();
  floor.stairs.push({ id: 'stair_' + (state.nextId++), x: cmX, y: cmY, width: cmW, height: cmH, direction: 'up', connectsTo: '' });
  stairDrawState = null;
  setTool('select');
  render();
  toast(`🪜 Escada adicionada (${cmW}×${cmH}cm)`);
}

function renderStairPreview() {
  const svg = document.getElementById('canvas-svg');
  svg.querySelectorAll('.stair-preview-layer').forEach(el => el.remove());
  if (!stairDrawState) return;
  const pg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  pg.classList.add('stair-preview-layer');
  const x = Math.min(stairDrawState.sx, stairDrawState.ex);
  const y = Math.min(stairDrawState.sy, stairDrawState.ey);
  const w = Math.abs(stairDrawState.ex - stairDrawState.sx);
  const h = Math.abs(stairDrawState.ey - stairDrawState.sy);
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x); rect.setAttribute('y', y);
  rect.setAttribute('width', w); rect.setAttribute('height', h);
  rect.setAttribute('class', 'stair-preview');
  pg.appendChild(rect);
  const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  lbl.setAttribute('x', x + w/2); lbl.setAttribute('y', y + h/2);
  lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('dominant-baseline', 'middle');
  lbl.setAttribute('font-size', '11'); lbl.setAttribute('fill', '#666'); lbl.setAttribute('font-weight', '600');
  lbl.textContent = 'UP';
  pg.appendChild(lbl);
  svg.appendChild(pg);
}

// ═══════════════════════════════════════════════════
//  WALL DRAWING TOOL
// ═══════════════════════════════════════════════════

let wallState = { vertices: [], active: false, mouseX: 0, mouseY: 0 };

function cancelWallDraw() {
  wallState.vertices = []; wallState.active = false;
  setTool('select'); toast('Parede cancelada');
}

function finishWallDraw() {
  if (wallState.vertices.length < 3) return;
  // compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of wallState.vertices) {
    minX = Math.min(minX, v.x); minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y);
  }
  const x = Math.round(minX / state.scale);
  const y = Math.round(minY / state.scale);
  const w = Math.round((maxX - minX) / state.scale);
  const h = Math.round((maxY - minY) / state.scale);

  saveUndo();
  const floor = ensureRooms();
  floor.rooms.push({
    id: generateId(), name: 'Parede', x, y, width: w, height: h, doors: [], windows: [], hatch: undefined
  });
  wallState.vertices = []; wallState.active = false;
  setTool('select');
  render();
  toast(`🧱 Cômodo criado (${w}×${h}cm)`);
}

function renderPreview() {
  const svg = document.getElementById('canvas-svg');
  // remove previous preview elements
  svg.querySelectorAll('.preview-layer').forEach(el => el.remove());

  if (state.tool !== 'wall' || wallState.vertices.length === 0) return;

  const pg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  pg.classList.add('preview-layer');

  // draw vertices as blue dots
  for (const v of wallState.vertices) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', v.x); dot.setAttribute('cy', v.y);
    dot.setAttribute('r', 4); dot.setAttribute('class', 'wall-vertex');
    pg.appendChild(dot);
  }

  // draw segments between vertices
  if (wallState.vertices.length >= 2) {
    let d = '';
    for (let i = 0; i < wallState.vertices.length; i++) {
      d += (i === 0 ? 'M' : 'L') + wallState.vertices[i].x + ',' + wallState.vertices[i].y + ' ';
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'wall-preview-segment');
    path.setAttribute('fill', 'none');
    pg.appendChild(path);
  }

  // dashed preview line from last vertex to mouse
  const lastV = wallState.vertices[wallState.vertices.length - 1];
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', lastV.x); line.setAttribute('y1', lastV.y);
  line.setAttribute('x2', wallState.mouseX); line.setAttribute('y2', wallState.mouseY);
  line.setAttribute('class', 'wall-preview-line');
  pg.appendChild(line);

  svg.appendChild(pg);
}

// ═══════════════════════════════════════════════════
//  ROOM DRAWING TOOL (click-drag)
// ═══════════════════════════════════════════════════

let roomDrawState = null;

function startRoomDraw(e) {
  const pt = svgPoint(e.clientX, e.clientY);
  roomDrawState = { sx: pt.x, sy: pt.y, ex: pt.x, ey: pt.y };
}

function updateRoomDraw(e) {
  if (!roomDrawState) return;
  const pt = svgPoint(e.clientX, e.clientY);
  roomDrawState.ex = pt.x; roomDrawState.ey = pt.y;
  renderRoomPreview();
}

function finishRoomDraw() {
  if (!roomDrawState) return;
  let x1 = roomDrawState.sx, y1 = roomDrawState.sy;
  let x2 = roomDrawState.ex, y2 = roomDrawState.ey;

  const sc = state.scale;
  let cmX = Math.round(Math.min(x1, x2) / sc);
  let cmY = Math.round(Math.min(y1, y2) / sc);
  let cmW = Math.round(Math.abs(x2 - x1) / sc);
  let cmH = Math.round(Math.abs(y2 - y1) / sc);

  if (cmW < 30 || cmH < 30) { roomDrawState = null; render(); return; }

  saveUndo();
  const floor = ensureRooms();
  const newRoom = { id: generateId(), name: 'Cômodo', x: cmX, y: cmY, width: cmW, height: cmH, doors: [], windows: [], hatch: undefined };
  clampRoomToLot(newRoom);
  floor.rooms.push(newRoom);
  roomDrawState = null;
  setTool('select');
  render();
  toast(`⬜ Cômodo criado (${cmW}×${cmH}cm)`);
}

function renderRoomPreview() {
  const svg = document.getElementById('canvas-svg');
  svg.querySelectorAll('.room-preview-layer').forEach(el => el.remove());
  if (!roomDrawState) return;

  const pg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  pg.classList.add('room-preview-layer');

  const x = Math.min(roomDrawState.sx, roomDrawState.ex);
  const y = Math.min(roomDrawState.sy, roomDrawState.ey);
  const w = Math.abs(roomDrawState.ex - roomDrawState.sx);
  const h = Math.abs(roomDrawState.ey - roomDrawState.sy);

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x); rect.setAttribute('y', y);
  rect.setAttribute('width', w); rect.setAttribute('height', h);
  rect.setAttribute('class', 'room-preview');
  pg.appendChild(rect);

  // size label
  const sc = state.scale;
  const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  lbl.setAttribute('x', x + w/2); lbl.setAttribute('y', y + h/2);
  lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('dominant-baseline', 'middle');
  lbl.setAttribute('font-size', '11'); lbl.setAttribute('fill', '#2563eb'); lbl.setAttribute('font-weight', '600');
  lbl.textContent = Math.round(w/sc) + '×' + Math.round(h/sc) + 'cm';
  pg.appendChild(lbl);

  svg.appendChild(pg);
}

function svgPoint(cx, cy) {
  const svg = document.getElementById('canvas-svg');
  const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
  const ctm = svg.getScreenCTM(); if (!ctm) return {x:0, y:0};
  return pt.matrixTransform(ctm.inverse());
}

// ═══════════════════════════════════════════════════
//  CONTEXT MENU
// ═══════════════════════════════════════════════════

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
}

canvasWrap.addEventListener('contextmenu', e => {
  if (state.tool === 'wall' || state.tool === 'room' || state.tool === 'stair') return;
  e.preventDefault();
  const menu = document.getElementById('context-menu');
  menu.style.display = 'block';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
});

document.addEventListener('click', e => {
  if (!e.target.closest('#context-menu')) hideContextMenu();
});

// ═══════════════════════════════════════════════════
//  SHORTCUTS PANEL
// ═══════════════════════════════════════════════════

function toggleShortcuts() {
  const overlay = document.getElementById('shortcuts-overlay');
  overlay.classList.toggle('show');
}

function hideShortcuts() {
  document.getElementById('shortcuts-overlay').classList.remove('show');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideShortcuts();
});

// ═══════════════════════════════════════════════════
//  PALETTE FILTER
// ═══════════════════════════════════════════════════

function filterPalette() {
  const q = document.getElementById('palette-search').value.toLowerCase();
  const items = document.querySelectorAll('.palette-item');
  items.forEach(item => {
    const name = item.querySelector('.pi-name').textContent.toLowerCase();
    item.style.display = name.includes(q) ? '' : 'none';
  });
}

function toggleGrid() {
  state.gridVisible = !state.gridVisible;
  document.getElementById('btn-grid').classList.toggle('active', state.gridVisible);
  render();
}
function toggleCotas() {
  state.showCotas = !state.showCotas;
  document.getElementById('btn-cotas').classList.toggle('active', state.showCotas);
  render();
}
// Cotas arquitetônicas de um cômodo (largura no topo, altura à esquerda) com ticks.
function drawRoomCotas(layer, rx, ry, rw, rh, wCm, hCm) {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const COL = '#b71c1c', inset = 30, pad = 10, tick = 5;
  const line = (x1, y1, x2, y2, w) => {
    const l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', COL); l.setAttribute('stroke-width', w || 0.8); l.setAttribute('pointer-events', 'none');
    layer.appendChild(l);
  };
  const txt = (x, y, t, rot) => {
    const e = document.createElementNS(SVGNS, 'text');
    e.setAttribute('x', x); e.setAttribute('y', y); e.setAttribute('text-anchor', 'middle'); e.setAttribute('dominant-baseline', 'middle');
    e.setAttribute('font-size', 9); e.setAttribute('fill', COL); e.setAttribute('pointer-events', 'none');
    if (rot) e.setAttribute('transform', `rotate(${rot} ${x} ${y})`);
    e.textContent = t; layer.appendChild(e);
  };
  // largura — linha horizontal afastada do topo; valor do lado interno (abaixo da linha)
  const wy = ry + inset;
  line(rx + pad, wy, rx + rw - pad, wy);
  line(rx + pad, wy - tick, rx + pad, wy + tick);
  line(rx + rw - pad, wy - tick, rx + rw - pad, wy + tick);
  txt(rx + rw / 2, wy + 9, `${(wCm / 100).toFixed(2)} m`);
  // altura — linha vertical afastada da esquerda; valor do lado interno (à direita da linha)
  const hx = rx + inset;
  line(hx, ry + pad, hx, ry + rh - pad);
  line(hx - tick, ry + pad, hx + tick, ry + pad);
  line(hx - tick, ry + rh - pad, hx + tick, ry + rh - pad);
  txt(hx + 9, ry + rh / 2, `${(hCm / 100).toFixed(2)} m`, -90);
}
function setGridSize(val) {
  state.gridSize = Math.max(10, Math.min(1000, val || state.gridSize));
  document.getElementById('grid-step').value = state.gridSize;
  render();
}
function updateLotProp(key, val) {
  state.lot[key] = Math.max(key === 'width' || key === 'height' ? 50 : 0, val || 0);
  repositionPlanToSetbacks();
  clampAllRoomsToLot();
  render();
}
// Edição de metadados da planta (título, escala, espessura de parede)
function updateMeta(key, val) {
  if (key === 'title') {
    state.title = val;
    const t = document.getElementById('global-title'); if (t) t.value = val;
    document.getElementById('file-name').textContent = '🏠 ' + (val || 'Sem título');
  } else if (key === 'scale') {
    state.scale = Math.max(0.2, val || DEFAULT_SCALE);
  } else if (key === 'wallThickness') {
    state.wallThickness = Math.max(1, val || 15);
  } else if (key === 'gridSize') {
    state.gridSize = Math.max(10, Math.min(1000, val || state.gridSize));
    document.getElementById('grid-step').value = state.gridSize;
  }
  render();
}
// Move a planta (todos os pavimentos/escadas/símbolos) para respeitar os recuos:
// o canto superior-esquerdo da planta passa a coincidir com (recuo esquerdo, recuo frontal).
function repositionPlanToSetbacks() {
  let minX = Infinity, minY = Infinity;
  for (const f of state.floors) for (const r of (f.rooms || [])) { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); }
  if (!isFinite(minX)) return; // nenhum cômodo
  const dx = state.lot.left - minX, dy = state.lot.front - minY;
  if (dx === 0 && dy === 0) return;
  for (const f of state.floors) {
    for (const r of (f.rooms || [])) { r.x += dx; r.y += dy; }
    for (const s of (f.stairs || [])) { s.x += dx; s.y += dy; }
  }
  for (const sym of state.symbols) { sym.x += dx; sym.y += dy; }
}
// Garante que um cômodo respeite o limite do terreno (não ultrapasse a borda).
function clampRoomToLot(room) {
  if (!state.lot) return;
  const W = state.lot.width, H = state.lot.height;
  room.width = Math.min(room.width, W);
  room.height = Math.min(room.height, H);
  room.x = Math.max(0, Math.min(room.x, W - room.width));
  room.y = Math.max(0, Math.min(room.y, H - room.height));
}
function clampAllRoomsToLot() {
  for (const f of state.floors) for (const r of (f.rooms || [])) clampRoomToLot(r);
}
// Cresce o terreno (se necessário) para envolver toda a planta — usado ao carregar.
function ensureLotEnclosesPlan() {
  let maxX = 0, maxY = 0;
  for (const f of state.floors) for (const r of (f.rooms || [])) { maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height); }
  state.lot.width = Math.max(state.lot.width, maxX + (state.lot.right || 0));
  state.lot.height = Math.max(state.lot.height, maxY + (state.lot.back || 0));
}
function updateTitle() { state.title = document.getElementById('global-title').value; render(); }

function newProject() {
  if ((getFloor().rooms || []).length && !confirm('Criar novo projeto? Alterações não salvas serão perdidas.')) return;
  state = {...state, title:'', floors:[{ id: 'terreo', name: 'Térreo', level: 0, rooms: [], stairs: [] }], activeFloor:'terreo', symbols:[], selectedId:null, zoom:1, panX:0, panY:0, nextId:1, lot:{ enabled:true, width:1000, height:1000, front:0, back:0, left:0, right:0 }};
  undoStack=[]; redoStack=[];
  document.getElementById('file-name').textContent = '🌳 Sem título';
  render();
}

// ═══════════════════════════════════════════════════
//  IMPORT / EXPORT
// ═══════════════════════════════════════════════════

function loadYAMLString(text, titleHint) {
  const raw = jsyaml.load(text);
  state.title = raw.title || titleHint || '';
  state.scale = raw.scale || DEFAULT_SCALE;
  state.wallThickness = raw.wallThickness || 15;
  state.gridSize = raw.grid || 100;
  state.gridVisible = raw.grid !== false;
  state.lot = raw.lot
    ? { enabled: true, width: raw.lot.width || 1000, height: raw.lot.height || 1000,
        front: raw.lot.front || 0, back: raw.lot.back || 0, left: raw.lot.left || 0, right: raw.lot.right || 0 }
    : { enabled: true, width: 1000, height: 1000, front: 0, back: 0, left: 0, right: 0 };

  if (raw.floors) {
    state.floors = raw.floors.map(f => ({
      id: f.id || 'floor_' + (state.nextId++),
      name: f.name || 'Pavimento',
      level: f.level || 0,
      rooms: (f.rooms || []).map(r => ({
        id: generateId(), name: r.name || 'Cômodo', x: r.x||0, y: r.y||0,
        width: r.width||300, height: r.height||300,
        doors: (r.doors||[]).map(d => ({...d, type:d.type||'pivot', swing:d.swing||'left'})),
        windows: r.windows || [],
        hatch: r.hatch
      })),
      stairs: (f.stairs || []).map(s => ({
        id: 'stair_' + (state.nextId++), x: s.x||0, y: s.y||0,
        width: s.width||100, height: s.height||250,
        direction: s.direction||'up', connectsTo: s.connectsTo||''
      }))
    }));
  } else if (raw.rooms) {
    state.floors = [{
      id: 'terreo', name: 'Térreo', level: 0,
      rooms: raw.rooms.map(r => ({
        id: generateId(), name: r.name || 'Cômodo', x: r.x||0, y: r.y||0,
        width: r.width||300, height: r.height||300,
        doors: (r.doors||[]).map(d => ({...d, type:d.type||'pivot', swing:d.swing||'left'})),
        windows: r.windows || [],
        hatch: r.hatch
      })),
      stairs: []
    }];
  }
  state.activeFloor = state.floors[0].id;
  undoStack=[]; redoStack=[]; state.selectedId=null;
  document.getElementById('file-name').textContent = '📂 ' + (state.title || 'Planta');
  document.getElementById('global-title').value = state.title;
  document.getElementById('grid-step').value = state.gridSize;
  document.getElementById('btn-grid').classList.toggle('active', state.gridVisible);
  ensureLotEnclosesPlan();
  render();
}

function importYAML() {
  const input = document.createElement('input'); input.type='file'; input.accept='.yaml,.yml';
  input.onchange = async e => {
    const text = await e.target.files[0].text();
    try {
      loadYAMLString(text, e.target.files[0].name);
      toast('📥 Projeto carregado!');
    } catch(err) { toast('❌ Erro: '+err.message); }
  };
  input.click();
}

function toggleExportMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('export-menu');
  const isOpen = menu.classList.toggle('open');
  if (isOpen) {
    setTimeout(() => document.addEventListener('click', closeExportMenu, {once:true}), 0);
  }
}
function closeExportMenu() {
  document.getElementById('export-menu').classList.remove('open');
}

function exportYAML() {
  const out = {
    version: 1, title: state.title || 'Planta Baixa',
    scale: state.scale, wallThickness: state.wallThickness,
    grid: state.gridVisible ? state.gridSize : false,
    lot: state.lot.enabled ? {
      width: state.lot.width, height: state.lot.height,
      front: state.lot.front || undefined, back: state.lot.back || undefined,
      left: state.lot.left || undefined, right: state.lot.right || undefined
    } : undefined,
    floors: state.floors.map(f => ({
      id: f.id, name: f.name, level: f.level,
      rooms: (f.rooms || []).map(r => ({
        id: r.id, name: r.name, x: r.x, y: r.y, width: r.width, height: r.height,
        hatch: r.hatch || undefined,
        doors: r.doors.length ? r.doors.map(d => ({wall:d.wall,offset:d.offset,width:d.width,type:d.type,swing:d.swing})) : undefined,
        windows: r.windows.length ? r.windows : undefined
      })),
      stairs: (f.stairs || []).length ? f.stairs.map(s => ({id:s.id,x:s.x,y:s.y,width:s.width,height:s.height,direction:s.direction,connectsTo:s.connectsTo||undefined})) : undefined
    })),
    symbols: state.symbols.length ? state.symbols.map(s => ({id:s.id,type:s.type,x:s.x,y:s.y,w:s.w,h:s.h,rotation:s.rotation||0})) : undefined
  };
  downloadFile('planta.yaml', jsyaml.dump(out, {lineWidth:-1, noCompatMode:true}), 'text/yaml');
  toast('📤 YAML exportado!');
}

function exportSVG() {
  const floor = getFloor();
  const rooms = floor.rooms || [];
  const yaml = jsyaml.dump({
    version:1, title:state.title||'Planta Baixa', scale:state.scale,
    wallThickness:state.wallThickness, grid:state.gridVisible?state.gridSize:false,
    lot: state.lot.enabled ? { width: state.lot.width, height: state.lot.height } : undefined,
    rooms: rooms.map(r => ({
      id:r.id, name:r.name, x:r.x, y:r.y, width:r.width, height:r.height,
      hatch: r.hatch || undefined,
      doors: r.doors.length ? r.doors : undefined,
      windows: r.windows.length ? r.windows : undefined
    }))
  }, {lineWidth:-1, noCompatMode:true});

  let svgStr = engineRender(yaml);

  // append symbols
  if (state.symbols.length) {
    let symSvg = '';
    for (const sym of state.symbols) {
      const def = SYMBOLS[sym.type];
      if (!def) continue;
      const sx = sym.x * state.scale, sy = sym.y * state.scale;
      const scX = sym.w * state.scale / def.w, scY = sym.h * state.scale / def.h;
      const rot = sym.rotation ? ` rotate(${sym.rotation} ${def.w/2} ${def.h/2})` : '';
      symSvg += `<g transform="translate(${sx},${sy}) scale(${scX},${scY})${rot}">${def.svg}</g>`;
    }
    svgStr = svgStr.replace('</svg>', symSvg + '</svg>');
  }

  downloadFile('planta.svg', svgStr, 'image/svg+xml');
  toast('⬇ SVG exportado!');
}

function exportDXF() {
  const floor = getFloor();
  const rooms = floor.rooms || [];
  const yaml = jsyaml.dump({
    version:1, title:state.title||'Planta Baixa', scale:state.scale,
    wallThickness:state.wallThickness, grid:state.gridVisible?state.gridSize:false,
    rooms: rooms.map(r => ({
      id:r.id, name:r.name, x:r.x, y:r.y, width:r.width, height:r.height,
      hatch: r.hatch || undefined,
      doors: r.doors.length ? r.doors : undefined,
      windows: r.windows.length ? r.windows : undefined
    }))
  }, {lineWidth:-1, noCompatMode:true});

  const dxfStr = engineExportDXF(resolveLayout(parseFloorPlan(yaml)));
  downloadFile('planta.dxf', dxfStr, 'application/dxf');
  toast('📐 DXF exportado!');
}

function calculateTotalArea() {
  let total = 0;
  for (const f of state.floors) {
    for (const r of (f.rooms || [])) { total += r.width * r.height; }
  }
  return (total / 10000).toFixed(1);
}

// ── Template library ──
(async function initTemplates() {
  const sel = document.getElementById('template-select');
  try {
    const res = await fetch('/templates/index.json');
    if (!res.ok) return;
    const list = await res.json();
    list.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.file;
      opt.textContent = t.name;
      opt.title = t.description || '';
      sel.appendChild(opt);
    });
  } catch(e) { /* silently ignore if running offline */ }
})();

async function loadTemplateFromSelect(sel) {
  const file = sel.value;
  if (!file) return;
  sel.value = '';  // reset to placeholder
  try {
    const res = await fetch('/templates/' + file);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    saveUndo();
    loadYAMLString(text, file.replace('.yaml',''));
    toast('📐 Template carregado!');
  } catch(e) {
    toast('❌ Erro ao carregar template: ' + e.message);
  }
}

function showPrintModal() { document.getElementById('print-modal').classList.add('show'); }
function hidePrintModal() { document.getElementById('print-modal').classList.remove('show'); }

function showPasteModal() {
  document.getElementById('paste-yaml-input').value = '';
  document.getElementById('paste-modal').classList.add('show');
  setTimeout(() => document.getElementById('paste-yaml-input').focus(), 50);
}
function hidePasteModal() { document.getElementById('paste-modal').classList.remove('show'); }
function applyPastedYAML() {
  const text = document.getElementById('paste-yaml-input').value.trim();
  if (!text) { toast('⚠️ Cole um YAML válido'); return; }
  try {
    saveUndo();
    loadYAMLString(text);
    hidePasteModal();
    toast('📐 Planta carregada!');
  } catch(e) { toast('❌ YAML inválido: ' + e.message); }
}
document.getElementById('paste-yaml-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyPastedYAML(); }
});

function doPrint() {
  hidePrintModal();
  const scaleN = parseInt(document.getElementById('print-scale').value);
  const paper = document.getElementById('print-paper').value;
  exportPDF(scaleN, paper);
}

function exportPDF(printScale=100, paper='a4l') {
  const svgEl = document.querySelector('#canvas-svg');
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  const svg = clone.outerHTML;
  const escS = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const paperCSS = paper === 'a4p' ? 'A4 portrait' : paper === 'a3l' ? 'A3 landscape' : 'A4 landscape';
  const scaleLabel = `1:${printScale}`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escS(state.title || 'Planta Baixa')}</title>
<style>
  @page { size: ${paperCSS}; margin: 15mm; }
  body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }
  .page { page-break-after: always; padding: 20px; }
  .title-block { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; }
  .title-block h1 { font-size: 24px; margin: 0; }
  .stamp { font-size: 9px; color: #666; text-align: right; }
  .stamp table { border-collapse: collapse; margin-left: auto; }
  .stamp td { padding: 2px 8px; border: 1px solid #ccc; font-size: 9px; }
  .floor-plan { text-align: center; margin: 20px 0; }
  .floor-plan svg { max-width: 100%; height: auto; }
  .legend { margin-top: 20px; font-size: 10px; }
  .scale-bar { margin: 10px 0; text-align: center; font-size: 10px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="page">
    <div class="title-block">
      <div><h1>${escS(state.title || 'Planta Baixa')}</h1><p>Escala: ${scaleLabel} | Data: ${new Date().toLocaleDateString('pt-BR')}</p></div>
      <div class="stamp">
        <table>
          <tr><td>Projeto:</td><td>${escS(state.title || 'Planta')}</td></tr>
          <tr><td>Escala:</td><td>${scaleLabel}</td></tr>
          <tr><td>Papel:</td><td>${paperCSS}</td></tr>
          <tr><td>Data:</td><td>${new Date().toLocaleDateString('pt-BR')}</td></tr>
          <tr><td>&Aacute;rea:</td><td>${calculateTotalArea()} m&sup2;</td></tr>
          <tr><td>Gerado por:</td><td>Floorplan</td></tr>
        </table>
      </div>
    </div>
    <div class="floor-plan">${svg}</div>
    <div class="legend">
      <strong>Legenda:</strong> ${(getFloor().rooms||[]).map(r => escS(r.name)).join(' | ') || 'Nenhum c&ocirc;modo'}
    </div>
    <div class="scale-bar">&block;&block;&block;&block;&block; 5m &block;&block;&block;&block;&block;</div>
  </div>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

function exportPNG() {
  const svgEl = document.querySelector('#canvas-svg');
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  // o SVG do canvas não tem namespace nem dimensões explícitas — necessários
  // para rasterizar via <img> (sem isso o Image dispara onerror).
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = svgEl.viewBox.baseVal;
  const w = Math.round(vb && vb.width ? vb.width : svgEl.clientWidth || 800);
  const h = Math.round(vb && vb.height ? vb.height : svgEl.clientHeight || 600);
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  const svg = clone.outerHTML;
  const img = new Image();
  const blob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'planta.png';
    a.click();
    toast('🖼️ PNG exportado!');
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Erro ao exportar PNG'); };
  img.src = url;
}

function rnd(n){return Math.round(n*10)/10}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function escAttr(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

// ═══════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════

function downloadFile(name, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name; a.click();
  URL.revokeObjectURL(url);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── theme toggle ──
function toggleTheme() {
  document.body.classList.toggle('dark');
  toast(document.body.classList.contains('dark') ? '🌙 Modo escuro' : '☀️ Modo claro');
}

function toggleSidebar() {
  const panel = document.getElementById('left-panel');
  const collapsed = panel.classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  document.getElementById('btn-sidebar').setAttribute('data-tooltip',
    collapsed ? 'Mostrar painel ( [ )' : 'Ocultar painel ( [ )');
  setTimeout(render, 230);
}

// ── mini-map ──
function updateMinimap() {
  const mm = document.getElementById('minimap-svg');
  if (!mm) return;
  const rooms = getFloor().rooms || [];
  if (!rooms.length) { mm.innerHTML = ''; return; }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const r of rooms) {
    minX=Math.min(minX,r.x);minY=Math.min(minY,r.y);
    maxX=Math.max(maxX,r.x+r.width);maxY=Math.max(maxY,r.y+r.height);
  }
  const pad = 50, vw=maxX-minX+pad*2, vh=maxY-minY+pad*2;
  mm.setAttribute('viewBox',`${minX-pad} ${minY-pad} ${vw} ${vh}`);
  mm.innerHTML = rooms.map(r =>
    `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="#bbb" stroke="#999" stroke-width="1" rx="2"/>`
  ).join('');
  // viewport indicator
  const svg = document.getElementById('canvas-svg');
  if (svg) {
    const vb = svg.viewBox.baseVal;
    mm.innerHTML += `<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" class="viewport"/>`;
  }
}

function focusMinimap(e) {
  const mm = document.getElementById('minimap-svg');
  if (!mm) return;
  const rect = mm.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const vb = mm.viewBox.baseVal;
  const svg = document.getElementById('canvas-svg');
  if (svg && vb) {
    const cvb = svg.viewBox.baseVal;
    state.panX = (vb.x + x * vb.width - cvb.width/2) * state.zoom;
    state.panY = (vb.y + y * vb.height - cvb.height/2) * state.zoom;
  }
}

// ── distance indicator ──
function calcDist(a, b) {
  return Math.round(Math.sqrt((a.x+a.width/2 - (b.x+b.width/2))**2 + (a.y+a.height/2 - (b.y+b.height/2))**2));
}

// ── touch support ──
let touchState = null;
canvasWrap.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    touchState = { dist: Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY), zoom: state.zoom };
  }
}, {passive: false});
canvasWrap.addEventListener('touchmove', e => {
  if (touchState && e.touches.length === 2) {
    e.preventDefault();
    const newDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    state.zoom = Math.max(0.2, Math.min(3, touchState.zoom * (newDist / touchState.dist)));
    updateZoomLabel(); render();
  }
}, {passive: false});
canvasWrap.addEventListener('touchend', () => { touchState = null; });

// auto-save
const EDITOR_LS_KEY = 'floorplan-editor-state';
let autoSaveTimeout;
function autoSave() {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    try {
      const data = { title: state.title, floors: state.floors, activeFloor: state.activeFloor, symbols: state.symbols, scale: state.scale, wallThickness: state.wallThickness, gridSize: state.gridSize, gridVisible: state.gridVisible, showCotas: state.showCotas, lot: state.lot, nextId: state.nextId, nextSymId: state.nextSymId };
      localStorage.setItem(EDITOR_LS_KEY, JSON.stringify(data));
    } catch(e) {}
  }, 1000);
}

function loadAutoSave() {
  try {
    const raw = localStorage.getItem(EDITOR_LS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.title = data.title || '';
      state.floors = data.floors || [{ id: 'terreo', name: 'Térreo', level: 0, rooms: data.rooms || [], stairs: [] }];
      // migrate old format
      if (!data.floors && data.rooms) {
        state.floors = [{ id: 'terreo', name: 'Térreo', level: 0, rooms: data.rooms, stairs: [] }];
      }
      state.activeFloor = data.activeFloor || state.floors[0].id;
      state.scale = data.scale || DEFAULT_SCALE;
      state.wallThickness = data.wallThickness || 15;
      state.gridSize = data.gridSize || 100;
      state.gridVisible = data.gridVisible !== false;
      state.showCotas = !!data.showCotas;
      const cBtn = document.getElementById('btn-cotas'); if (cBtn) cBtn.classList.toggle('active', state.showCotas);
      state.lot = data.lot && typeof data.lot === 'object'
        ? { enabled: true, width: data.lot.width || 1000, height: data.lot.height || 1000,
            front: data.lot.front || 0, back: data.lot.back || 0, left: data.lot.left || 0, right: data.lot.right || 0 }
        : { enabled: true, width: 1000, height: 1000, front: 0, back: 0, left: 0, right: 0 };
      state.nextId = data.nextId || 1;
      state.nextSymId = data.nextSymId || 1;
      state.symbols = data.symbols || [];
      document.getElementById('global-title').value = state.title;
      ensureLotEnclosesPlan();
      return true;
    }
  } catch(e) {}
  return false;
}

// hook auto-save into render
const _origRender = render;
render = function() {
  _origRender();
  autoSave();
  // restore wall/room/stair previews after render clears SVG
  if (state.tool === 'wall') renderPreview();
  if (state.tool === 'room') renderRoomPreview();
  if (state.tool === 'stair') renderStairPreview();
};

// init
initPalette();
initSymbolPalette();
document.getElementById('btn-grid').classList.toggle('active', state.gridVisible);
document.getElementById('grid-step').value = state.gridSize;
// Priority: ?yaml= URL param > localStorage template > autosave > default
const _defaultRoom = () => state.floors[0].rooms.push({ id: generateId(), name: 'Sala', x: 50, y: 50, width: 500, height: 400, doors: [{wall:'south',offset:210,width:80,type:'pivot',swing:'left'}], windows: [{wall:'north',offset:100,width:200,height:120,sill:110}] });
const _urlYaml = new URLSearchParams(window.location.search).get('yaml');
if (_urlYaml) {
  try {
    const decoded = decodeURIComponent(escape(atob(_urlYaml)));
    loadYAMLString(decoded);
    toast('📐 Planta carregada do link!');
    history.replaceState({}, '', window.location.pathname);
  } catch(e) {
    toast('❌ Link inválido: ' + e.message);
    loadAutoSave() || _defaultRoom();
  }
} else {
  const _templateYaml = localStorage.getItem('floorplan-load-template');
  if (_templateYaml) {
    localStorage.removeItem('floorplan-load-template');
    try { loadYAMLString(_templateYaml); toast('📐 Template carregado!'); }
    catch(e) { loadAutoSave() || _defaultRoom(); }
  } else if (!loadAutoSave()) {
    _defaultRoom();
  }
}
render();

// expõe handlers referenciados em atributos on* do HTML
Object.assign(window, {
  addDoor, addFloor, addWindow, alignSelected, applyPastedYAML, applyYAMLProps, closeExportMenu, copySelected, deleteSelected, doPrint, exportDXF, exportPNG, exportSVG, exportYAML, filterPalette, focusMinimap, hideContextMenu, hidePasteModal, hidePrintModal, hideShortcuts, importYAML, loadTemplateFromSelect, newProject, onPaletteDrag, onSymbolDrag, pasteSelected, redo, removeFloor, removeOpening, setGridSize, setTool, showPasteModal, showPrintModal, switchFloor, toggleCotas, updateLotProp, updateMeta, toggleExportMenu, toggleGrid, toggleLayer, togglePropsMode, toggleShortcuts, toggleSidebar, toggleTheme, undo, updateDoor, updateProp, updateStairProp, updateSymbolProp, updateTitle, updateWindow, zoomIn, zoomOut, zoomReset,
});
