import { parseFloorPlan } from './parser';
import { resolveLayout } from './layout';
import { renderSvg } from './renderer';
import type { FloorPlanInput } from './types';

export interface RenderOptions {
  format?: string; // 'yaml' | 'json'
}

/**
 * Renderiza uma string YAML/JSON de planta baixa como SVG.
 */
export function render(input: string, options: RenderOptions = {}): string {
  const format: 'yaml' | 'json' = (options.format as 'yaml' | 'json') || (input.trimStart().startsWith('{') ? 'json' : 'yaml');
  const plan: FloorPlanInput = parseFloorPlan(input, format);
  const layout = resolveLayout(plan);
  return renderSvg(layout);
}

export { parseFloorPlan } from './parser';
export { resolveLayout } from './layout';
export { renderSvg } from './renderer';
export { exportDXF } from './dxf';
export * from './types';
