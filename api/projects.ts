import { z } from 'zod';
import { parseFloorPlan, planStats } from '../src/index';
import type { Db, ProjectRow } from './db';

/**
 * Payload de gravação. O YAML é validado pela própria engine (`parseFloorPlan`,
 * que já é Zod + YAML) em vez de por um schema paralelo — assim é impossível
 * gravar na nuvem uma planta que o renderizador recusaria depois.
 */
export const projectInputSchema = z.object({
  title: z.string().trim().min(1, 'title é obrigatório').max(200),
  yaml: z.string().min(1, 'yaml é obrigatório').max(1_000_000),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const shareInputSchema = z.object({
  is_public: z.boolean(),
});

/** Limite por conta gratuita, para o D1 não virar depósito ilimitado. */
export const FREE_PROJECT_LIMIT = 50;

export class ValidationError extends Error {
  constructor(message: string, readonly details: string[]) {
    super(message);
  }
}

/** Valida o YAML pela engine e devolve as colunas derivadas. */
export function deriveFromYaml(yaml: string): { areaM2: number; roomCount: number } {
  let plan;
  try {
    plan = parseFloorPlan(yaml);
  } catch (e) {
    const err = e as { issues?: Array<{ path: (string | number)[]; message: string }>; message?: string };
    const details = err.issues
      ? err.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
      : [err.message ?? 'YAML inválido'];
    throw new ValidationError('YAML de planta inválido', details);
  }
  const stats = planStats(plan);
  return { areaM2: stats.areaM2, roomCount: stats.roomCount };
}

/**
 * Slug de compartilhamento: 16 hex de aleatoriedade criptográfica.
 * Não deriva do id do projeto nem do usuário — um slug público não deve
 * permitir adivinhar ou enumerar os outros.
 */
export function newShareSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function publicProjectView(p: ProjectRow) {
  return {
    title: p.title,
    yaml: p.yaml,
    area_m2: p.area_m2,
    room_count: p.room_count,
    updated_at: p.updated_at,
  };
}

export async function createProject(
  db: Db,
  userId: string,
  input: ProjectInput,
  now: number,
): Promise<ProjectRow> {
  const { areaM2, roomCount } = deriveFromYaml(input.yaml);
  const row: ProjectRow = {
    id: crypto.randomUUID(),
    user_id: userId,
    title: input.title,
    yaml: input.yaml,
    thumbnail_key: null,
    area_m2: areaM2,
    room_count: roomCount,
    is_public: 0,
    share_slug: null,
    created_at: now,
    updated_at: now,
  };
  await db.insertProject(row);
  return row;
}
