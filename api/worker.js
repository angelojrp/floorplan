// Floorplan API — Cloudflare Worker
// POST /render — YAML body → SVG response
// GET / — API documentation
// Self-contained: no external npm deps

// ═══════════════════════════════════════════════════════════
// SIMPLIFIED YAML PARSER (handles floorplan DSL subset)
// ═══════════════════════════════════════════════════════════

function parseYaml(text) {
  const lines = stripComments(text)
    .split("\n")
    .filter((l) => l.trim() !== "");

  // preprocess: extract inline flow arrays [a, b] and empty []
  const arrays = [];
  const norm = lines.map((line) =>
    line.replace(/\[([^\]]*)\]/g, (_, inner) => {
      if (inner.trim() === "") {
        arrays.push([]);
      } else {
        const vals = inner.split(",").map((s) => coerceScalar(s.trim()));
        arrays.push(vals);
      }
      return `__ARR_${arrays.length - 1}__`;
    })
  );

  let pos = 0;
  function peek() {
    return pos < norm.length ? norm[pos] : null;
  }
  function advance() {
    pos++;
  }
  function indentOf(s) {
    return s.search(/\S/);
  }
  function contentOf(s) {
    return s.slice(indentOf(s));
  }

  function resolveInlineArrays(s) {
    if (typeof s !== "string") return s;
    const trimmed = s.trim();
    // If entire value is an inline array marker → return actual array
    const wholeMatch = trimmed.match(/^__ARR_(\d+)__$/);
    if (wholeMatch) return arrays[parseInt(wholeMatch[1])];
    // Otherwise replace embedded markers with their JSON representation
    return s.replace(/__ARR_(\d+)__/g, (_, idx) =>
      JSON.stringify(arrays[parseInt(idx)])
    );
  }

  function parseBlock(minIndent) {
    // returns { type:'object', value:{} } or { type:'list', value:[] }
    const first = peek();
    if (!first || indentOf(first) < minIndent)
      return { type: "object", value: {} };
    if (contentOf(first).startsWith("- "))
      return { type: "list", value: parseList(indentOf(first), minIndent) };

    const obj = {};
    while (pos < norm.length) {
      const line = peek();
      if (!line) break;
      const indent = indentOf(line);
      if (indent < minIndent) break;

      const cont = contentOf(line);
      if (cont.startsWith("- ")) break; // list at this level — let caller handle

      const ci = cont.indexOf(":");
      if (ci < 0) {
        advance();
        continue;
      }

      const key = cont.substring(0, ci).trim();
      let valStr = cont.substring(ci + 1).trim();
      advance();
      valStr = resolveInlineArrays(valStr);
      let value = valStr ? coerceScalar(valStr) : undefined;

      const nextLine = peek();
      if (nextLine && indentOf(nextLine) > indent) {
        const child = parseBlock(indentOf(nextLine));
        if (child.type === "list") {
          value = child.value;
        } else {
          if (typeof value === "object" && value !== null) {
            Object.assign(value, child.value);
          } else if (value === undefined) {
            value = child.value;
          } else {
            value = child.value;
          }
        }
      }
      obj[key] = value !== undefined ? value : null;
    }
    return { type: "object", value: obj };
  }

  function parseList(itemIndent, minIndent) {
    const items = [];
    while (pos < norm.length) {
      const line = peek();
      if (!line) break;
      const indent = indentOf(line);
      if (indent < minIndent) break;
      if (indent < itemIndent) break;

      if (indent === itemIndent && contentOf(line).startsWith("- ")) {
        const cont = contentOf(line).substring(2).trim();
        advance();

        let item;
        const ci = cont.indexOf(":");
        if (ci >= 0) {
          const k = cont.substring(0, ci).trim();
          let v = cont.substring(ci + 1).trim();
          v = resolveInlineArrays(v);
          item = { [k]: v ? coerceScalar(v) : null };
        } else if (cont) {
          const resolved = resolveInlineArrays(cont);
          item = coerceScalar(resolved);
        } else {
          item = {};
        }

        // child properties of this list item
        while (pos < norm.length) {
          const cl = peek();
          if (!cl) break;
          const cIndent = indentOf(cl);
          if (cIndent <= itemIndent) break;

          const cCont = contentOf(cl);
          if (cCont.startsWith("- ")) break; // sublist — handled by recursive child below

          const cci = cCont.indexOf(":");
          if (cci < 0) {
            advance();
            continue;
          }

          const ck = cCont.substring(0, cci).trim();
          let cv = cCont.substring(cci + 1).trim();
          advance();
          cv = resolveInlineArrays(cv);
          let cval = cv ? coerceScalar(cv) : undefined;

          const dpl = peek();
          if (dpl && indentOf(dpl) > cIndent) {
            const child = parseBlock(indentOf(dpl));
            if (child.type === "list") {
              cval = child.value;
            } else {
              if (typeof cval === "object" && cval !== null) {
                Object.assign(cval, child.value);
              } else if (cval === undefined) {
                cval = child.value;
              } else {
                cval = child.value;
              }
            }
          }

          if (typeof item === "object" && item !== null) {
            item[ck] = cval !== undefined ? cval : null;
          }
        }
        items.push(item);
      } else if (indent > itemIndent) {
        // child of last list item (empty "-" case)
        if (items.length > 0 && typeof items[items.length - 1] === "object") {
          const child = parseBlock(indent);
          if (child.type === "object")
            Object.assign(items[items.length - 1], child.value);
        } else {
          break;
        }
      } else {
        break;
      }
    }
    return items;
  }

  const result = parseBlock(0);
  if (result.type === "list") return result.value;
  return result.value;
}

function stripComments(raw) {
  return raw
    .split("\n")
    .map((line) => {
      let inQ = false,
        q = "";
      for (let i = 0; i < line.length; i++) {
        if (inQ) {
          if (line[i] === q) inQ = false;
          continue;
        }
        if (line[i] === '"' || line[i] === "'") {
          inQ = true;
          q = line[i];
          continue;
        }
        if (line[i] === "#") return line.substring(0, i);
      }
      return line;
    })
    .join("\n");
}

function coerceScalar(s) {
  if (typeof s !== "string") return s;
  s = s.trim();
  if (s === "") return undefined;
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  )
    return s.slice(1, -1);
  if (s === "true" || s === "True") return true;
  if (s === "false" || s === "False") return false;
  if (s === "null" || s === "Null" || s === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

// ═══════════════════════════════════════════════════════════
// VALIDATION (lightweight — mirrors src/types.ts + parser.ts)
// ═══════════════════════════════════════════════════════════

function validateFloorPlan(raw) {
  const errors = [];

  if (!raw || typeof raw !== "object") {
    errors.push("YAML vazio ou inválido");
    return { valid: false, errors };
  }

  if (raw.version !== 1) errors.push("version deve ser 1");

  if (typeof raw.scale !== "number" || raw.scale <= 0)
    errors.push("scale deve ser um número positivo");

  if (!Array.isArray(raw.rooms) || raw.rooms.length === 0)
    errors.push("rooms deve ser uma lista com pelo menos 1 cômodo");

  const wallDirs = ["north", "south", "east", "west"];
  const doorTypes = ["pivot", "sliding", "double"];
  const swingTypes = ["left", "right", "none"];
  const hatchTypes = [
    "solid",
    "diagonal",
    "cross",
    "dots",
    "horizontal",
    "vertical",
  ];

  if (Array.isArray(raw.rooms)) {
    for (let i = 0; i < raw.rooms.length; i++) {
      const r = raw.rooms[i];
      const pre = `rooms[${i}]`;
      if (!r.id || typeof r.id !== "string")
        errors.push(`${pre}.id é obrigatório`);
      if (!r.name || typeof r.name !== "string")
        errors.push(`${pre}.name é obrigatório`);
      if (typeof r.x !== "number") errors.push(`${pre}.x deve ser número`);
      if (typeof r.y !== "number") errors.push(`${pre}.y deve ser número`);
      if (typeof r.width !== "number" || r.width <= 0)
        errors.push(`${pre}.width deve ser número positivo`);
      if (typeof r.height !== "number" || r.height <= 0)
        errors.push(`${pre}.height deve ser número positivo`);

      if (Array.isArray(r.doors)) {
        for (let j = 0; j < r.doors.length; j++) {
          const d = r.doors[j];
          const p = `${pre}.doors[${j}]`;
          if (!wallDirs.includes(d.wall)) errors.push(`${p}.wall inválido`);
          if (typeof d.offset !== "number" || d.offset < 0)
            errors.push(`${p}.offset inválido`);
          if (typeof d.width !== "number" || d.width <= 0)
            errors.push(`${p}.width inválido`);
          if (d.type && !doorTypes.includes(d.type))
            errors.push(`${p}.type inválido`);
          if (d.swing && !swingTypes.includes(d.swing))
            errors.push(`${p}.swing inválido`);
        }
      }

      if (Array.isArray(r.windows)) {
        for (let j = 0; j < r.windows.length; j++) {
          const w = r.windows[j];
          const p = `${pre}.windows[${j}]`;
          if (!wallDirs.includes(w.wall)) errors.push(`${p}.wall inválido`);
          if (typeof w.offset !== "number" || w.offset < 0)
            errors.push(`${p}.offset inválido`);
          if (typeof w.width !== "number" || w.width <= 0)
            errors.push(`${p}.width inválido`);
        }
      }

      if (r.hatch && !hatchTypes.includes(r.hatch))
        errors.push(`${pre}.hatch inválido: ${r.hatch}`);
    }
  }

  if (raw.walls !== undefined && !Array.isArray(raw.walls))
    errors.push("walls deve ser uma lista");

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════
// LAYOUT ENGINE (adapted from src/layout.ts)
// ═══════════════════════════════════════════════════════════

const DOOR_OFFSET = 5;

function pt(x, y) {
  return { x, y };
}

function toPoint(cx, cy, scale) {
  return { x: cx * scale, y: cy * scale };
}

function resolveLayout(input) {
  const scale = input.scale;
  const wt = (input.wallThickness || 15) * scale;

  const rooms = input.rooms.map((room) => resolveRoom(room, scale, wt));
  const freeWalls = (input.walls || []).map((w) => ({
    from: toPoint(w.from[0], w.from[1], scale),
    to: toPoint(w.to[0], w.to[1], scale),
    thickness: (w.thickness || input.wallThickness || 15) * scale,
  }));

  const grid = input.grid === false ? false : (input.grid || 100) * scale;
  const dimensions = computeDimensions(rooms, scale, wt);

  return {
    title: input.title,
    scale,
    rooms,
    freeWalls,
    wallThicknessPx: wt,
    grid,
    dimensions,
  };
}

function resolveRoom(room, scale, wallThicknessPx) {
  const rect = {
    x: room.x * scale,
    y: room.y * scale,
    width: room.width * scale,
    height: room.height * scale,
  };

  const labelPos = room.label
    ? pt(rect.x + room.label.x * scale, rect.y + room.label.y * scale)
    : pt(rect.x + rect.width / 2, rect.y + rect.height / 2);

  const doors = resolveDoorOpenings(room, rect, wallThicknessPx, scale);
  const windows = resolveWindowOpenings(room, rect, scale);
  const wallSegments = computeWallSegments(rect, doors, windows);

  return {
    id: room.id,
    name: room.name,
    rect,
    wallRects: wallSegments,
    doors,
    windows,
    labelPos,
    hatch: room.hatch,
  };
}

function resolveDoorOpenings(room, rect, wallThicknessPx, scale) {
  return (room.doors || []).map((door) => {
    const oe = openingOnWall(
      door.wall,
      rect,
      door.offset * scale,
      door.width * scale
    );
    const swingArcs = computeSwingArcs(
      door,
      oe.start,
      oe.end,
      wallThicknessPx,
      scale
    );
    return {
      wall: door.wall,
      start: oe.start,
      end: oe.end,
      swingArcs,
      type: door.type || "pivot",
    };
  });
}

function computeSwingArcs(door, start, end, wallThicknessPx, scale) {
  const doorWidthPx =
    door.wall === "north" || door.wall === "south"
      ? Math.abs(end.x - start.x)
      : Math.abs(end.y - start.y);

  if (door.type === "sliding") return [];

  let inX = 0,
    inY = 0;
  switch (door.wall) {
    case "north":
      inY = 1;
      break;
    case "south":
      inY = -1;
      break;
    case "east":
      inX = -1;
      break;
    case "west":
      inX = 1;
      break;
  }

  if (door.type === "double") {
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const halfR = doorWidthPx / 2;
    return [
      buildArc(start.x, start.y, halfR, midX, midY, inX, inY, halfR),
      buildArc(end.x, end.y, halfR, midX, midY, inX, inY, halfR),
    ];
  }

  const hingeIsStart = (door.swing || "left") === "left";
  const hingeX = hingeIsStart ? start.x : end.x;
  const hingeY = hingeIsStart ? start.y : end.y;
  const closedX = hingeIsStart ? end.x : start.x;
  const closedY = hingeIsStart ? end.y : start.y;

  return [
    buildArc(hingeX, hingeY, doorWidthPx, closedX, closedY, inX, inY, doorWidthPx),
  ];
}

function buildArc(cx, cy, r, closedX, closedY, inX, inY, inDist) {
  const openX = cx + inX * inDist;
  const openY = cy + inY * inDist;
  const cross =
    (closedX - cx) * (openY - cy) - (closedY - cy) * (openX - cx);
  const sweep = cross > 0 ? 0 : 1;
  return {
    cx: Math.round(cx),
    cy: Math.round(cy),
    r: Math.round(r),
    x1: Math.round(closedX),
    y1: Math.round(closedY),
    x2: Math.round(openX),
    y2: Math.round(openY),
    sweep,
  };
}

function resolveWindowOpenings(room, rect, scale) {
  return (room.windows || []).map((win) => {
    const oe = openingOnWall(
      win.wall,
      rect,
      win.offset * scale,
      win.width * scale
    );
    return { wall: win.wall, start: oe.start, end: oe.end };
  });
}

function openingOnWall(wall, rect, offsetPx, widthPx) {
  switch (wall) {
    case "north":
      return {
        start: pt(rect.x + offsetPx, rect.y),
        end: pt(rect.x + offsetPx + widthPx, rect.y),
      };
    case "south":
      return {
        start: pt(rect.x + offsetPx, rect.y + rect.height),
        end: pt(rect.x + offsetPx + widthPx, rect.y + rect.height),
      };
    case "east":
      return {
        start: pt(rect.x + rect.width, rect.y + offsetPx),
        end: pt(rect.x + rect.width, rect.y + offsetPx + widthPx),
      };
    case "west":
      return {
        start: pt(rect.x, rect.y + offsetPx),
        end: pt(rect.x, rect.y + offsetPx + widthPx),
      };
  }
}

function computeWallSegments(rect, doors, windows) {
  const segments = [];
  const allOpenings = [
    ...doors.map((d) => ({ wall: d.wall, start: d.start, end: d.end })),
    ...windows.map((w) => ({ wall: w.wall, start: w.start, end: w.end })),
  ];

  const edges = [
    {
      dir: "north",
      from: pt(rect.x, rect.y),
      to: pt(rect.x + rect.width, rect.y),
    },
    {
      dir: "south",
      from: pt(rect.x, rect.y + rect.height),
      to: pt(rect.x + rect.width, rect.y + rect.height),
    },
    { dir: "west", from: pt(rect.x, rect.y), to: pt(rect.x, rect.y + rect.height) },
    {
      dir: "east",
      from: pt(rect.x + rect.width, rect.y),
      to: pt(rect.x + rect.width, rect.y + rect.height),
    },
  ];

  for (const edge of edges) {
    const openingsOnEdge = allOpenings
      .filter((o) => o.wall === edge.dir)
      .sort((a, b) => {
        const isH = edge.dir === "north" || edge.dir === "south";
        return isH ? a.start.x - b.start.x : a.start.y - b.start.y;
      });

    if (openingsOnEdge.length === 0) {
      segments.push({
        x1: edge.from.x,
        y1: edge.from.y,
        x2: edge.to.x,
        y2: edge.to.y,
        direction: edge.dir,
      });
      continue;
    }

    const isH = edge.dir === "north" || edge.dir === "south";
    let current = isH ? edge.from.x : edge.from.y;
    const max = isH ? edge.to.x : edge.to.y;

    for (const op of openingsOnEdge) {
      const opStart = isH ? op.start.x : op.start.y;
      const opEnd = isH ? op.end.x : op.end.y;
      if (opStart > current) {
        segments.push({
          x1: isH ? current : edge.from.x,
          y1: isH ? edge.from.y : current,
          x2: isH ? opStart : edge.from.x,
          y2: isH ? edge.from.y : opStart,
          direction: edge.dir,
        });
      }
      current = Math.max(current, opEnd);
    }

    if (current < max) {
      segments.push({
        x1: isH ? current : edge.from.x,
        y1: isH ? edge.from.y : current,
        x2: edge.to.x,
        y2: edge.to.y,
        direction: edge.dir,
      });
    }
  }

  return segments;
}

function computeDimensions(rooms, scale, wallThicknessPx) {
  if (rooms.length === 0) return [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const room of rooms) {
    minX = Math.min(minX, room.rect.x);
    minY = Math.min(minY, room.rect.y);
    maxX = Math.max(maxX, room.rect.x + room.rect.width);
    maxY = Math.max(maxY, room.rect.y + room.rect.height);
  }
  const offset = 40;
  return [
    {
      x1: minX,
      y1: maxY + offset,
      x2: maxX,
      y2: maxY + offset,
      value: ((maxX - minX) / scale / 100).toFixed(2) + " m",
      offset,
    },
    {
      x1: maxX + offset,
      y1: minY,
      x2: maxX + offset,
      y2: maxY,
      value: ((maxY - minY) / scale / 100).toFixed(2) + " m",
      offset,
    },
  ];
}

// ═══════════════════════════════════════════════════════════
// SVG RENDERER (adapted from src/renderer.ts)
// ═══════════════════════════════════════════════════════════

const C = {
  wall: "#2d2d2d",
  wallStroke: "#1a1a1a",
  roomBg: "#fafafa",
  door: "#2d2d2d",
  doorArc: "#555555",
  windowStroke: "#4a90d9",
  windowGlass: "#d6eaf8",
  dimLine: "#b71c1c",
  dimText: "#b71c1c",
  gridDot: "#e0e0e0",
  label: "#1a1a1a",
  areaLabel: "#666666",
  title: "#1a1a1a",
  freeWall: "#e0e0e0",
  freeWallStroke: "#2d2d2d",
  jamb: "#2d2d2d",
};

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function rnd(n) {
  return Math.round(n * 10) / 10;
}

function renderSvg(input) {
  const { rooms, freeWalls, wallThicknessPx: wt, grid, dimensions, title } = input;

  const { minX, minY, maxX, maxY } = computeBounds(rooms, freeWalls, dimensions);
  const margin = 70;
  const vbX = minX - margin;
  const vbY = minY - margin;
  const vbW = maxX - minX + margin * 2;
  const vbH = maxY - minY + margin * 2;

  const out = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="100%" height="100%">`,
    "<style>",
    `  .wall-fill { fill: ${C.wall}; stroke: ${C.wallStroke}; stroke-width: 0.8; }`,
    `  .room-bg { fill: ${C.roomBg}; }`,
    `  .door-panel { stroke: ${C.door}; stroke-width: 1.8; stroke-linecap: round; }`,
    `  .door-arc { fill: none; stroke: ${C.doorArc}; stroke-width: 1.2; stroke-dasharray: 5 4; }`,
    `  .window-frame { stroke: ${C.windowStroke}; stroke-width: 1.5; }`,
    `  .jamb { stroke: ${C.jamb}; stroke-width: 3; stroke-linecap: round; }`,
    `  .dim-line { fill: none; stroke: ${C.dimLine}; stroke-width: 0.8; }`,
    `  .dim-tick { stroke: ${C.dimLine}; stroke-width: 0.8; }`,
    `  .dim-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: ${C.dimText}; text-anchor: middle; }`,
    `  .room-name { font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; font-weight: 600; fill: ${C.label}; text-anchor: middle; dominant-baseline: middle; }`,
    `  .title-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 20px; font-weight: 700; fill: ${C.title}; text-anchor: middle; }`,
    `  .grid-dot { fill: ${C.gridDot}; }`,
    `  .free-wall-fill { fill: ${C.freeWall}; stroke: ${C.freeWallStroke}; stroke-width: 0.8; }`,
    "</style>",
    "<defs>",
    `  <pattern id="h-diag" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#fafafa"/><line x1="0" y1="0" x2="8" y2="8" stroke="#e0e0e0" stroke-width="1"/></pattern>`,
    `  <pattern id="h-cross" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#fafafa"/><line x1="0" y1="0" x2="8" y2="8" stroke="#e0e0e0" stroke-width="1"/><line x1="8" y1="0" x2="0" y2="8" stroke="#e0e0e0" stroke-width="1"/></pattern>`,
    `  <pattern id="h-dots" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#fafafa"/><circle cx="3" cy="3" r="1" fill="#e0e0e0"/></pattern>`,
    `  <pattern id="h-horiz" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#fafafa"/><line x1="0" y1="3" x2="6" y2="3" stroke="#e0e0e0" stroke-width="1"/></pattern>`,
    `  <pattern id="h-vert" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#fafafa"/><line x1="3" y1="0" x2="3" y2="6" stroke="#e0e0e0" stroke-width="1"/></pattern>`,
    "</defs>"
  );

  out.push(
    `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#ffffff"/>`
  );

  // grid
  if (grid !== false) {
    out.push(renderGrid(vbX, vbY, vbW, vbH, grid));
  }

  // title
  if (title) {
    out.push(
      `<text x="${(minX + maxX) / 2}" y="${minY - 40}" class="title-text">${esc(title)}</text>`
    );
  }

  // room backgrounds (with optional hatch)
  const hatchMap = {
    diagonal: "h-diag",
    cross: "h-cross",
    dots: "h-dots",
    horizontal: "h-horiz",
    vertical: "h-vert",
  };
  for (const room of rooms) {
    if (room.hatch && room.hatch !== "solid") {
      const hId = hatchMap[room.hatch];
      if (hId) {
        out.push(
          `<rect x="${room.rect.x}" y="${room.rect.y}" width="${room.rect.width}" height="${room.rect.height}" fill="url(#${hId})"/>`
        );
      } else {
        out.push(
          `<rect x="${room.rect.x}" y="${room.rect.y}" width="${room.rect.width}" height="${room.rect.height}" class="room-bg"/>`
        );
      }
    } else {
      out.push(
        `<rect x="${room.rect.x}" y="${room.rect.y}" width="${room.rect.width}" height="${room.rect.height}" class="room-bg"/>`
      );
    }
  }

  // walls
  out.push(...renderAllWalls(rooms, wt));

  // free walls
  for (const fw of freeWalls) {
    out.push(renderFreeWall(fw));
  }

  // windows
  for (const room of rooms) {
    for (const win of room.windows) {
      out.push(renderWindow(win, wt));
    }
  }

  // door jambs
  for (const room of rooms) {
    for (const door of room.doors) {
      out.push(renderDoorJambs(door, wt));
    }
  }

  // door panels + arcs
  for (const room of rooms) {
    for (const door of room.doors) {
      out.push(renderDoorPanels(door));
    }
  }

  // corner fills
  out.push(...renderCornerFills(rooms, wt));

  // room labels
  for (const room of rooms) {
    out.push(
      `<text x="${room.labelPos.x}" y="${room.labelPos.y}" class="room-name">${esc(room.name)}</text>`
    );
  }

  // dimensions
  for (const dim of dimensions) {
    out.push(renderDimension(dim));
  }

  out.push("</svg>");
  return out.join("\n");
}

function renderGrid(x, y, w, h, spacing) {
  const lines = [];
  for (
    let cx = Math.ceil(x / spacing) * spacing;
    cx <= x + w;
    cx += spacing
  ) {
    for (
      let cy = Math.ceil(y / spacing) * spacing;
      cy <= y + h;
      cy += spacing
    ) {
      lines.push(`<circle cx="${cx}" cy="${cy}" r="0.6" class="grid-dot"/>`);
    }
  }
  return lines.join("\n");
}

function renderAllWalls(rooms, wt) {
  const hSolids = new Map();
  const hOpenings = new Map();
  const vSolids = new Map();
  const vOpenings = new Map();

  for (const room of rooms) {
    for (const seg of room.wallRects) {
      const isH = seg.direction === "north" || seg.direction === "south";
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
    for (const door of room.doors) {
      const isH = door.wall === "north" || door.wall === "south";
      const y = isH ? door.start.y : door.start.x;
      const a = isH
        ? Math.min(door.start.x, door.end.x)
        : Math.min(door.start.y, door.end.y);
      const b = isH
        ? Math.max(door.start.x, door.end.x)
        : Math.max(door.start.y, door.end.y);
      const map = isH ? hOpenings : vOpenings;
      const list = map.get(y) || [];
      list.push({ a, b });
      map.set(y, list);
    }
    for (const win of room.windows) {
      const isH = win.wall === "north" || win.wall === "south";
      const y = isH ? win.start.y : win.start.x;
      const a = isH
        ? Math.min(win.start.x, win.end.x)
        : Math.min(win.start.y, win.end.y);
      const b = isH
        ? Math.max(win.start.x, win.end.x)
        : Math.max(win.start.y, win.end.y);
      const map = isH ? hOpenings : vOpenings;
      const list = map.get(y) || [];
      list.push({ a, b });
      map.set(y, list);
    }
  }

  const out = [];
  const hw = wt / 2;

  for (const [y, solids] of hSolids) {
    const openings = mergeSpans(hOpenings.get(y) || []);
    const merged = subtractOpenings(mergeSpans(solids), openings);
    for (const s of merged) {
      const w = s.b - s.a;
      if (w <= 0) continue;
      out.push(
        `<rect x="${rnd(s.a)}" y="${rnd(y - hw)}" width="${rnd(w)}" height="${rnd(wt)}" class="wall-fill"/>`
      );
    }
  }
  for (const [x, solids] of vSolids) {
    const openings = mergeSpans(vOpenings.get(x) || []);
    const merged = subtractOpenings(mergeSpans(solids), openings);
    for (const s of merged) {
      const h = s.b - s.a;
      if (h <= 0) continue;
      out.push(
        `<rect x="${rnd(x - hw)}" y="${rnd(s.a)}" width="${rnd(wt)}" height="${rnd(h)}" class="wall-fill"/>`
      );
    }
  }
  return out;
}

function mergeSpans(spans) {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.a - b.a);
  const result = [sorted[0]];
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

function subtractOpenings(solids, openings) {
  if (openings.length === 0) return solids;
  const result = [];
  for (const solid of solids) {
    let cursor = solid.a;
    for (const op of openings) {
      if (op.b <= cursor) continue;
      if (op.a >= solid.b) break;
      const gapStart = Math.max(cursor, op.a);
      const gapEnd = Math.min(solid.b, op.b);
      if (gapStart > cursor) result.push({ a: cursor, b: gapStart });
      cursor = Math.max(cursor, gapEnd);
    }
    if (cursor < solid.b) result.push({ a: cursor, b: solid.b });
  }
  return result;
}

function renderFreeWall(fw) {
  const dx = fw.to.x - fw.from.x;
  const dy = fw.to.y - fw.from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return "";
  const nx = -dy / len;
  const ny = dx / len;
  const ht = fw.thickness / 2;
  const pts = [
    fw.from.x + nx * ht,
    fw.from.y + ny * ht,
    fw.to.x + nx * ht,
    fw.to.y + ny * ht,
    fw.to.x - nx * ht,
    fw.to.y - ny * ht,
    fw.from.x - nx * ht,
    fw.from.y - ny * ht,
  ];
  return `<polygon points="${pts.map((p) => rnd(p)).join(",")}" class="free-wall-fill"/>`;
}

function renderWindow(win, wt) {
  const parts = [];
  const isH = win.wall === "north" || win.wall === "south";
  const sideGap = 2;
  const hw = wt / 2;

  if (isH) {
    const y = win.start.y;
    parts.push(
      `<rect x="${win.start.x + sideGap}" y="${y - hw}" width="${win.end.x - win.start.x - sideGap * 2}" height="${wt}" fill="${C.roomBg}" stroke="none"/>`
    );
    for (let i = -1; i <= 1; i++) {
      const yOff = y + hw * 0.6 * i;
      parts.push(
        `<line x1="${win.start.x}" y1="${yOff}" x2="${win.end.x}" y2="${yOff}" class="window-frame"/>`
      );
    }
    parts.push(
      `<line x1="${win.start.x}" y1="${y - hw}" x2="${win.start.x}" y2="${y + hw}" class="window-frame"/>`
    );
    parts.push(
      `<line x1="${win.end.x}" y1="${y - hw}" x2="${win.end.x}" y2="${y + hw}" class="window-frame"/>`
    );
  } else {
    const x = win.start.x;
    parts.push(
      `<rect x="${x - hw}" y="${win.start.y + sideGap}" width="${wt}" height="${win.end.y - win.start.y - sideGap * 2}" fill="${C.roomBg}" stroke="none"/>`
    );
    for (let i = -1; i <= 1; i++) {
      const xOff = x + hw * 0.6 * i;
      parts.push(
        `<line x1="${xOff}" y1="${win.start.y}" x2="${xOff}" y2="${win.end.y}" class="window-frame"/>`
      );
    }
    parts.push(
      `<line x1="${x - hw}" y1="${win.start.y}" x2="${x + hw}" y2="${win.start.y}" class="window-frame"/>`
    );
    parts.push(
      `<line x1="${x - hw}" y1="${win.end.y}" x2="${x + hw}" y2="${win.end.y}" class="window-frame"/>`
    );
  }
  return parts.join("\n");
}

function renderDoorJambs(door, wt) {
  const parts = [];
  const hw = wt / 2;
  const isH = door.wall === "north" || door.wall === "south";

  if (isH) {
    const sign = door.wall === "north" ? -1 : 1;
    const y1 = door.start.y - hw * sign;
    const y2 = door.start.y + hw * sign;
    parts.push(
      `<line x1="${door.start.x}" y1="${y1}" x2="${door.start.x}" y2="${y2}" class="jamb"/>`
    );
    parts.push(
      `<line x1="${door.end.x}" y1="${y1}" x2="${door.end.x}" y2="${y2}" class="jamb"/>`
    );
  } else {
    const sign = door.wall === "west" ? -1 : 1;
    const x1 = door.start.x - hw * sign;
    const x2 = door.start.x + hw * sign;
    parts.push(
      `<line x1="${x1}" y1="${door.start.y}" x2="${x2}" y2="${door.start.y}" class="jamb"/>`
    );
    parts.push(
      `<line x1="${x1}" y1="${door.end.y}" x2="${x2}" y2="${door.end.y}" class="jamb"/>`
    );
  }
  return parts.join("\n");
}

function renderDoorPanels(door) {
  if (door.type === "sliding") {
    return `<line x1="${door.start.x}" y1="${door.start.y}" x2="${door.end.x}" y2="${door.end.y}" class="door-panel" stroke-dasharray="6 3"/>`;
  }
  const parts = [];
  for (const arc of door.swingArcs) {
    if (arc.r <= 0) continue;
    parts.push(
      `<line x1="${arc.cx}" y1="${arc.cy}" x2="${arc.x2}" y2="${arc.y2}" class="door-panel"/>`
    );
    parts.push(
      `<path d="M ${arc.x1} ${arc.y1} A ${arc.r} ${arc.r} 0 0 ${arc.sweep} ${arc.x2} ${arc.y2}" class="door-arc"/>`
    );
  }
  return parts.join("\n");
}

function renderCornerFills(rooms, wt) {
  const seen = new Set();
  const out = [];
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
        out.push(
          `<rect x="${rnd(cx - wt / 2)}" y="${rnd(cy - wt / 2)}" width="${rnd(wt)}" height="${rnd(wt)}" class="wall-fill"/>`
        );
      }
    }
  }
  return out;
}

function renderDimension(dim) {
  const parts = [];
  const isH = Math.abs(dim.y2 - dim.y1) < Math.abs(dim.x2 - dim.x1);
  const tick = 7;

  parts.push(
    `<line x1="${dim.x1}" y1="${dim.y1}" x2="${dim.x2}" y2="${dim.y2}" class="dim-line"/>`
  );

  if (isH) {
    parts.push(
      `<line x1="${dim.x1}" y1="${dim.y1 - tick}" x2="${dim.x1}" y2="${dim.y1 + tick}" class="dim-tick"/>`
    );
    parts.push(
      `<line x1="${dim.x2}" y1="${dim.y2 - tick}" x2="${dim.x2}" y2="${dim.y2 + tick}" class="dim-tick"/>`
    );
  } else {
    parts.push(
      `<line x1="${dim.x1 - tick}" y1="${dim.y1}" x2="${dim.x1 + tick}" y2="${dim.y1}" class="dim-tick"/>`
    );
    parts.push(
      `<line x1="${dim.x2 - tick}" y1="${dim.y2}" x2="${dim.x2 + tick}" y2="${dim.y2}" class="dim-tick"/>`
    );
  }

  const mx = (dim.x1 + dim.x2) / 2;
  const my = (dim.y1 + dim.y2) / 2;
  const textOff = isH ? -14 : 14;
  const tx = isH ? mx : mx + textOff;
  const ty = isH ? my + textOff : my;

  parts.push(`<text x="${tx}" y="${ty}" class="dim-text">${esc(dim.value)}</text>`);
  return parts.join("\n");
}

function computeBounds(rooms, freeWalls, dimensions) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
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

// ═══════════════════════════════════════════════════════════
// WORKER HANDLER
// ═══════════════════════════════════════════════════════════

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
  <pre><code>npx wrangler deploy api/worker.js --name floorplan-api</code></pre>
  <p><a href="https://github.com/anomalyco/opencode">GitHub</a></p>
</body>
</html>`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function svgResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "image/svg+xml", ...CORS_HEADERS },
  });
}

function htmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
  });
}

function textResponse(body, status) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS_HEADERS },
  });
}

export { parseYaml, validateFloorPlan, resolveLayout, renderSvg };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // GET / — documentation
    if (method === "GET" && (path === "/" || path === "")) {
      return htmlResponse(HTML_DOCS);
    }

    // POST /render — YAML → SVG
    if (method === "POST" && path === "/render") {
      const contentType = request.headers.get("Content-Type") || "";
      if (
        !contentType.includes("text/plain") &&
        !contentType.includes("yaml") &&
        !contentType.includes("application/octet-stream")
      ) {
        return json(
          { error: "Content-Type deve ser text/plain ou application/x-yaml" },
          400
        );
      }

      let yamlText;
      try {
        yamlText = await request.text();
      } catch {
        return json({ error: "Corpo da requisição inválido" }, 400);
      }

      if (!yamlText || yamlText.trim().length === 0) {
        return json({ error: "Corpo da requisição vazio" }, 400);
      }

      // Parse YAML
      let parsed;
      try {
        parsed = parseYaml(yamlText);
      } catch (e) {
        return json({ error: "Erro ao parsear YAML", details: [e.message] }, 400);
      }

      // Handle top-level array (list of rooms directly)
      if (Array.isArray(parsed)) {
        parsed = { version: 1, scale: 2, rooms: parsed };
      }

      // Validate
      const validation = validateFloorPlan(parsed);
      if (!validation.valid) {
        return json(
          { error: "YAML inválido", details: validation.errors },
          400
        );
      }

      // Apply defaults
      const input = {
        version: 1,
        scale: parsed.scale,
        title: parsed.title,
        wallThickness: parsed.wallThickness || 15,
        grid: parsed.grid !== undefined ? parsed.grid : 100,
        rooms: parsed.rooms,
        walls: parsed.walls || [],
      };

      // Layout + Render
      let resolved, svg;
      try {
        resolved = resolveLayout(input);
        svg = renderSvg(resolved);
      } catch (e) {
        return json(
          { error: "Erro ao renderizar SVG", details: [e.message] },
          400
        );
      }

      return svgResponse(svg);
    }

    // 404
    return json({ error: "Rota não encontrada. Use GET / ou POST /render" }, 404);
  },
};
