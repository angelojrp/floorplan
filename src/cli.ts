#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { render, parseFloorPlan, generateMemorial, calculateMaterials, formatMaterials, checkSetbacks, formatSetbacks } from './index';

const program = new Command();

program
  .name('floorplan')
  .description('Renderiza plantas baixas descritas em YAML/JSON como SVG')
  .version('0.1.0')
  .argument('<input>', 'Arquivo YAML ou JSON de entrada')
  .option('-o, --output <file>', 'Arquivo SVG de saída (padrão: stdout)')
  .option('-f, --format <format>', 'Formato de entrada: yaml ou json (padrão: detecta pela extensão)')
  .option('-t, --tool <tool>', 'Ferramenta de apoio: memorial | materiais | recuos (em vez de SVG)')
  .option('--wall-height <m>', 'Pé-direito em metros (materiais)', parseFloat)
  .option('--front <m>', 'Recuo frontal mínimo em metros (recuos)', parseFloat)
  .option('--side <m>', 'Recuo lateral mínimo em metros (recuos)', parseFloat)
  .option('--back <m>', 'Recuo de fundos mínimo em metros (recuos)', parseFloat)
  .option('--max-occupancy <ratio>', 'Taxa de ocupação máxima, ex.: 0.6 (recuos)', parseFloat)
  .action((inputFile: string, options: any) => {
    try {
      const filePath = resolve(process.cwd(), inputFile);
      const content = readFileSync(filePath, 'utf-8');

      const format =
        options.format ||
        (filePath.endsWith('.json') ? 'json' : 'yaml');

      let svg: string;
      if (options.tool) {
        const plan = parseFloorPlan(content, format as 'yaml' | 'json');
        if (options.tool === 'memorial') svg = generateMemorial(plan);
        else if (options.tool === 'materiais') svg = formatMaterials(calculateMaterials(plan, { wallHeight: options.wallHeight })) + '\n';
        else if (options.tool === 'recuos') svg = formatSetbacks(checkSetbacks(plan, { front: options.front, side: options.side, back: options.back, maxOccupancy: options.maxOccupancy })) + '\n';
        else throw new Error('Ferramenta desconhecida: ' + options.tool);
      } else {
        svg = render(content, { format });
      }

      if (options.output) {
        const outPath = resolve(process.cwd(), options.output);
        writeFileSync(outPath, svg, 'utf-8');
        console.log(`Saída salva em: ${outPath}`);
      } else {
        process.stdout.write(svg);
      }
    } catch (err: any) {
      console.error('Erro:', err.message);
      process.exit(1);
    }
  });

program.parse();
