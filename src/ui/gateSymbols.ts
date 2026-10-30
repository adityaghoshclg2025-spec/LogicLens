/**
 * Standard IEEE/ANSI Digital Logic Gate Symbol SVG Renderer
 * 
 * Provides vector paths for standard digital logic gate symbols:
 * - AND: Flat input side, straight top/bottom, curved semicircular output side.
 * - OR: Concave curved input side, pointed output side.
 * - NOT: Right-pointing triangle with inversion bubble at output.
 * - BUFFER: Right-pointing triangle without bubble.
 * - NAND: AND symbol with inversion bubble.
 * - NOR: OR symbol with inversion bubble.
 * - XOR: OR symbol with an additional curved input line.
 * - XNOR: XOR symbol with an inversion bubble.
 */

export interface GateSymbolOptions {
  type: string;
  width: number;
  height: number;
  inputCount: number;
  isSelected?: boolean;
  inputCoords: Array<{ x: number; y: number }>;
  outputCoord: { x: number; y: number };
  mode?: 'editor' | 'schematic';
}

export function renderGateSymbolSVG(options: GateSymbolOptions): string {
  const { type, width, height, isSelected, inputCoords, outputCoord, mode = 'editor' } = options;
  const upperType = type.toUpperCase();
  const isSchematic = mode === 'schematic';

  // Body bounds
  const gateLeft = 26;
  const gateRight = upperType.includes('NAND') || upperType.includes('NOR') || upperType.includes('XNOR') || upperType === 'NOT'
    ? width - 28
    : width - 22;
  
  const midY = outputCoord.y;
  
  // Calculate symbol vertical bounds based on input pins
  const firstInY = inputCoords.length > 0 ? inputCoords[0].y : midY - 18;
  const lastInY = inputCoords.length > 0 ? inputCoords[inputCoords.length - 1].y : midY + 18;
  
  const topY = Math.min(firstInY - 10, midY - 24);
  const bottomY = Math.max(lastInY + 10, midY + 24);
  const gateHeight = bottomY - topY;

  const bubbleRadius = 4;
  
  // Colors & stroke: high-contrast schematic stroke vs editor dark theme
  let strokeColor = '#94a3b8';
  let fillColor = isSchematic ? '#0d131f' : '#111827';
  if (isSelected) {
    strokeColor = 'var(--accent-cyan, #38bdf8)';
  } else if (isSchematic) {
    strokeColor = '#e2e8f0'; // Crisp white/slate in schematic mode
  }

  const strokeWidth = isSelected ? 2.5 : 2;

  let bodyPath = '';
  let extraElements = '';
  let bubbleCenter: { x: number; y: number } | null = null;
  let bodyRightX = gateRight;

  switch (upperType) {
    case 'AND':
    case 'NAND': {
      // Flat input side on left, horizontal top/bottom, semicircular right curve
      const straightRight = gateLeft + (gateRight - gateLeft) * 0.45;
      const radius = gateHeight / 2;
      bodyPath = `
        M ${gateLeft} ${topY}
        H ${straightRight}
        A ${radius} ${radius} 0 0 1 ${straightRight} ${bottomY}
        H ${gateLeft}
        Z
      `;
      bodyRightX = straightRight + radius;
      if (upperType === 'NAND') {
        bubbleCenter = { x: bodyRightX + bubbleRadius + 1, y: midY };
      }
      break;
    }

    case 'OR':
    case 'NOR': {
      // Concave input curve on left, curved top and bottom meeting at pointed tip
      const curveDepth = 14;
      bodyPath = `
        M ${gateLeft} ${topY}
        Q ${gateLeft + curveDepth} ${midY} ${gateLeft} ${bottomY}
        Q ${gateLeft + (gateRight - gateLeft) * 0.55} ${bottomY} ${gateRight} ${midY}
        Q ${gateLeft + (gateRight - gateLeft) * 0.55} ${topY} ${gateLeft} ${topY}
        Z
      `;
      bodyRightX = gateRight;
      if (upperType === 'NOR') {
        bubbleCenter = { x: bodyRightX + bubbleRadius + 1, y: midY };
      }
      break;
    }

    case 'XOR':
    case 'XNOR': {
      // Additional curved line on left (offset 8px to the left of the OR gate body)
      const xorLeft = gateLeft + 8;
      const curveDepth = 14;
      bodyPath = `
        M ${xorLeft} ${topY}
        Q ${xorLeft + curveDepth} ${midY} ${xorLeft} ${bottomY}
        Q ${xorLeft + (gateRight - xorLeft) * 0.55} ${bottomY} ${gateRight} ${midY}
        Q ${xorLeft + (gateRight - xorLeft) * 0.55} ${topY} ${xorLeft} ${topY}
        Z
      `;
      bodyRightX = gateRight;

      // The distinct XOR outer curved line
      const arcOffset = 8;
      extraElements += `
        <path d="M ${xorLeft - arcOffset} ${topY} Q ${xorLeft - arcOffset + curveDepth} ${midY} ${xorLeft - arcOffset} ${bottomY}"
              fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" />
      `;

      if (upperType === 'XNOR') {
        bubbleCenter = { x: bodyRightX + bubbleRadius + 1, y: midY };
      }
      break;
    }

    case 'NOT': {
      // Right-pointing triangle with inversion bubble
      const triRight = gateRight - 6;
      bodyPath = `
        M ${gateLeft} ${topY + 2}
        L ${triRight} ${midY}
        L ${gateLeft} ${bottomY - 2}
        Z
      `;
      bodyRightX = triRight;
      bubbleCenter = { x: bodyRightX + bubbleRadius + 1, y: midY };
      break;
    }

    case 'BUFFER': {
      // Right-pointing triangle
      bodyPath = `
        M ${gateLeft} ${topY + 2}
        L ${gateRight} ${midY}
        L ${gateLeft} ${bottomY - 2}
        Z
      `;
      bodyRightX = gateRight;
      break;
    }

    default:
      return '';
  }

  // Draw input lead lines from exact port coordinate (x=0) to gate body
  let leadLines = '';
  inputCoords.forEach((coord) => {
    let connectX = gateLeft;
    if (upperType === 'OR' || upperType === 'NOR') {
      const t = Math.max(0, Math.min(1, (coord.y - topY) / (bottomY - topY)));
      const arcInward = 4 * 14 * t * (1 - t);
      connectX = gateLeft + arcInward;
    } else if (upperType === 'XOR' || upperType === 'XNOR') {
      const xorLeft = gateLeft + 8;
      const t = Math.max(0, Math.min(1, (coord.y - topY) / (bottomY - topY)));
      const arcInward = 4 * 14 * t * (1 - t);
      connectX = (xorLeft - 8) + arcInward;
    }

    leadLines += `
      <line x1="0" y1="${coord.y}" x2="${connectX}" y2="${coord.y}"
            stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" />
    `;
  });

  // Output lead line from gate tip/bubble to exact output coordinate (x=width)
  const outputStartX = bubbleCenter ? bubbleCenter.x + bubbleRadius : bodyRightX;
  leadLines += `
    <line x1="${outputStartX}" y1="${outputCoord.y}" x2="${width}" y2="${outputCoord.y}"
          stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" />
  `;

  // Draw inversion bubble if present
  let bubbleSVG = '';
  if (bubbleCenter) {
    bubbleSVG = `
      <circle cx="${bubbleCenter.x}" cy="${bubbleCenter.y}" r="${bubbleRadius}"
              fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
    `;
  }

  const filterAttr = isSelected ? 'filter="drop-shadow(0 0 6px rgba(56, 189, 248, 0.6))"' : '';

  return `
    <svg class="gate-symbol-svg ${isSchematic ? 'schematic-gate' : ''}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
         style="position:absolute; top:0; left:0; width:${width}px; height:${height}px; pointer-events:none;" ${filterAttr}>
      <!-- Pin Lead Wires -->
      ${leadLines}
      <!-- Gate Body -->
      <path d="${bodyPath.trim()}"
            fill="${fillColor}"
            stroke="${strokeColor}"
            stroke-width="${strokeWidth}"
            stroke-linejoin="round"
            stroke-linecap="round" />
      <!-- Extra Symbol Accents (e.g. XOR outer arc) -->
      ${extraElements}
      <!-- Inversion Bubble -->
      ${bubbleSVG}
    </svg>
  `;
}
