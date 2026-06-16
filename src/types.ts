// ── Tipos fundamentais do DSL de planta baixa ──

export type WallDirection = 'north' | 'south' | 'east' | 'west';

export interface Door {
  wall: WallDirection;
  offset: number; // cm — distância da extremidade esquerda/inferior da parede
  width: number;  // cm — largura da porta
  type: 'pivot' | 'sliding' | 'double';
  swing: 'left' | 'right' | 'none';
}

export interface Window {
  wall: WallDirection;
  offset: number; // cm
  width: number;  // cm
  height: number; // cm — altura da janela
  sill: number;   // cm — altura do peitoril em relação ao chão
}

export interface Room {
  id: string;
  name: string;
  x: number;      // cm
  y: number;      // cm
  width: number;  // cm
  height: number; // cm
  doors?: Door[];
  windows?: Window[];
  area?: string;  // descrição opcional de área (ex: "12.5 m²")
  label?: {
    x: number; // posição relativa ao canto superior esquerdo do cômodo (cm)
    y: number;
  };
  hatch?: 'solid' | 'diagonal' | 'cross' | 'dots' | 'horizontal' | 'vertical';
}

export interface FreeWall {
  from: [number, number]; // cm
  to: [number, number];   // cm
  thickness?: number;     // cm — padrão = 15
}

export interface FloorPlanInput {
  version: number;
  title?: string;
  scale: number;          // px por cm (ex: 2 = 1:50, 1 = 1:100, 0.5 = 1:200)
  wallThickness?: number; // cm — padrão = 15
  grid?: number | false;  // espaçamento do grid em cm — false desabilita
  rooms: Room[];
  walls?: FreeWall[];     // paredes avulsas (ex: muros externos)
}

// ── Tipos geométricos internos (pós-layout) ──

export interface Point {
  x: number; // px
  y: number; // px
}

export interface Rect {
  x: number; // px
  y: number;
  width: number;
  height: number;
}

export interface ResolvedDoor {
  wall: WallDirection;
  start: Point;   // px — ponto inicial da abertura
  end: Point;     // px — ponto final da abertura
  swingArcs: Arc[]; // arcos de abertura (1 para pivot, 0 para sliding, 2 para double)
  type: Door['type'];
}

export interface Arc {
  cx: number; cy: number;   // centro do arco (dobradiça)
  r: number;                // raio (largura da folha da porta)
  x1: number; y1: number;   // ponto inicial (folha fechada)
  x2: number; y2: number;   // ponto final (folha aberta a 90°)
  sweep: number;            // SVG sweep-flag (0 ou 1)
}

export interface ResolvedWindow {
  wall: WallDirection;
  start: Point;
  end: Point;
}

export interface ResolvedRoom {
  id: string;
  name: string;
  rect: Rect;         // bounding box do cômodo
  wallRects: WallSegment[]; // segmentos de parede (já com cortes de portas/janelas)
  doors: ResolvedDoor[];
  windows: ResolvedWindow[];
  labelPos: Point;
  hatch?: Room['hatch'];
}

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  direction: WallDirection;
}

export interface ResolvedFreeWall {
  from: Point;
  to: Point;
  thickness: number;
}

export interface ResolvedFloorPlan {
  title?: string;
  scale: number;
  rooms: ResolvedRoom[];
  freeWalls: ResolvedFreeWall[];
  wallThicknessPx: number;  // espessura da parede em px
  grid: number | false;     // px do grid
  dimensions: Dimension[];  // cotas calculadas
}

export interface Dimension {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  value: string; // texto da cota (ex: "5.00 m")
  offset: number; // distância do cômodo para linha da cota
}
