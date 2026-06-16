import type {
  FloorPlanInput,
  ResolvedFloorPlan,
  ResolvedRoom,
  ResolvedDoor,
  ResolvedWindow,
  ResolvedStair,
  ResolvedFreeWall,
  WallSegment,
  Point,
  Rect,
  Arc,
  Dimension,
  WallDirection,
} from './types';

const DOOR_OFFSET = 5; // px de folga entre parede e batente

/**
 * Converte o input do usuário (cm) para coordenadas de tela (px)
 * e resolve toda a geometria dos cômodos.
 */
export function resolveLayout(input: FloorPlanInput): ResolvedFloorPlan {
  const scale = input.scale;
  const wt = input.wallThickness! * scale; // wall thickness in px

  const rooms: ResolvedRoom[] = input.rooms.map((room) => resolveRoom(room, scale, wt));

  const freeWalls: ResolvedFreeWall[] = (input.walls || []).map((w) => ({
    from: toPoint(w.from, scale),
    to: toPoint(w.to, scale),
    thickness: (w.thickness || input.wallThickness!) * scale,
  }));

  // Resolve stairs from all floors
  const stairs: ResolvedStair[] = [];
  for (const floor of (input.floors || [])) {
    for (const stair of (floor.stairs || [])) {
      stairs.push({
        id: stair.id,
        x: stair.x * scale,
        y: stair.y * scale,
        width: stair.width * scale,
        height: stair.height * scale,
        direction: stair.direction || 'up',
        connectsTo: stair.connectsTo,
      });
    }
  }

  const grid = input.grid === false ? false : (input.grid || 100) * scale;
  const dimensions = computeDimensions(rooms, scale, wt);

  return {
    title: input.title,
    scale,
    rooms,
    stairs: stairs.length ? stairs : undefined,
    freeWalls,
    wallThicknessPx: wt,
    grid,
    dimensions,
  };
}

// ── helpers ──

function pt(x: number, y: number): Point {
  return { x, y };
}

function toPoint([cx, cy]: [number, number], scale: number): Point {
  return { x: cx * scale, y: cy * scale };
}

function toRect(x: number, y: number, w: number, h: number, scale: number): Rect {
  return {
    x: x * scale,
    y: y * scale,
    width: w * scale,
    height: h * scale,
  };
}

// ── resolve um cômodo ──

function resolveRoom(
  room: FloorPlanInput['rooms'][number],
  scale: number,
  wallThicknessPx: number
): ResolvedRoom {
  const rect = toRect(room.x, room.y, room.width, room.height, scale);

  // calcula centro para label
  const labelPos = room.label
    ? pt(rect.x + room.label.x * scale, rect.y + room.label.y * scale)
    : pt(rect.x + rect.width / 2, rect.y + rect.height / 2);

  // resolve portas/janelas em coordenadas de tela
  const doors = resolveDoorOpenings(room, rect, wallThicknessPx, scale);
  const windows = resolveWindowOpenings(room, rect, scale);

  // gera segmentos de parede (paredes visíveis, cortadas nas aberturas)
  const wallSegments = computeWallSegments(rect, doors, windows, wallThicknessPx);

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

// ── portas ──

function resolveDoorOpenings(
  room: FloorPlanInput['rooms'][number],
  rect: Rect,
  wallThicknessPx: number,
  scale: number
): ResolvedDoor[] {
  return (room.doors || []).map((door) => {
    const { start, end } = openingOnWall(door.wall, rect, door.offset * scale, door.width * scale);
    const swingArcs = computeSwingArcs(door, start, end, wallThicknessPx);
    return { wall: door.wall, start, end, swingArcs, type: door.type };
  });
}

function computeSwingArcs(
  door: { wall: WallDirection; swing: string; width: number; type?: string },
  start: Point,
  end: Point,
  wallThicknessPx: number
): Arc[] {
  const doorWidthPx = Math.abs(
    door.wall === 'north' || door.wall === 'south'
      ? end.x - start.x
      : end.y - start.y
  );

  if (door.type === 'sliding') {
    return []; // porta de correr: sem arco de swing
  }

  // vetor que aponta para dentro do cômodo a partir da parede
  let inX = 0, inY = 0;
  switch (door.wall) {
    case 'north': inX = 0; inY = 1; break;   // para baixo
    case 'south': inX = 0; inY = -1; break;   // para cima
    case 'east':  inX = -1; inY = 0; break;   // para esquerda
    case 'west':  inX = 1; inY = 0; break;    // para direita
  }

  if (door.type === 'double') {
    // porta dupla: duas folhas que se encontram no meio
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const halfR = doorWidthPx / 2;

    // folha esquerda: dobradiça em start, abre para dentro
    const leftArc = buildArc(start.x, start.y, halfR, midX, midY, inX, inY, halfR);
    // folha direita: dobradiça em end, abre para dentro
    const rightArc = buildArc(end.x, end.y, halfR, midX, midY, inX, inY, halfR);

    return [leftArc, rightArc];
  }

  // porta simples (pivot)
  const hingeIsStart = door.swing === 'left';
  const hingeX = hingeIsStart ? start.x : end.x;
  const hingeY = hingeIsStart ? start.y : end.y;
  const closedX = hingeIsStart ? end.x : start.x;
  const closedY = hingeIsStart ? end.y : start.y;

  const arc = buildArc(hingeX, hingeY, doorWidthPx, closedX, closedY, inX, inY, doorWidthPx);
  return [arc];
}

function buildArc(
  cx: number, cy: number,   // centro = dobradiça
  r: number,                // raio
  closedX: number, closedY: number, // ponta da folha fechada (sobre a parede)
  inX: number, inY: number, // vetor unitário para dentro do cômodo
  inDist: number            // distância para dentro do cômodo
): Arc {
  const openX = cx + inX * inDist;
  const openY = cy + inY * inDist;

  // sweep flag via cross product: (closed-c) × (open-c)
  // se > 0 → counterclockwise (SVG sweep=0)
  // se < 0 → clockwise (SVG sweep=1)
  const v1x = closedX - cx;
  const v1y = closedY - cy;
  const v2x = openX - cx;
  const v2y = openY - cy;
  const cross = v1x * v2y - v1y * v2x;
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

// ── janelas ──

function resolveWindowOpenings(
  room: FloorPlanInput['rooms'][number],
  rect: Rect,
  scale: number
): ResolvedWindow[] {
  return (room.windows || []).map((win) => {
    const { start, end } = openingOnWall(win.wall, rect, win.offset * scale, win.width * scale);
    return { wall: win.wall, start, end };
  });
}

// ── calcula posição de abertura (porta/janela) em uma parede ──

function openingOnWall(
  wall: WallDirection,
  rect: Rect,
  offsetPx: number,
  widthPx: number
): { start: Point; end: Point } {
  switch (wall) {
    case 'north':
      return {
        start: pt(rect.x + offsetPx, rect.y),
        end: pt(rect.x + offsetPx + widthPx, rect.y),
      };
    case 'south':
      return {
        start: pt(rect.x + offsetPx, rect.y + rect.height),
        end: pt(rect.x + offsetPx + widthPx, rect.y + rect.height),
      };
    case 'east':
      return {
        start: pt(rect.x + rect.width, rect.y + offsetPx),
        end: pt(rect.x + rect.width, rect.y + offsetPx + widthPx),
      };
    case 'west':
      return {
        start: pt(rect.x, rect.y + offsetPx),
        end: pt(rect.x, rect.y + offsetPx + widthPx),
      };
  }
}

// ── segmentos de parede (com cortes para aberturas) ──

interface Opening {
  start: Point;
  end: Point;
}

function computeWallSegments(
  rect: Rect,
  doors: ResolvedDoor[],
  windows: ResolvedWindow[],
  wallThicknessPx: number
): WallSegment[] {
  const segments: WallSegment[] = [];

  const allOpenings: { wall: WallDirection; start: Point; end: Point }[] = [
    ...doors.map((d) => ({ wall: d.wall, start: d.start, end: d.end })),
    ...windows.map((w) => ({ wall: w.wall, start: w.start, end: w.end })),
  ];

  const edges: { dir: WallDirection; from: Point; to: Point }[] = [
    { dir: 'north', from: pt(rect.x, rect.y), to: pt(rect.x + rect.width, rect.y) },
    { dir: 'south', from: pt(rect.x, rect.y + rect.height), to: pt(rect.x + rect.width, rect.y + rect.height) },
    { dir: 'west', from: pt(rect.x, rect.y), to: pt(rect.x, rect.y + rect.height) },
    { dir: 'east', from: pt(rect.x + rect.width, rect.y), to: pt(rect.x + rect.width, rect.y + rect.height) },
  ];

  for (const edge of edges) {
    const openingsOnEdge = allOpenings
      .filter((o) => o.wall === edge.dir)
      .sort((a, b) => {
        const isHorizontal = edge.dir === 'north' || edge.dir === 'south';
        return isHorizontal
          ? a.start.x - b.start.x
          : a.start.y - b.start.y;
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

    const isHorizontal = edge.dir === 'north' || edge.dir === 'south';
    let current = isHorizontal ? edge.from.x : edge.from.y;
    const max = isHorizontal ? edge.to.x : edge.to.y;

    for (const op of openingsOnEdge) {
      const opStart = isHorizontal ? op.start.x : op.start.y;
      const opEnd = isHorizontal ? op.end.x : op.end.y;

      if (opStart > current) {
        segments.push({
          x1: isHorizontal ? current : edge.from.x,
          y1: isHorizontal ? edge.from.y : current,
          x2: isHorizontal ? opStart : edge.from.x,
          y2: isHorizontal ? edge.from.y : opStart,
          direction: edge.dir,
        });
      }
      current = Math.max(current, opEnd);
    }

    if (current < max) {
      segments.push({
        x1: isHorizontal ? current : edge.from.x,
        y1: isHorizontal ? edge.from.y : current,
        x2: edge.to.x,
        y2: edge.to.y,
        direction: edge.dir,
      });
    }
  }

  return segments;
}

// ── cotas (dimensionamento externo) ──

function computeDimensions(
  rooms: ResolvedRoom[],
  scale: number,
  wallThicknessPx: number
): Dimension[] {
  const dims: Dimension[] = [];

  // bounding box total de todos os cômodos
  if (rooms.length === 0) return dims;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const room of rooms) {
    minX = Math.min(minX, room.rect.x);
    minY = Math.min(minY, room.rect.y);
    maxX = Math.max(maxX, room.rect.x + room.rect.width);
    maxY = Math.max(maxY, room.rect.y + room.rect.height);
  }

  const offset = 40; // px de distância das paredes para as cotas
  const tickSize = 8; // px dos marcadores

  // cota horizontal (base)
  dims.push({
    x1: minX,
    y1: maxY + offset,
    x2: maxX,
    y2: maxY + offset,
    value: `${((maxX - minX) / scale / 100).toFixed(2)} m`,
    offset,
  });

  // cota vertical (direita)
  dims.push({
    x1: maxX + offset,
    y1: minY,
    x2: maxX + offset,
    y2: maxY,
    value: `${((maxY - minY) / scale / 100).toFixed(2)} m`,
    offset,
  });

  return dims;
}
