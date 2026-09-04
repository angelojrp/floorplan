import type { FloorPlanInput } from './types';

export interface PlanStats {
  /** Número de cômodos, somando todos os pavimentos. */
  roomCount: number;
  /** Área construída em m², somando todos os pavimentos. */
  areaM2: number;
}

/** Forma mínima de que as estatísticas precisam — um cômodo com dimensões em cm. */
interface RoomLike {
  width: number;
  height: number;
}

/**
 * Estatísticas derivadas de uma planta, em unidades do usuário (cm → m²).
 *
 * Deliberadamente calculadas sobre o input em cm, e não sobre o layout
 * resolvido em px, para não dependerem da `scale`. Aceita tanto um
 * `FloorPlanInput` já parseado (onde o parser achata os cômodos de todos os
 * pavimentos em `rooms`) quanto qualquer objeto com uma lista de cômodos —
 * é assim que o editor reaproveita a mesma conta sem serializar para YAML.
 */
export function planStats(plan: { rooms?: RoomLike[] } | FloorPlanInput): PlanStats {
  const rooms = (plan as { rooms?: RoomLike[] }).rooms ?? [];
  let cm2 = 0;
  for (const room of rooms) cm2 += room.width * room.height;
  return {
    roomCount: rooms.length,
    // Uma casa decimal, a mesma precisão que o editor e o PDF já exibem.
    areaM2: Math.round(cm2 / 10000 * 10) / 10,
  };
}
