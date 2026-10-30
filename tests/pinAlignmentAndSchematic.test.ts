import { describe, it, expect, beforeEach } from 'vitest';
import {
  Circuit,
  AND,
  OR,
  NAND,
  NOR,
  XOR,
  XNOR,
  NOT,
  BUFFER,
  INPUT,
  OUTPUT,
  makeGate,
  generateTruthTable,
  explainCircuit
} from '../src/index.js';
import {
  getComponentDimensions,
  getComponentPinLayout,
  calculatePinWorldCoordinates
} from '../src/ui/componentGeometry.js';
import { renderGateSymbolSVG } from '../src/ui/gateSymbols.js';

describe('Part 1: Pin and Wire Alignment & Authoritative Geometry', () => {
  it('calculates consistent dimensions and pin positions for 2, 3, and 4 input gates', () => {
    // 2-input AND
    const layout2 = getComponentPinLayout('AND', 2, 1);
    expect(layout2.width).toBe(130);
    expect(layout2.height).toBe(76);
    expect(layout2.inputs.length).toBe(2);
    expect(layout2.outputs.length).toBe(1);

    expect(layout2.inputs[0]).toEqual({ pinType: 'input', pinIndex: 0, x: 0, y: 34, label: 'A' });
    expect(layout2.inputs[1]).toEqual({ pinType: 'input', pinIndex: 1, x: 0, y: 58, label: 'B' });
    expect(layout2.outputs[0]).toEqual({ pinType: 'output', pinIndex: 0, x: 130, y: 46, label: 'Y' });

    // 3-input AND
    const layout3 = getComponentPinLayout('AND', 3, 1);
    expect(layout3.width).toBe(130);
    expect(layout3.height).toBe(96); // 76 + 1*20
    expect(layout3.inputs.length).toBe(3);
    expect(layout3.inputs[0]).toEqual({ pinType: 'input', pinIndex: 0, x: 0, y: 34, label: 'A' });
    expect(layout3.inputs[1]).toEqual({ pinType: 'input', pinIndex: 1, x: 0, y: 54, label: 'B' });
    expect(layout3.inputs[2]).toEqual({ pinType: 'input', pinIndex: 2, x: 0, y: 74, label: 'C' });
    expect(layout3.outputs[0]).toEqual({ pinType: 'output', pinIndex: 0, x: 130, y: 54, label: 'Y' });

    // 4-input AND
    const layout4 = getComponentPinLayout('AND', 4, 1);
    expect(layout4.width).toBe(130);
    expect(layout4.height).toBe(116); // 76 + 2*20
    expect(layout4.inputs.length).toBe(4);
    expect(layout4.inputs[0].label).toBe('A');
    expect(layout4.inputs[1].label).toBe('B');
    expect(layout4.inputs[2].label).toBe('C');
    expect(layout4.inputs[3].label).toBe('D');
    expect(layout4.outputs[0].y).toBe(64); // 34 + (3*20)/2 = 64
  });

  it('guarantees world pin coordinates coincide exactly with (comp.x + pin.x, comp.y + pin.y)', () => {
    const compX = 240;
    const compY = 180;

    const in0 = calculatePinWorldCoordinates(compX, compY, 'AND', 2, 1, 'input', 0);
    const in1 = calculatePinWorldCoordinates(compX, compY, 'AND', 2, 1, 'input', 1);
    const out0 = calculatePinWorldCoordinates(compX, compY, 'AND', 2, 1, 'output', 0);

    expect(in0).toEqual({ x: 240, y: 180 + 34 });
    expect(in1).toEqual({ x: 240, y: 180 + 58 });
    expect(out0).toEqual({ x: 240 + 130, y: 180 + 46 });
  });

  it('preserves exact coordinates when a component moves', () => {
    const compX1 = 100;
    const compY1 = 100;
    const p1 = calculatePinWorldCoordinates(compX1, compY1, 'OR', 3, 1, 'input', 1);

    const deltaX = 75;
    const deltaY = -40;
    const p2 = calculatePinWorldCoordinates(compX1 + deltaX, compY1 + deltaY, 'OR', 3, 1, 'input', 1);

    expect(p2.x - p1.x).toBe(deltaX);
    expect(p2.y - p1.y).toBe(deltaY);
  });

  it('provides exact pin geometry for NOT, BUFFER, INPUT, OUTPUT, CLOCK, and DFF', () => {
    // NOT
    const notLayout = getComponentPinLayout('NOT', 1, 1);
    expect(notLayout.inputs[0]).toEqual({ pinType: 'input', pinIndex: 0, x: 0, y: 38, label: 'A' });
    expect(notLayout.outputs[0]).toEqual({ pinType: 'output', pinIndex: 0, x: 120, y: 38, label: 'Y' });

    // BUFFER
    const bufLayout = getComponentPinLayout('BUFFER', 1, 1);
    expect(bufLayout.inputs[0]).toEqual({ pinType: 'input', pinIndex: 0, x: 0, y: 38, label: 'A' });
    expect(bufLayout.outputs[0]).toEqual({ pinType: 'output', pinIndex: 0, x: 120, y: 38, label: 'Y' });

    // INPUT switch
    const inLayout = getComponentPinLayout('INPUT', 0, 1);
    expect(inLayout.outputs[0]).toEqual({ pinType: 'output', pinIndex: 0, x: 110, y: 36, label: 'Out' });

    // OUTPUT probe
    const outLayout = getComponentPinLayout('OUTPUT', 1, 0);
    expect(outLayout.inputs[0]).toEqual({ pinType: 'input', pinIndex: 0, x: 0, y: 36, label: 'In' });

    // CLOCK
    const clkLayout = getComponentPinLayout('CLOCK', 0, 1);
    expect(clkLayout.outputs[0]).toEqual({ pinType: 'output', pinIndex: 0, x: 110, y: 36, label: 'CLK' });

    // DFF
    const dffLayout = getComponentPinLayout('DFF', 2, 1);
    expect(dffLayout.inputs[0]).toEqual({ pinType: 'input', pinIndex: 0, x: 0, y: 34, label: 'D' });
    expect(dffLayout.inputs[1]).toEqual({ pinType: 'input', pinIndex: 1, x: 0, y: 60, label: 'CLK' });
    expect(dffLayout.outputs[0]).toEqual({ pinType: 'output', pinIndex: 0, x: 130, y: 47, label: 'Q' });
  });

  it('ensures SVG lead lines connect to pin coordinates with zero gap', () => {
    const layout = getComponentPinLayout('NAND', 2, 1);
    const svg = renderGateSymbolSVG({
      type: 'NAND',
      width: layout.width,
      height: layout.height,
      inputCount: 2,
      inputCoords: layout.inputs.map((p) => ({ x: p.x, y: p.y })),
      outputCoord: { x: layout.outputs[0].x, y: layout.outputs[0].y },
      mode: 'schematic'
    });

    // Input lead 0 starts at x1="0" y1="34"
    expect(svg).toContain('<line x1="0" y1="34"');
    // Input lead 1 starts at x1="0" y1="58"
    expect(svg).toContain('<line x1="0" y1="58"');
    // Output lead terminates at x2="130" y2="46"
    expect(svg).toContain('x2="130" y2="46"');
  });
});

describe('Part 2 & 3: Schematic Mode & Conventional Gate Symbols', () => {
  const gateTypes = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'NOT', 'BUFFER'];

  it('renders schematic SVG for all standard gate types without errors', () => {
    for (const type of gateTypes) {
      const inputCount = type === 'NOT' || type === 'BUFFER' ? 1 : 2;
      const layout = getComponentPinLayout(type, inputCount, 1);
      const svg = renderGateSymbolSVG({
        type,
        width: layout.width,
        height: layout.height,
        inputCount,
        inputCoords: layout.inputs.map((p) => ({ x: p.x, y: p.y })),
        outputCoord: { x: layout.outputs[0].x, y: layout.outputs[0].y },
        mode: 'schematic'
      });

      expect(svg).toContain('class="gate-symbol-svg schematic-gate"');
      expect(svg).toContain('<path');
      expect(svg).toContain('<line'); // Pin lead wires

      // Inversion bubble rules
      const hasBubble = ['NAND', 'NOR', 'XNOR', 'NOT'].includes(type);
      if (hasBubble) {
        expect(svg).toContain('<circle');
      } else {
        expect(svg).not.toContain('<circle');
      }
    }
  });

  it('uses clean schematic color palette in schematic mode', () => {
    const layout = getComponentPinLayout('AND', 2, 1);
    const editorSvg = renderGateSymbolSVG({
      type: 'AND',
      width: layout.width,
      height: layout.height,
      inputCount: 2,
      inputCoords: layout.inputs.map((p) => ({ x: p.x, y: p.y })),
      outputCoord: { x: layout.outputs[0].x, y: layout.outputs[0].y },
      mode: 'editor'
    });

    const schematicSvg = renderGateSymbolSVG({
      type: 'AND',
      width: layout.width,
      height: layout.height,
      inputCount: 2,
      inputCoords: layout.inputs.map((p) => ({ x: p.x, y: p.y })),
      outputCoord: { x: layout.outputs[0].x, y: layout.outputs[0].y },
      mode: 'schematic'
    });

    expect(schematicSvg).toContain('stroke="#e2e8f0"');
    expect(schematicSvg).toContain('fill="#0d131f"');
    expect(editorSvg).toContain('stroke="#94a3b8"');
  });

  it('supports 3-input and 4-input gate symbols in schematic mode', () => {
    for (const count of [3, 4]) {
      const layout = getComponentPinLayout('AND', count, 1);
      const svg = renderGateSymbolSVG({
        type: 'AND',
        width: layout.width,
        height: layout.height,
        inputCount: count,
        inputCoords: layout.inputs.map((p) => ({ x: p.x, y: p.y })),
        outputCoord: { x: layout.outputs[0].x, y: layout.outputs[0].y },
        mode: 'schematic'
      });

      // All input leads should be rendered at x1="0"
      for (const inPin of layout.inputs) {
        expect(svg).toContain(`<line x1="0" y1="${inPin.y}"`);
      }
      expect(svg).toContain(`x2="130" y2="${layout.outputs[0].y}"`);
    }
  });
});

describe('Circuit Simulation Integration with Configurable Multi-Input Gates', () => {
  it('correctly simulates 3-input and 4-input gates under 4-valued logic', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const inB = c.addComponent(INPUT, 'B');
    const inC = c.addComponent(INPUT, 'C');
    const inD = c.addComponent(INPUT, 'D');

    const and4 = c.addComponent(makeGate('AND', 4), 'AND4');
    const out = c.addComponent(OUTPUT, 'Y');

    const netA = c.wire(inA, 0, and4, 0);
    const netB = c.wire(inB, 0, and4, 1);
    const netC = c.wire(inC, 0, and4, 2);
    const netD = c.wire(inD, 0, and4, 3);
    const netY = c.wire(and4, 0, out, 0);

    c.setInput(inA, '1');
    c.setInput(inB, '1');
    c.setInput(inC, '1');
    c.setInput(inD, '0');
    c.settle();
    expect(c.getNetValue(netY)).toBe('0');

    c.setInput(inD, '1');
    c.settle();
    expect(c.getNetValue(netY)).toBe('1');

    // 4-valued logic: X propagation
    c.setInput(inA, 'X');
    c.settle();
    expect(c.getNetValue(netY)).toBe('X');
  });

  it('generates accurate truth tables for multi-input circuits', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const inB = c.addComponent(INPUT, 'B');
    const inC = c.addComponent(INPUT, 'C');
    const or3 = c.addComponent(makeGate('OR', 3), 'OR3');
    const out = c.addComponent(OUTPUT, 'Y');

    c.wire(inA, 0, or3, 0);
    c.wire(inB, 0, or3, 1);
    c.wire(inC, 0, or3, 2);
    c.wire(or3, 0, out, 0);

    const tt = generateTruthTable(c);
    expect(tt.inputs).toEqual(['A', 'B', 'C']);
    expect(tt.outputs).toEqual(['Y']);
    expect(tt.rows.length).toBe(8);

    // Row 0 (0,0,0) -> 0
    expect(tt.rows[0].inputs).toEqual(['0', '0', '0']);
    expect(tt.rows[0].outputs).toEqual(['0']);

    // Row 7 (1,1,1) -> 1
    expect(tt.rows[7].inputs).toEqual(['1', '1', '1']);
    expect(tt.rows[7].outputs).toEqual(['1']);
  });

  it('preserves circuit explanation for multi-input gate networks', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const inB = c.addComponent(INPUT, 'B');
    const inC = c.addComponent(INPUT, 'C');
    const and3 = c.addComponent(makeGate('AND', 3), 'AND3');
    const out = c.addComponent(OUTPUT, 'Y');

    c.wire(inA, 0, and3, 0);
    c.wire(inB, 0, and3, 1);
    c.wire(inC, 0, and3, 2);
    c.wire(and3, 0, out, 0);

    const result = explainCircuit(c, out);
    expect(result).not.toBeNull();
    expect(result?.expression).toBe('A AND B AND C');
  });
});
