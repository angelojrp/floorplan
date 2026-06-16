import type { FloorPlanInput } from './types';

export interface PDFOptions {
  pageSize?: 'A4' | 'A3';
  orientation?: 'portrait' | 'landscape';
  author?: string;
}

/**
 * Gera uma página HTML completa com layout profissional de impressao,
 * incluindo carimbo, legenda e barra de escala.
 * Abra o HTML gerado no navegador e use Ctrl+P para salvar como PDF.
 */
export function renderPDFHtml(input: FloorPlanInput, svgString: string, options: PDFOptions = {}): string {
  const {
    pageSize = 'A3',
    orientation = 'landscape',
    author = 'Floorplan'
  } = options;

  const title = input.title || 'Planta Baixa';
  const rooms = input.rooms || [];
  const totalArea = rooms.reduce((sum, r) => sum + r.width * r.height, 0) / 10000;
  const roomNames = rooms.map(r => esc(r.name)).join(' | ');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    @page { size: ${pageSize} ${orientation}; margin: 15mm; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #1a1a2e;
    }
    .page {
      page-break-after: always;
      padding: 10px;
    }
    .title-block {
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .title-block h1 {
      font-size: 24px;
      margin: 0 0 4px 0;
      font-weight: 700;
    }
    .title-block p {
      font-size: 11px;
      color: #555;
      margin: 2px 0;
    }
    .stamp {
      font-size: 9px;
      color: #444;
      text-align: right;
    }
    .stamp table {
      border-collapse: collapse;
      margin-left: auto;
    }
    .stamp td {
      padding: 2px 8px;
      border: 1px solid #999;
      font-size: 9px;
      white-space: nowrap;
    }
    .stamp td:first-child {
      font-weight: 600;
      background: #f0f0f0;
    }
    .floor-plan {
      text-align: center;
      margin: 20px 0;
    }
    .floor-plan svg {
      max-width: 100%;
      height: auto;
    }
    .footer {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .legend {
      font-size: 10px;
    }
    .legend strong {
      font-weight: 600;
    }
    .scale-bar {
      text-align: center;
      font-size: 10px;
      color: #555;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="title-block">
      <div>
        <h1>${esc(title)}</h1>
        <p>Escala: 1:50 | Data: ${new Date().toLocaleDateString('pt-BR')}</p>
      </div>
      <div class="stamp">
        <table>
          <tr><td>Projeto:</td><td>${esc(title)}</td></tr>
          <tr><td>Escala:</td><td>1:50</td></tr>
          <tr><td>Data:</td><td>${new Date().toLocaleDateString('pt-BR')}</td></tr>
          <tr><td>&Aacute;rea:</td><td>${totalArea.toFixed(1)} m&sup2;</td></tr>
          <tr><td>Gerado por:</td><td>${esc(author)}</td></tr>
        </table>
      </div>
    </div>

    <div class="floor-plan">
      ${svgString}
    </div>

    <div class="footer">
      <div class="legend">
        <strong>Legenda:</strong> ${roomNames || 'Nenhum c&ocirc;modo'}
      </div>
      <div class="scale-bar">
        &block;&block;&block;&block;&block; 5m &block;&block;&block;&block;&block;
      </div>
    </div>
  </div>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
