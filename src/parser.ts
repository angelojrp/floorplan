import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import type { FloorPlanInput } from './types';

// ── Schemas Zod para validação ──

const wallDirectionSchema = z.enum(['north', 'south', 'east', 'west']);

const doorSchema = z.object({
  wall: wallDirectionSchema,
  offset: z.number().min(0),
  width: z.number().positive(),
  type: z.enum(['pivot', 'sliding', 'double']).default('pivot'),
  swing: z.enum(['left', 'right', 'none']).default('left'),
});

const windowSchema = z.object({
  wall: wallDirectionSchema,
  offset: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive().optional(),
  sill: z.number().min(0).optional(),
});

const labelSchema = z.object({
  x: z.number(),
  y: z.number(),
}).optional();

const roomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  doors: z.array(doorSchema).optional().default([]),
  windows: z.array(windowSchema).optional().default([]),
  area: z.string().optional(),
  label: labelSchema,
  hatch: z.enum(['solid', 'diagonal', 'cross', 'dots', 'horizontal', 'vertical']).optional(),
});

const freeWallSchema = z.object({
  from: z.tuple([z.number(), z.number()]),
  to: z.tuple([z.number(), z.number()]),
  thickness: z.number().positive().optional(),
});

const stairSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  direction: z.enum(['up', 'down']).default('up'),
  connectsTo: z.string().optional(),
});

const floorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().default(0),
  rooms: z.array(roomSchema).min(1),
  stairs: z.array(stairSchema).optional().default([]),
});

const floorPlanSchema = z.object({
  version: z.literal(1),
  title: z.string().optional(),
  scale: z.number().positive(),
  wallThickness: z.number().positive().optional().default(15),
  grid: z.union([z.number().positive(), z.literal(false)]).optional().default(100),
  rooms: z.array(roomSchema).optional(),
  floors: z.array(floorSchema).optional(),
  walls: z.array(freeWallSchema).optional().default([]),
  lot: z.object({ width: z.number().positive(), height: z.number().positive() }).optional(),
});

// ── Funções públicas ──

export function parseFloorPlanYaml(yamlString: string): FloorPlanInput {
  const raw = parseYaml(yamlString);
  if (raw === null || raw === undefined) {
    throw new Error('YAML vazio ou inválido');
  }
  const parsed = floorPlanSchema.parse(raw) as any;
  
  // Normalize: if flat rooms (old format), auto-wrap into floors
  if (parsed.rooms && !parsed.floors) {
    parsed.floors = [{
      id: 'main',
      name: 'Térreo',
      level: 0,
      rooms: parsed.rooms,
      stairs: []
    }];
  }
  
  // Flatten all rooms for backward compat access
  if (parsed.floors) {
    parsed.rooms = [];
    for (const floor of parsed.floors) {
      for (const room of (floor.rooms || [])) {
        parsed.rooms.push(room);
      }
    }
  }
  
  return parsed as FloorPlanInput;
}

export function parseFloorPlanJson(jsonString: string): FloorPlanInput {
  const raw = JSON.parse(jsonString);
  return floorPlanSchema.parse(raw) as FloorPlanInput;
}

export function parseFloorPlan(input: string, format: 'yaml' | 'json' = 'yaml'): FloorPlanInput {
  return format === 'yaml' ? parseFloorPlanYaml(input) : parseFloorPlanJson(input);
}
