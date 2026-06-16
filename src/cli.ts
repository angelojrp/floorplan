#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { render } from './index';

const program = new Command();

program
  .name('floorplan')
  .description('Renderiza plantas baixas descritas em YAML/JSON como SVG')
  .version('0.1.0')
  .argument('<input>', 'Arquivo YAML ou JSON de entrada')
  .option('-o, --output <file>', 'Arquivo SVG de saída (padrão: stdout)')
  .option('-f, --format <format>', 'Formato de entrada: yaml ou json (padrão: detecta pela extensão)')
  .action((inputFile: string, options: { output?: string; format?: string }) => {
    try {
      const filePath = resolve(process.cwd(), inputFile);
      const content = readFileSync(filePath, 'utf-8');

      const format =
        options.format ||
        (filePath.endsWith('.json') ? 'json' : 'yaml');

      const svg = render(content, { format });

      if (options.output) {
        const outPath = resolve(process.cwd(), options.output);
        writeFileSync(outPath, svg, 'utf-8');
        console.log(`SVG salvo em: ${outPath}`);
      } else {
        process.stdout.write(svg);
      }
    } catch (err: any) {
      console.error('Erro:', err.message);
      process.exit(1);
    }
  });

program.parse();
