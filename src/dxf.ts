import type { ResolvedFloorPlan, ResolvedRoom, ResolvedDoor, WallSegment, Dimension, Arc } from './types';

function d(px: number, scale: number): string {
  return (px / scale).toFixed(2);
}

function fmtAngle(rad: number): string {
  let deg = rad * 180 / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return deg.toFixed(4);
}

export function exportDXF(input: ResolvedFloorPlan): string {
  const { scale } = input;
  const out: string[] = [];

  out.push(
    '  0', 'SECTION', '  2', 'HEADER',
    '  0', 'ENDSEC',
    '  0', 'SECTION', '  2', 'TABLES',
    '  0', 'TABLE', '  2', 'LAYER'
  );

  const layers = ['WALLS', 'DOORS', 'WINDOWS', 'TEXT', 'DIMENSIONS'];
  for (const layer of layers) {
    out.push('  0', 'LAYER', '  2', layer, ' 70', '0');
  }

  out.push(
    '  0', 'ENDTAB',
    '  0', 'ENDSEC',
    '  0', 'SECTION', '  2', 'ENTITIES'
  );

  // paredes (segmentos de cada cômodo)
  for (const room of input.rooms) {
    for (const seg of room.wallRects) {
      out.push(
        '  0', 'LINE', '  8', 'WALLS',
        ' 10', d(seg.x1, scale), ' 20', d(seg.y1, scale),
        ' 11', d(seg.x2, scale), ' 21', d(seg.y2, scale)
      );
    }
  }

  // paredes avulsas
  for (const fw of input.freeWalls) {
    out.push(
      '  0', 'LINE', '  8', 'WALLS',
      ' 10', d(fw.from.x, scale), ' 20', d(fw.from.y, scale),
      ' 11', d(fw.to.x, scale), ' 21', d(fw.to.y, scale)
    );
  }

  // arcos das portas
  for (const room of input.rooms) {
    for (const door of room.doors) {
      for (const arc of door.swingArcs) {
        if (arc.r <= 0) continue;

        const startRad = Math.atan2(arc.y1 - arc.cy, arc.x1 - arc.cx);
        const endRad = Math.atan2(arc.y2 - arc.cy, arc.x2 - arc.cx);

        let sa: number, ea: number;
        if (arc.sweep === 1) {
          // SVG CW → DXF CCW trocando ordem
          sa = endRad;
          ea = startRad;
        } else {
          sa = startRad;
          ea = endRad;
        }

        out.push(
          '  0', 'ARC', '  8', 'DOORS',
          ' 10', d(arc.cx, scale), ' 20', d(arc.cy, scale),
          ' 40', d(arc.r, scale),
          ' 50', fmtAngle(sa), ' 51', fmtAngle(ea)
        );
      }
    }
  }

  // labels dos cômodos
  for (const room of input.rooms) {
    out.push(
      '  0', 'TEXT', '  8', 'TEXT',
      ' 10', d(room.labelPos.x, scale), ' 20', d(room.labelPos.y, scale),
      ' 40', d(12 * scale, scale),
      '  1', room.name
    );
  }

  // cotas
  for (const dim of input.dimensions) {
    const isH = Math.abs(dim.y2 - dim.y1) < Math.abs(dim.x2 - dim.x1);
    const tickCm = 7 / scale;

    // linha principal
    out.push(
      '  0', 'LINE', '  8', 'DIMENSIONS',
      ' 10', d(dim.x1, scale), ' 20', d(dim.y1, scale),
      ' 11', d(dim.x2, scale), ' 21', d(dim.y2, scale)
    );

    // ticks
    if (isH) {
      out.push(
        '  0', 'LINE', '  8', 'DIMENSIONS',
        ' 10', d(dim.x1, scale), ' 20', d(dim.y1 - tickCm, scale),
        ' 11', d(dim.x1, scale), ' 21', d(dim.y1 + tickCm, scale)
      );
      out.push(
        '  0', 'LINE', '  8', 'DIMENSIONS',
        ' 10', d(dim.x2, scale), ' 20', d(dim.y2 - tickCm, scale),
        ' 11', d(dim.x2, scale), ' 21', d(dim.y2 + tickCm, scale)
      );
    } else {
      out.push(
        '  0', 'LINE', '  8', 'DIMENSIONS',
        ' 10', d(dim.x1 - tickCm, scale), ' 20', d(dim.y1, scale),
        ' 11', d(dim.x1 + tickCm, scale), ' 21', d(dim.y1, scale)
      );
      out.push(
        '  0', 'LINE', '  8', 'DIMENSIONS',
        ' 10', d(dim.x2 - tickCm, scale), ' 20', d(dim.y2, scale),
        ' 11', d(dim.x2 + tickCm, scale), ' 21', d(dim.y2, scale)
      );
    }

    // texto da cota
    const mx = (dim.x1 + dim.x2) / 2;
    const my = (dim.y1 + dim.y2) / 2;
    const textOff = 14 / scale;
    const tx = isH ? mx : mx + textOff;
    const ty = isH ? my - textOff : my;

    out.push(
      '  0', 'TEXT', '  8', 'DIMENSIONS',
      ' 10', d(tx, scale), ' 20', d(ty, scale),
      ' 40', d(8 * scale, scale),
      '  1', dim.value
    );
  }

  out.push(
    '  0', 'ENDSEC',
    '  0', 'EOF'
  );

  return out.join('\r\n');
}
