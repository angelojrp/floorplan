// Floorplan Playground — UI sobre a engine canônica (src/)
import { render, parseFloorPlan } from '../../src/index';
import { EXAMPLES } from './examples.js';

// ── helpers ──
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Parse inline YAML compacto (props separadas por ';' → indentação real)
function expandExample(yaml) {
  return yaml.split('\n').map(line => {
    const semiIdx = line.indexOf(';');
    if (semiIdx < 0) return line;
    const leading = line.match(/^(\s*)/)[1];
    const isListItem = /^\s*- /.test(line);
    const restIndent = isListItem ? leading + '  ' : leading;
    const parts = line.split(/;\s*/);
    return parts[0] + '\n' + parts.slice(1).map(p => restIndent + p).join('\n');
  }).join('\n');
}

// Gera o SVG a partir do YAML usando a engine canônica.
function renderFloorplan(yamlStr) {
  return render(expandExample(yamlStr));
}

// ── editor ──
const editor = CodeMirror(document.getElementById('editor-wrap'), {
  value: '', mode: 'yaml', theme: 'material-darker', lineNumbers: true,
  tabSize: 2, indentUnit: 2, indentWithTabs: false, lineWrapping: false,
  extraKeys: { 'Ctrl-Space': 'autocomplete' },
});
let currentExample = 'apartamento', renderTimeout, showGrid = true, zoomLevel = 1, editorValid = true;

// ── YAML autocomplete / hints ──
const TOP_KEYS = ['version:', 'title:', 'scale:', 'wallThickness:', 'grid:', 'lot:', 'floors:', 'rooms:', 'walls:'];
const ROOM_PROPS = ['id:', 'name:', 'x:', 'y:', 'width:', 'height:', 'doors:', 'windows:', 'hatch:'];
const DOOR_PROPS = ['wall:', 'offset:', 'width:', 'type:', 'swing:'];
const WIN_PROPS = ['wall:', 'offset:', 'width:', 'height:', 'sill:'];
const STAIR_PROPS = ['id:', 'x:', 'y:', 'width:', 'height:', 'direction:', 'connectsTo:'];
const FLOOR_PROPS = ['id:', 'name:', 'level:', 'rooms:', 'stairs:'];
const WALL_DIRS = ['north', 'south', 'east', 'west'];
const DOOR_TYPES = ['pivot', 'sliding', 'double'];
const SWING = ['left', 'right', 'none'];

function floorplanHint(cm) {
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line) || '';
  const token = cm.getTokenAt(cursor);
  const curWord = token.string;
  const linePre = line.slice(0, cursor.ch).trimEnd();
  const indent = line.match(/^(\s*)/)[1].length;
  const allText = cm.getValue();
  const textBefore = allText.slice(0, cm.indexFromPos(cursor));

  let suggestions = [];

  if (indent <= 2 && !linePre.includes(':')) {
    suggestions = suggestions.concat(TOP_KEYS);
  }

  const hasFloors = allText.includes('\nfloors:');
  if (hasFloors) {
    if (indent === 2 && /^\s*- /.test(line)) {
      suggestions = suggestions.concat(['- id:']);
    }
    if (indent === 4 && !/^\s*- /.test(line)) {
      const lastFloorIdx = textBefore.lastIndexOf('\n  - id:');
      const lastTopKey = Math.max(textBefore.lastIndexOf('\nfloors:'), textBefore.lastIndexOf('\nrooms:'), textBefore.lastIndexOf('\nlot:'));
      if (lastFloorIdx > lastTopKey) {
        suggestions = suggestions.concat(FLOOR_PROPS);
      }
    }
    if (indent === 6 && /^\s*- /.test(line)) {
      const sectionBefore = textBefore;
      const lastStairs = sectionBefore.lastIndexOf('\n    stairs:');
      const lastRooms = sectionBefore.lastIndexOf('\n    rooms:');
      if (lastStairs > lastRooms) {
        suggestions = suggestions.concat(['- id:']);
      }
    }
    if (indent >= 8 && !/^\s*- /.test(line)) {
      const sectionBefore = textBefore;
      const lastStairs = sectionBefore.lastIndexOf('\n    stairs:');
      const lastRooms = sectionBefore.lastIndexOf('\n    rooms:');
      if (lastStairs > lastRooms) {
        suggestions = suggestions.concat(STAIR_PROPS);
      }
    }
  }

  if (allText.includes('\nrooms:')) {
    if (indent === 2 && /^\s*- /.test(line)) {
      suggestions = suggestions.concat(['- id:']);
    }
    if (indent >= 2) {
      const lastRoomIdx = textBefore.lastIndexOf('\n  - id:');
      const lastTopKey = Math.max(
        textBefore.lastIndexOf('\nrooms:'),
        textBefore.lastIndexOf('\nlot:'),
        textBefore.lastIndexOf('\nwalls:'),
        textBefore.lastIndexOf('\nfloors:'),
      );
      if (lastRoomIdx > lastTopKey) {
        if (indent === 4 && !/^\s*- /.test(line)) {
          suggestions = suggestions.concat(ROOM_PROPS);
        }
        if (indent >= 6) {
          const sectionBefore = textBefore.slice(lastRoomIdx);
          const inDoors = sectionBefore.lastIndexOf('\n    doors:') > sectionBefore.lastIndexOf('\n    windows:');
          if (/^\s*- wall/.test(linePre)) { suggestions = suggestions.concat(WALL_DIRS); }
          else if (/type:/.test(line)) { suggestions = suggestions.concat(DOOR_TYPES); }
          else if (/swing:/.test(line)) { suggestions = suggestions.concat(SWING); }
          else if (/^\s*- /.test(line) || indent === 6) {
            suggestions = suggestions.concat(inDoors ? DOOR_PROPS : WIN_PROPS);
          }
        }
      }
    }
  }

  if (textBefore.includes('\nlot:') && indent >= 2) {
    const lastLot = textBefore.lastIndexOf('\nlot:');
    const lastOther = Math.max(textBefore.lastIndexOf('\nrooms:'), textBefore.lastIndexOf('\nwalls:'));
    if (lastLot > lastOther) {
      suggestions = suggestions.concat(['width:', 'height:']);
    }
  }

  const filtered = curWord ? suggestions.filter(s => s.toLowerCase().startsWith(curWord.toLowerCase())) : suggestions;
  if (!filtered.length) return { list: [], from: cursor, to: cursor };
  return {
    list: filtered,
    from: CodeMirror.Pos(cursor.line, cursor.ch - curWord.length),
    to: CodeMirror.Pos(cursor.line, cursor.ch),
  };
}

editor.on('inputRead', (cm, change) => {
  if (change.text && change.text[0] === '-') { cm.showHint({ hint: floorplanHint, completeSingle: false }); return; }
});
CodeMirror.commands.autocomplete = function(cm) { cm.showHint({ hint: floorplanHint, completeSingle: false }); };

editor.on('cursorActivity', updateStatusLine);
function updateStatusLine() {
  const pos = editor.getCursor();
  const posEl = document.querySelector('#status-line .status-pos');
  if (posEl) posEl.textContent = `Ln ${pos.line + 1}, Col ${pos.ch + 1}`;
}

function loadExample(name) {
  currentExample = name;
  document.querySelectorAll('.example-card').forEach(c => c.classList.toggle('active', c.dataset.example === name));
  const yaml = EXAMPLES[name];
  if (yaml) editor.setValue(yaml);
  document.getElementById('file-name').textContent = document.querySelector(`[data-example="${name}"] .ex-title`).textContent;
  saveHash();
  doRender();
}

// ── linting UI (avisos) — não faz parte da engine ──
function validateFloorplan(input) {
  const warnings = [];
  let rooms;
  if (input.floors) {
    rooms = [];
    for (const f of input.floors) {
      for (const r of (f.rooms || [])) rooms.push(r);
    }
  } else {
    rooms = input.rooms || [];
  }

  for (const room of rooms) {
    for (const door of (room.doors || [])) {
      const wallLen = (door.wall === 'north' || door.wall === 'south') ? room.width : room.height;
      if (door.offset + door.width > wallLen) {
        warnings.push(`🚪 Porta no cômodo '${room.name}' parede ${door.wall}: offset+width (${door.offset + door.width}cm) excede a parede (${wallLen}cm). Sugestão: reduzir offset ou width.`);
      }
    }
  }

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
        warnings.push(`⚠️ Cômodos '${a.name}' e '${b.name}' estão sobrepostos. Ajuste x/y.`);
      }
    }
  }

  const adj = {};
  for (const r of rooms) adj[r.id] = { internalWalls: new Set(), sharedWith: [] };

  const tol = 1;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (Math.abs(a.x + a.width - b.x) < tol) {
        const oS = Math.max(a.y, b.y), oE = Math.min(a.y + a.height, b.y + b.height);
        if (oE > oS) {
          adj[a.id].internalWalls.add('east'); adj[a.id].sharedWith.push({ wall: 'east', roomId: b.id, otherWall: 'west' });
          adj[b.id].internalWalls.add('west'); adj[b.id].sharedWith.push({ wall: 'west', roomId: a.id, otherWall: 'east' });
        }
      }
      if (Math.abs(a.x - (b.x + b.width)) < tol) {
        const oS = Math.max(a.y, b.y), oE = Math.min(a.y + a.height, b.y + b.height);
        if (oE > oS) {
          adj[a.id].internalWalls.add('west'); adj[a.id].sharedWith.push({ wall: 'west', roomId: b.id, otherWall: 'east' });
          adj[b.id].internalWalls.add('east'); adj[b.id].sharedWith.push({ wall: 'east', roomId: a.id, otherWall: 'west' });
        }
      }
      if (Math.abs(a.y + a.height - b.y) < tol) {
        const oS = Math.max(a.x, b.x), oE = Math.min(a.x + a.width, b.x + b.width);
        if (oE > oS) {
          adj[a.id].internalWalls.add('south'); adj[a.id].sharedWith.push({ wall: 'south', roomId: b.id, otherWall: 'north' });
          adj[b.id].internalWalls.add('north'); adj[b.id].sharedWith.push({ wall: 'north', roomId: a.id, otherWall: 'south' });
        }
      }
      if (Math.abs(a.y - (b.y + b.height)) < tol) {
        const oS = Math.max(a.x, b.x), oE = Math.min(a.x + a.width, b.x + b.width);
        if (oE > oS) {
          adj[a.id].internalWalls.add('north'); adj[a.id].sharedWith.push({ wall: 'north', roomId: b.id, otherWall: 'south' });
          adj[b.id].internalWalls.add('south'); adj[b.id].sharedWith.push({ wall: 'south', roomId: a.id, otherWall: 'north' });
        }
      }
    }
  }

  for (const room of rooms) {
    const roomAdj = adj[room.id];
    for (const win of (room.windows || [])) {
      if (roomAdj.internalWalls.has(win.wall)) {
        warnings.push(`🪟 Janela no cômodo '${room.name}' parede ${win.wall} está em parede interna.`);
      }
    }
  }

  for (const room of rooms) {
    const roomAdj = adj[room.id];
    for (const door of (room.doors || [])) {
      for (const sw of roomAdj.sharedWith) {
        if (sw.wall === door.wall) {
          const otherRoom = rooms.find(r => r.id === sw.roomId);
          if (otherRoom && !(otherRoom.doors || []).some(d => d.wall === sw.otherWall)) {
            warnings.push(`🚪 Porta no cômodo '${room.name}' parede ${door.wall} sem correspondência em '${otherRoom.name}' (parede ${sw.otherWall}).`);
          }
        }
      }
    }
  }

  return warnings;
}

function doRender() {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => {
    for (let i = 0; i < editor.lineCount(); i++) {
      editor.removeLineClass(i, 'background', 'line-error');
    }
    try {
      let yaml = editor.getValue();
      if (!showGrid) {
        const lines = yaml.split('\n'), idx = lines.findIndex(l => /^\s*grid:/.test(l));
        if (idx >= 0) lines[idx] = 'grid: false'; else lines.splice(1, 0, 'grid: false');
        yaml = lines.join('\n');
      }
      const expanded = expandExample(yaml);
      const input = parseFloorPlan(expanded);
      const warnings = validateFloorplan(input);
      const svg = render(expanded);
      const wrap = document.getElementById('preview-pane');
      wrap.innerHTML = svg + document.getElementById('zoom-controls').outerHTML;
      applyZoom();
      const errorBar = document.getElementById('error-bar');
      errorBar.classList.remove('show', 'warning');
      if (warnings.length > 0) {
        errorBar.textContent = warnings.join('\n');
        errorBar.classList.add('show', 'warning');
      }
      editorValid = true;
      const validEl = document.querySelector('#status-line .status-valid');
      const errEl = document.querySelector('#status-line .status-error');
      if (validEl) validEl.style.display = '';
      if (errEl) errEl.style.display = 'none';
    } catch (e) {
      document.getElementById('error-bar').textContent = '⚠ ' + e.message;
      document.getElementById('error-bar').classList.add('show');
      const lineMatch = e.message.match(/at line (\d+)/);
      if (lineMatch && lineMatch[1]) {
        const ln = parseInt(lineMatch[1]) - 1;
        if (ln >= 0 && ln < editor.lineCount()) editor.addLineClass(ln, 'background', 'line-error');
      }
      const wrap = document.getElementById('preview-pane');
      wrap.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><div style="color:var(--text);max-width:400px;word-break:break-word">${esc(e.message)}</div></div>` + document.getElementById('zoom-controls').outerHTML;
      editorValid = false;
      const validEl = document.querySelector('#status-line .status-valid');
      const errEl = document.querySelector('#status-line .status-error');
      if (validEl) validEl.style.display = 'none';
      if (errEl) errEl.style.display = '';
    }
  }, 200);
}

// ── auto-save ──
const LS_KEY = 'floorplan-yaml';
let saveIndicatorTimeout;
function saveToLocalStorage() {
  try { localStorage.setItem(LS_KEY, editor.getValue()); } catch (e) {}
  const el = document.querySelector('#status-line .status-saved');
  if (el) { el.classList.add('visible'); clearTimeout(saveIndicatorTimeout); saveIndicatorTimeout = setTimeout(() => el.classList.remove('visible'), 1500); }
}

editor.on('change', () => { saveHash(); saveToLocalStorage(); doRender(); });

// ── zoom ──
function applyZoom() {
  const svg = document.querySelector('#preview-pane svg');
  if (svg) svg.style.transform = `scale(${zoomLevel})`;
  document.getElementById('zoom-level').textContent = Math.round(zoomLevel * 100) + '%';
}
window.zoomIn = () => { zoomLevel = Math.min(3, zoomLevel + 0.1); applyZoom(); };
window.zoomOut = () => { zoomLevel = Math.max(0.2, zoomLevel - 0.1); applyZoom(); };
window.zoomReset = () => { zoomLevel = 1; applyZoom(); };

// ── resize ──
const handle = document.getElementById('resize-handle'), editorPane = document.getElementById('editor-pane');
let resizing = false;
handle.addEventListener('mousedown', e => { resizing = true; e.preventDefault(); });
document.addEventListener('mousemove', e => {
  if (!resizing) return;
  const isMobile = window.innerWidth <= 768;
  if (isMobile) { editorPane.style.height = Math.max(150, Math.min(e.clientY, window.innerHeight - 150)) + 'px'; }
  else { editorPane.style.width = Math.max(250, Math.min(e.clientX - (document.getElementById('sidebar').classList.contains('collapsed') ? 0 : 280), window.innerWidth - 300)) + 'px'; }
  editor.refresh();
});
document.addEventListener('mouseup', () => { resizing = false; });

window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('collapsed');
window.toggleGrid = () => { showGrid = !showGrid; document.getElementById('btn-grid').style.opacity = showGrid ? '1' : '0.5'; doRender(); };
window.toggleTheme = () => { document.body.classList.toggle('dark'); document.body.style.background = document.body.classList.contains('dark') ? 'var(--bg)' : ''; };

// ── quick action snippets ──
window.insertSnippet = function(type) {
  const cursor = editor.getCursor();
  let snippet = '';
  switch (type) {
    case 'room':
      snippet = '  - id: comodo\n    name: Novo Cômodo\n    x: 0\n    y: 0\n    width: 400\n    height: 300\n    doors:\n      - wall: south; offset: 160; width: 80; type: pivot; swing: left\n    windows:\n      - wall: north; offset: 100; width: 150; height: 120; sill: 110\n';
      break;
    case 'door':
      snippet = '      - wall: south; offset: 100; width: 80; type: pivot; swing: left\n';
      break;
    case 'window':
      snippet = '      - wall: north; offset: 80; width: 120; height: 120; sill: 110\n';
      break;
    case 'lot':
      snippet = 'lot:\n  width: 2000\n  height: 1500\n';
      break;
    case 'floor':
      snippet = '  - id: pav1\n    name: Novo Pavimento\n    level: 1\n    rooms:\n      - id: comodo\n        name: Novo Cômodo\n        x: 0\n        y: 0\n        width: 400\n        height: 300\n        doors:\n          - wall: south; offset: 160; width: 80; type: pivot; swing: left\n        windows:\n          - wall: north; offset: 100; width: 150; height: 120; sill: 110\n    stairs:\n      - id: escada\n        x: 500\n        y: 200\n        width: 100\n        height: 300\n        direction: up\n        connectsTo: terreo\n';
      break;
    case 'stair':
      snippet = '      - id: escada\n        x: 400\n        y: 200\n        width: 100\n        height: 300\n        direction: up\n        connectsTo: terreo\n';
      break;
  }
  editor.replaceRange(snippet, cursor);
  editor.focus();
  doRender();
};

// ── download / export ──
window.downloadSVG = () => { try { const svg = renderFloorplan(editor.getValue()); const b = new Blob([svg], { type: 'image/svg+xml' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'planta.svg'; a.click(); URL.revokeObjectURL(u); } catch (e) { toast('Erro: ' + e.message); } };
window.downloadYAML = () => { const b = new Blob([editor.getValue()], { type: 'text/yaml' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'planta.yaml'; a.click(); URL.revokeObjectURL(u); };
window.resetEditor = () => { loadExample(currentExample); toast('Editor redefinido'); };

window.exportPDF = function() {
  let svg;
  const svgEl = document.querySelector('#preview-pane svg');
  if (svgEl) {
    const clone = svgEl.cloneNode(true);
    svg = clone.outerHTML;
  } else {
    try { svg = renderFloorplan(editor.getValue()); } catch (e) { toast('Erro: ' + e.message); return; }
  }

  let title = 'Planta Baixa', rooms = [], totalArea = '0.0';
  try {
    const input = parseFloorPlan(expandExample(editor.getValue()));
    title = input.title || 'Planta Baixa';
    if (input.floors) {
      for (const f of input.floors) for (const r of (f.rooms || [])) rooms.push(r);
    }
    if (input.rooms) rooms = input.rooms;
    totalArea = (rooms.reduce((sum, r) => sum + r.width * r.height, 0) / 10000).toFixed(1);
  } catch (e) {}

  const escS = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escS(title)}</title>
<style>
  @page { size: A3 landscape; margin: 15mm; }
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
      <div><h1>${escS(title)}</h1><p>Escala: 1:50 | Data: ${new Date().toLocaleDateString('pt-BR')}</p></div>
      <div class="stamp">
        <table>
          <tr><td>Projeto:</td><td>${escS(title)}</td></tr>
          <tr><td>Escala:</td><td>1:50</td></tr>
          <tr><td>Data:</td><td>${new Date().toLocaleDateString('pt-BR')}</td></tr>
          <tr><td>&Aacute;rea:</td><td>${totalArea} m&sup2;</td></tr>
          <tr><td>Gerado por:</td><td>Floorplan</td></tr>
        </table>
      </div>
    </div>
    <div class="floor-plan">${svg}</div>
    <div class="legend">
      <strong>Legenda:</strong> ${rooms.map(r => escS(r.name)).join(' | ') || 'Nenhum c&ocirc;modo'}
    </div>
    <div class="scale-bar">&block;&block;&block;&block;&block; 5m &block;&block;&block;&block;&block;</div>
  </div>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
};

window.exportPNG = function() {
  const svgEl = document.querySelector('#preview-pane svg');
  if (!svgEl) { toast('Nenhum SVG para exportar'); return; }
  const clone = svgEl.cloneNode(true);
  const svg = clone.outerHTML;
  const canvas = document.createElement('canvas');
  const img = new Image();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'planta.png';
    a.click();
    toast('🖼️ PNG exportado!');
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Erro ao exportar PNG'); };
  img.src = url;
};

// ── share ──
function saveHash() { try { history.replaceState(null, '', '#' + btoa(unescape(encodeURIComponent(editor.getValue())))); } catch (e) {} }
window.shareURL = () => { saveHash(); navigator.clipboard.writeText(location.href).then(() => toast('Link copiado! Compartilhe para visualizar esta planta')).catch(() => toast('Erro ao copiar link')); };

function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }

// ── summary ──
window.showSummary = function() {
  try {
    const input = parseFloorPlan(expandExample(editor.getValue()));
    const sc = input.scale;
    let totalArea = 0;
    let allRooms = [];

    if (input.floors) {
      for (const f of input.floors) {
        for (const r of (f.rooms || [])) allRooms.push(r);
      }
    }
    if (input.rooms) allRooms = input.rooms;

    const rooms = allRooms.map(r => {
      const areaM2 = (r.width * r.height) / 10000;
      totalArea += areaM2;
      return { name: r.name, area: areaM2, doors: (r.doors || []).length, windows: (r.windows || []).length };
    });
    const totalDoors = rooms.reduce((s, r) => s + r.doors, 0);
    const totalWindows = rooms.reduce((s, r) => s + r.windows, 0);
    const scaleLabel = sc === 2 ? '1:50' : sc === 1 ? '1:100' : sc === 0.5 ? '1:200' : `1:${Math.round(100 / sc)}`;
    const wallCm = input.wallThickness || 15;

    let html = '<h2>📊 Resumo Executivo</h2>';
    html += '<div class="stat-grid">';
    html += `<div class="stat-box"><div class="stat-value">${totalArea.toFixed(1)}</div><div class="stat-label">Área Total (m²)</div></div>`;
    html += `<div class="stat-box"><div class="stat-value">${rooms.length}</div><div class="stat-label">Cômodos</div></div>`;
    html += `<div class="stat-box"><div class="stat-value">${totalDoors}</div><div class="stat-label">Portas</div></div>`;
    html += `<div class="stat-box"><div class="stat-value">${totalWindows}</div><div class="stat-label">Janelas</div></div>`;
    html += '</div>';

    html += '<table><thead><tr><th>Cômodo</th><th>Área (m²)</th><th>🚪</th><th>🪟</th></tr></thead><tbody>';
    for (const r of rooms) {
      html += `<tr><td><strong>${esc(r.name)}</strong></td><td>${r.area.toFixed(1)}</td><td>${r.doors}</td><td>${r.windows}</td></tr>`;
    }
    html += '</tbody></table>';

    html += `<div style="font-size:11px;color:var(--text2);margin-top:4px">Escala: ${scaleLabel} · Parede: ${wallCm}cm · Grid: ${input.grid === false ? 'desligado' : (input.grid || 100) + 'cm'}</div>`;
    html += `<button class="close-btn" onclick="hideSummary()">Fechar</button>`;

    document.getElementById('summary-panel').innerHTML = html;
    document.getElementById('summary-overlay').classList.add('show');
  } catch (e) {
    toast('Erro ao gerar resumo: ' + e.message);
  }
};
window.hideSummary = function() { document.getElementById('summary-overlay').classList.remove('show'); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideSummary(); });

// ── room library ──
const ROOM_TEMPLATES = [
  { icon: '🛋️', name: 'Sala de Estar', w: 500, h: 400, door: 'south', dw: 80, win: true },
  { icon: '🍳', name: 'Cozinha', w: 300, h: 350, door: 'south', dw: 80, win: true },
  { icon: '🛏️', name: 'Quarto', w: 350, h: 350, door: 'south', dw: 80, win: true },
  { icon: '🚿', name: 'Banheiro', w: 200, h: 220, door: 'south', dw: 70, win: true },
  { icon: '🚪', name: 'Corredor', w: 400, h: 120, door: 'east', dw: 80, win: false },
  { icon: '💼', name: 'Escritório', w: 350, h: 350, door: 'south', dw: 80, win: true },
  { icon: '🌿', name: 'Varanda', w: 300, h: 150, door: 'north', dw: 80, win: true },
  { icon: '🏠', name: 'Hall Entrada', w: 250, h: 200, door: 'south', dw: 90, win: false },
  { icon: '🍽️', name: 'Sala de Jantar', w: 400, h: 350, door: 'south', dw: 80, win: true },
  { icon: '🧺', name: 'Lavanderia', w: 200, h: 200, door: 'south', dw: 70, win: true },
];

function renderRoomLibrary() {
  const el = document.getElementById('room-library');
  el.innerHTML = ROOM_TEMPLATES.map((t, i) => `
    <div class="room-lib-item" onclick="insertRoomTemplate(${i})" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${i}')">
      <span class="lib-icon">${t.icon}</span>
      <span class="lib-info"><span class="lib-name">${t.name}</span><br><span class="lib-size">${t.w}×${t.h}cm · ~${(t.w * t.h / 10000).toFixed(1)}m²</span></span>
      <span class="lib-add">＋</span>
    </div>
  `).join('');
}

window.insertRoomTemplate = function(idx) {
  const t = ROOM_TEMPLATES[idx];
  const yaml = editor.getValue();
  const lines = yaml.split('\n');

  let maxX = 0, maxY = 0;
  try {
    const input = parseFloorPlan(expandExample(yaml));
    const allRooms = [];
    if (input.floors) { for (const f of input.floors) for (const r of (f.rooms || [])) allRooms.push(r); }
    if (input.rooms) allRooms.push(...input.rooms);
    for (const r of allRooms) {
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }
  } catch (e) {}
  const newX = maxX;
  const newY = 0;

  const ids = [...yaml.matchAll(/id:\s*(\S+)/g)].map(m => m[1]);
  let num = 1;
  const baseId = t.name.toLowerCase().replace(/\s+/g, '');
  while (ids.includes(baseId + '_' + num)) num++;
  const newId = baseId + '_' + num;

  const winBlock = t.win ? `\n    windows:\n      - wall: north; offset: ${Math.round(t.w * 0.3)}; width: ${Math.round(t.w * 0.5)}; height: 120; sill: 110` : '';

  const roomYaml = `  - id: ${newId}
    name: ${t.name}
    x: ${newX}
    y: ${newY}
    width: ${t.w}
    height: ${t.h}
    doors:
      - wall: ${t.door}; offset: ${Math.round(t.w / 2 - t.dw / 2)}; width: ${t.dw}; type: pivot; swing: left${winBlock}`;

  const roomsIdx = lines.findIndex(l => /^\s*rooms:/.test(l));
  if (roomsIdx < 0) { toast('Erro: seção rooms não encontrada'); return; }

  let lastRoomEnd = roomsIdx + 1;
  for (let i = roomsIdx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) { lastRoomEnd = i; break; }
    lastRoomEnd = i + 1;
  }

  lines.splice(lastRoomEnd, 0, ...roomYaml.split('\n'));
  editor.setValue(lines.join('\n'));
  toast(`➕ ${t.name} adicionado! Arraste no preview para reposicionar`);
  doRender();
};
renderRoomLibrary();

// ── drag rooms in SVG preview (event delegation) ──
let dragState = null;

function getSVGMouse(svg, ev) {
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

document.getElementById('preview-pane').addEventListener('mousedown', e => {
  const rect = e.target.closest('[data-room-id]');
  if (!rect || e.button !== 0) return;
  const svg = rect.closest('svg');
  if (!svg) return;

  const roomId = rect.getAttribute('data-room-id');
  const startMouse = getSVGMouse(svg, e);

  dragState = {
    roomId, svg, rect,
    startMouse,
    startX: parseFloat(rect.getAttribute('x')),
    startY: parseFloat(rect.getAttribute('y')),
    moved: false,
  };
  rect.style.cursor = 'grabbing';
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!dragState) return;
  const { svg, startMouse, startX, startY, rect } = dragState;
  const mouse = getSVGMouse(svg, e);
  const dx = mouse.x - startMouse.x, dy = mouse.y - startMouse.y;
  if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
  dragState.moved = true;
  rect.setAttribute('x', Math.round(startX + dx));
  rect.setAttribute('y', Math.round(startY + dy));
});

document.addEventListener('mouseup', e => {
  if (!dragState) return;
  const { roomId, svg, startMouse, startX, startY, moved, rect } = dragState;
  rect.style.cursor = 'grab';
  if (moved) {
    const mouse = getSVGMouse(svg, e);
    updateRoomPosition(roomId, Math.round(startX + mouse.x - startMouse.x), Math.round(startY + mouse.y - startMouse.y));
  }
  dragState = null;
});

function updateRoomPosition(roomId, newXPx, newYPx) {
  const yaml = editor.getValue();
  let sc = 2;
  try { sc = parseFloorPlan(expandExample(yaml)).scale || 2; } catch (e) {}
  const newXCm = Math.max(0, Math.round(newXPx / sc));
  const newYCm = Math.max(0, Math.round(newYPx / sc));

  const lines = yaml.split('\n');
  let inTarget = false, foundX = false, foundY = false;
  for (let i = 0; i < lines.length; i++) {
    const hasId = lines[i].includes(`id: ${roomId}`);
    if (hasId && /^\s+-\s+id:/.test(lines[i])) inTarget = true;
    if (inTarget && /^\s+x:/.test(lines[i]) && !foundX) {
      lines[i] = lines[i].replace(/x:\s*\d+/, `x: ${newXCm}`);
      foundX = true;
    }
    if (inTarget && /^\s+y:/.test(lines[i]) && !foundY) {
      lines[i] = lines[i].replace(/y:\s*\d+/, `y: ${newYCm}`);
      foundY = true;
    }
    if (foundX && foundY) break;
    if (inTarget && /^\s+-\s+id:/.test(lines[i]) && !hasId) break;
  }

  editor.setValue(lines.join('\n'));
  doRender();
}

// expõe loadExample para os onclick do HTML
window.loadExample = loadExample;

// ── init ──
function init() {
  let yaml = null;
  if (location.hash && location.hash.length > 1) {
    try { yaml = decodeURIComponent(escape(atob(location.hash.slice(1)))); } catch (e) {}
  }
  if (yaml) {
    editor.setValue(yaml);
    currentExample = 'custom';
    document.querySelectorAll('.example-card').forEach(c => c.classList.remove('active'));
    document.getElementById('file-name').textContent = 'Compartilhado';
  } else {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && saved.trim()) {
        editor.setValue(saved);
        currentExample = 'custom';
        document.querySelectorAll('.example-card').forEach(c => c.classList.remove('active'));
        document.getElementById('file-name').textContent = 'Restaurado';
        updateStatusLine();
        doRender();
        return;
      }
    } catch (e) {}
    loadExample('apartamento');
  }
  updateStatusLine();
}
init();
