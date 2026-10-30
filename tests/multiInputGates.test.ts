import { describe, it, expect } from 'vitest';
import { Circuit } from '../src/circuit.js';
import {
  AND,
  OR,
  NAND,
  NOR,
  XOR,
  XNOR,
  NOT,
  INPUT,
  OUTPUT,
  makeGate,
  evaluateAnd,
  evaluateOr,
  evaluateXor,
  evaluateXnor,
  isConfigurableGate
} from '../src/component.js';
import { generateTruthTable } from '../src/truthTable.js';
import { explainCircuit } from '../src/explainCircuit.js';
import { renderGateSymbolSVG } from '../src/ui/gateSymbols.js';
import { LogicLensUI, VisualComponent } from '../src/ui/app.js';
import type { LogicValue } from '../src/types.js';

describe('Multi-input logic gates simulation logic', () => {
  it('identifies configurable vs non-configurable gates', () => {
    expect(isConfigurableGate('AND')).toBe(true);
    expect(isConfigurableGate('OR')).toBe(true);
    expect(isConfigurableGate('NAND')).toBe(true);
    expect(isConfigurableGate('NOR')).toBe(true);
    expect(isConfigurableGate('XOR')).toBe(true);
    expect(isConfigurableGate('XNOR')).toBe(true);
    expect(isConfigurableGate('NOT')).toBe(false);
    expect(isConfigurableGate('BUFFER')).toBe(false);
    expect(isConfigurableGate('DFF')).toBe(false);
  });

  it('preserves existing 2-input gate behavior for 4-valued logic', () => {
    // 2-input AND
    expect(evaluateAnd(['0', '0'])).toBe('0');
    expect(evaluateAnd(['0', '1'])).toBe('0');
    expect(evaluateAnd(['1', '1'])).toBe('1');
    expect(evaluateAnd(['0', 'X'])).toBe('0'); // dominant 0
    expect(evaluateAnd(['1', 'X'])).toBe('X');
    expect(evaluateAnd(['0', 'Z'])).toBe('0'); // dominant 0
    expect(evaluateAnd(['1', 'Z'])).toBe('X');

    // 2-input OR
    expect(evaluateOr(['0', '0'])).toBe('0');
    expect(evaluateOr(['0', '1'])).toBe('1');
    expect(evaluateOr(['1', '1'])).toBe('1');
    expect(evaluateOr(['1', 'X'])).toBe('1'); // dominant 1
    expect(evaluateOr(['0', 'X'])).toBe('X');
    expect(evaluateOr(['1', 'Z'])).toBe('1'); // dominant 1
    expect(evaluateOr(['0', 'Z'])).toBe('X');

    // 2-input XOR
    expect(evaluateXor(['0', '0'])).toBe('0');
    expect(evaluateXor(['0', '1'])).toBe('1');
    expect(evaluateXor(['1', '0'])).toBe('1');
    expect(evaluateXor(['1', '1'])).toBe('0');
    expect(evaluateXor(['1', 'X'])).toBe('X');
    expect(evaluateXor(['0', 'Z'])).toBe('X');

    // 2-input XNOR
    expect(evaluateXnor(['0', '0'])).toBe('1');
    expect(evaluateXnor(['0', '1'])).toBe('0');
    expect(evaluateXnor(['1', '0'])).toBe('0');
    expect(evaluateXnor(['1', '1'])).toBe('1');
    expect(evaluateXnor(['1', 'X'])).toBe('X');
  });

  it('correctly evaluates 3-input and 4-input AND gates with 4-valued logic', () => {
    // 3-input AND
    expect(evaluateAnd(['1', '1', '1'])).toBe('1');
    expect(evaluateAnd(['1', '0', '1'])).toBe('0');
    expect(evaluateAnd(['0', '0', '0'])).toBe('0');
    expect(evaluateAnd(['1', '1', 'X'])).toBe('X');
    expect(evaluateAnd(['0', 'X', '1'])).toBe('0'); // dominant 0 overrides X
    expect(evaluateAnd(['0', 'Z', '1'])).toBe('0'); // dominant 0 overrides Z

    // 4-input AND
    expect(evaluateAnd(['1', '1', '1', '1'])).toBe('1');
    expect(evaluateAnd(['1', '1', '0', '1'])).toBe('0');
    expect(evaluateAnd(['1', '1', '1', 'X'])).toBe('X');
    expect(evaluateAnd(['1', '0', 'X', 'Z'])).toBe('0'); // dominant 0 overrides X & Z
  });

  it('correctly evaluates 3-input and 4-input OR gates with 4-valued logic', () => {
    // 3-input OR
    expect(evaluateOr(['0', '0', '0'])).toBe('0');
    expect(evaluateOr(['0', '1', '0'])).toBe('1');
    expect(evaluateOr(['1', '1', '1'])).toBe('1');
    expect(evaluateOr(['0', '0', 'X'])).toBe('X');
    expect(evaluateOr(['1', 'X', '0'])).toBe('1'); // dominant 1 overrides X
    expect(evaluateOr(['1', 'Z', '0'])).toBe('1'); // dominant 1 overrides Z

    // 4-input OR
    expect(evaluateOr(['0', '0', '0', '0'])).toBe('0');
    expect(evaluateOr(['0', '0', '1', '0'])).toBe('1');
    expect(evaluateOr(['0', '0', '0', 'X'])).toBe('X');
    expect(evaluateOr(['0', '1', 'X', 'Z'])).toBe('1'); // dominant 1 overrides X & Z
  });

  it('correctly evaluates 3-input and 4-input NAND and NOR gates', () => {
    const nand3 = makeGate('NAND', 3);
    const nor3 = makeGate('NOR', 3);
    const nand4 = makeGate('NAND', 4);
    const nor4 = makeGate('NOR', 4);

    expect(nand3.evaluate(['1', '1', '1'], undefined).outputs[0]).toBe('0');
    expect(nand3.evaluate(['1', '0', '1'], undefined).outputs[0]).toBe('1');
    expect(nand3.evaluate(['0', 'X', '1'], undefined).outputs[0]).toBe('1');

    expect(nor3.evaluate(['0', '0', '0'], undefined).outputs[0]).toBe('1');
    expect(nor3.evaluate(['0', '1', '0'], undefined).outputs[0]).toBe('0');
    expect(nor3.evaluate(['1', 'X', '0'], undefined).outputs[0]).toBe('0');

    expect(nand4.evaluate(['1', '1', '1', '1'], undefined).outputs[0]).toBe('0');
    expect(nand4.evaluate(['1', '1', '0', '1'], undefined).outputs[0]).toBe('1');

    expect(nor4.evaluate(['0', '0', '0', '0'], undefined).outputs[0]).toBe('1');
    expect(nor4.evaluate(['0', '0', '1', '0'], undefined).outputs[0]).toBe('0');
  });

  it('correctly evaluates multi-input XOR and XNOR as odd/even parity', () => {
    // 3-input XOR (odd parity)
    expect(evaluateXor(['0', '0', '0'])).toBe('0');
    expect(evaluateXor(['1', '0', '0'])).toBe('1');
    expect(evaluateXor(['1', '1', '0'])).toBe('0');
    expect(evaluateXor(['1', '1', '1'])).toBe('1');
    expect(evaluateXor(['1', '0', 'X'])).toBe('X');

    // 3-input XNOR (even parity)
    expect(evaluateXnor(['0', '0', '0'])).toBe('1');
    expect(evaluateXnor(['1', '0', '0'])).toBe('0');
    expect(evaluateXnor(['1', '1', '0'])).toBe('1');
    expect(evaluateXnor(['1', '1', '1'])).toBe('0');
    expect(evaluateXnor(['1', '0', 'Z'])).toBe('X');

    // 4-input XOR
    expect(evaluateXor(['1', '0', '1', '0'])).toBe('0');
    expect(evaluateXor(['1', '0', '1', '1'])).toBe('1');
    expect(evaluateXor(['1', '1', '1', '1'])).toBe('0');

    // 4-input XNOR
    expect(evaluateXnor(['1', '0', '1', '0'])).toBe('1');
    expect(evaluateXnor(['1', '0', '1', '1'])).toBe('0');
    expect(evaluateXnor(['1', '1', '1', '1'])).toBe('1');
  });

  it('enforces that NOT remains strictly a single-input gate', () => {
    expect(() => makeGate('NOT', 2)).toThrow('NOT gate must remain a single-input gate');
    expect(() => makeGate('NOT', 3)).toThrow('NOT gate must remain a single-input gate');
    expect(NOT.inputCount).toBe(1);

    const circuit = new Circuit();
    const notId = circuit.addComponent(NOT, 'Inverter');
    expect(() => circuit.setComponentInputCount(notId, 2)).toThrow('NOT gate must remain a single-input gate');
  });
});

describe('Circuit simulation with multi-input gates', () => {
  it('simulates a 3-input AND circuit end-to-end', () => {
    const c = new Circuit();
    const in1 = c.addComponent(INPUT, 'In1');
    const in2 = c.addComponent(INPUT, 'In2');
    const in3 = c.addComponent(INPUT, 'In3');
    const and3 = c.addComponent(makeGate('AND', 3), 'AND3');
    const out = c.addComponent(OUTPUT, 'Out');

    c.wire(in1, 0, and3, 0);
    c.wire(in2, 0, and3, 1);
    c.wire(in3, 0, and3, 2);
    c.wire(and3, 0, out, 0, 'andOut');

    // 1, 1, 0 -> 0
    c.setInput(in1, '1');
    c.setInput(in2, '1');
    c.setInput(in3, '0');
    c.settle();
    expect(c.getNetValue('andOut')).toBe('0');

    // 1, 1, 1 -> 1
    c.setInput(in3, '1');
    c.settle();
    expect(c.getNetValue('andOut')).toBe('1');
  });

  it('safely reconfigures input count and preserves connections', () => {
    const c = new Circuit();
    const in0 = c.addComponent(INPUT, 'In0');
    const in1 = c.addComponent(INPUT, 'In1');
    const in2 = c.addComponent(INPUT, 'In2');
    const in3 = c.addComponent(INPUT, 'In3');
    const gate = c.addComponent(makeGate('OR', 4), 'OR_GATE');
    const out = c.addComponent(OUTPUT, 'Out');

    c.wire(in0, 0, gate, 0, 'net0');
    c.wire(in1, 0, gate, 1, 'net1');
    c.wire(in2, 0, gate, 2, 'net2');
    c.wire(in3, 0, gate, 3, 'net3');
    c.wire(gate, 0, out, 0, 'outNet');

    c.setInput(in0, '0');
    c.setInput(in1, '0');
    c.setInput(in2, '0');
    c.setInput(in3, '1');
    c.settle();
    expect(c.getNetValue('outNet')).toBe('1');

    // Reduce inputs from 4 down to 2
    c.setComponentInputCount(gate, 2);
    const gateComp = c.getComponent(gate)!;
    expect(gateComp.def.inputCount).toBe(2);
    expect(gateComp.inputNetIds).toHaveLength(2);
    // Connections 0 and 1 are fully preserved
    expect(gateComp.inputNetIds[0]).toBe('net0');
    expect(gateComp.inputNetIds[1]).toBe('net1');
    expect(gateComp.outputNetIds[0]).toBe('outNet');

    // Now gate only sees in0=0 and in1=0, so OR evaluates to 0
    c.settle();
    expect(c.getNetValue('outNet')).toBe('0');

    // Set in1 to 1 -> output becomes 1
    c.setInput(in1, '1');
    c.settle();
    expect(c.getNetValue('outNet')).toBe('1');
  });
});

describe('Truth table generation with multi-input gates', () => {
  it('generates a correct 8-row truth table for a 3-input AND gate', () => {
    const c = new Circuit();
    const a = c.addComponent(INPUT, 'A');
    const b = c.addComponent(INPUT, 'B');
    const d = c.addComponent(INPUT, 'C');
    const and3 = c.addComponent(makeGate('AND', 3), 'AND3');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(a, 0, and3, 0);
    c.wire(b, 0, and3, 1);
    c.wire(d, 0, and3, 2);
    c.wire(and3, 0, out, 0);

    const result = generateTruthTable(c);
    expect(result.success).toBe(true);
    expect(result.rows).toHaveLength(8);

    // Only row 111 outputs '1', all others '0'
    for (const row of result.rows) {
      const isAllHigh = Object.values(row.inputs).every((v) => v === '1');
      const expectedOut: LogicValue = isAllHigh ? '1' : '0';
      expect(Object.values(row.outputs)[0]).toBe(expectedOut);
    }
  });

  it('generates a correct 8-row truth table for a 3-input XOR gate (odd parity)', () => {
    const c = new Circuit();
    const a = c.addComponent(INPUT, 'A');
    const b = c.addComponent(INPUT, 'B');
    const d = c.addComponent(INPUT, 'C');
    const xor3 = c.addComponent(makeGate('XOR', 3), 'XOR3');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(a, 0, xor3, 0);
    c.wire(b, 0, xor3, 1);
    c.wire(d, 0, xor3, 2);
    c.wire(xor3, 0, out, 0);

    const result = generateTruthTable(c);
    expect(result.success).toBe(true);
    expect(result.rows).toHaveLength(8);

    for (const row of result.rows) {
      const highCount = Object.values(row.inputs).filter((v) => v === '1').length;
      const expectedOut: LogicValue = highCount % 2 === 1 ? '1' : '0';
      expect(Object.values(row.outputs)[0]).toBe(expectedOut);
    }
  });
});

describe('Standard logic gate symbol SVG renderer', () => {
  it('generates recognizable standard SVG for all gate types', () => {
    const inputCoords2 = [{ x: 0, y: 34 }, { x: 0, y: 58 }];
    const outputCoord = { x: 130, y: 46 };

    const andSvg = renderGateSymbolSVG({
      type: 'AND', width: 130, height: 76, inputCount: 2,
      inputCoords: inputCoords2, outputCoord
    });
    // AND has flat side and curved side (arc)
    expect(andSvg).toContain('<svg');
    expect(andSvg).toContain('A '); // arc command in SVG path
    expect(andSvg).not.toContain('<circle'); // No inversion bubble

    const nandSvg = renderGateSymbolSVG({
      type: 'NAND', width: 130, height: 76, inputCount: 2,
      inputCoords: inputCoords2, outputCoord
    });
    // NAND has inversion bubble
    expect(nandSvg).toContain('<circle');

    const orSvg = renderGateSymbolSVG({
      type: 'OR', width: 130, height: 76, inputCount: 2,
      inputCoords: inputCoords2, outputCoord
    });
    // OR has quadratic bezier curves (Q command)
    expect(orSvg).toContain('Q ');
    expect(orSvg).not.toContain('<circle');

    const norSvg = renderGateSymbolSVG({
      type: 'NOR', width: 130, height: 76, inputCount: 2,
      inputCoords: inputCoords2, outputCoord
    });
    expect(norSvg).toContain('<circle');

    const xorSvg = renderGateSymbolSVG({
      type: 'XOR', width: 130, height: 76, inputCount: 2,
      inputCoords: inputCoords2, outputCoord
    });
    // XOR has the extra input arc curve
    expect(xorSvg).toContain('M 26'); // Outer curved line

    const xnorSvg = renderGateSymbolSVG({
      type: 'XNOR', width: 130, height: 76, inputCount: 2,
      inputCoords: inputCoords2, outputCoord
    });
    expect(xnorSvg).toContain('<circle'); // Inversion bubble

    const notSvg = renderGateSymbolSVG({
      type: 'NOT', width: 120, height: 60, inputCount: 1,
      inputCoords: [{ x: 0, y: 38 }], outputCoord: { x: 120, y: 38 }
    });
    // NOT is triangle with circle
    expect(notSvg).toContain('L '); // Triangle lines
    expect(notSvg).toContain('<circle');
  });

  it('renders multi-input gate SVG symbols with 3 and 4 input leads', () => {
    const inputCoords3 = [{ x: 0, y: 34 }, { x: 0, y: 54 }, { x: 0, y: 74 }];
    const out3 = { x: 130, y: 54 };

    const and3Svg = renderGateSymbolSVG({
      type: 'AND', width: 130, height: 96, inputCount: 3,
      inputCoords: inputCoords3, outputCoord: out3
    });
    // Should have 3 input lead lines + 1 output lead line = 4 line elements
    const lineMatches = and3Svg.match(/<line/g);
    expect(lineMatches).toHaveLength(4);

    const inputCoords4 = [{ x: 0, y: 34 }, { x: 0, y: 54 }, { x: 0, y: 74 }, { x: 0, y: 94 }];
    const out4 = { x: 130, y: 64 };
    const or4Svg = renderGateSymbolSVG({
      type: 'OR', width: 130, height: 116, inputCount: 4,
      inputCoords: inputCoords4, outputCoord: out4
    });
    const or4LineMatches = or4Svg.match(/<line/g);
    expect(or4LineMatches).toHaveLength(5); // 4 input leads + 1 output lead
  });
});

describe('UI component geometry for configurable input counts', () => {
  it('calculates pin coordinates correctly for 2, 3, and 4 inputs', () => {
    const comp2: VisualComponent = {
      id: 'c1', simId: 's1', type: 'AND', label: 'AND Gate',
      x: 100, y: 200, inputCount: 2, outputCount: 1, width: 130, height: 76
    };

    // Simulate getPortCoordinates logic
    const getCoords = (comp: VisualComponent, pinType: 'input' | 'output', pinIndex: number) => {
      if (pinType === 'input') {
        const x = comp.x;
        let y = comp.y + 36;
        if (comp.inputCount === 1) {
          y = comp.y + (comp.type === 'NOT' || comp.type === 'BUFFER' ? 38 : 36);
        } else if (comp.inputCount === 2) {
          y = pinIndex === 0 ? comp.y + 34 : comp.y + 58;
        } else if (comp.inputCount > 2) {
          y = comp.y + 34 + pinIndex * 20;
        }
        return { x, y };
      } else {
        const x = comp.x + comp.width;
        let y = comp.y + 36;
        if (comp.outputCount === 1) {
          if (comp.inputCount === 2) {
            y = comp.y + 46;
          } else if (comp.inputCount > 2) {
            y = comp.y + 34 + ((comp.inputCount - 1) * 20) / 2;
          }
        }
        return { x, y };
      }
    };

    // 2 inputs: pins at y+34, y+58; output at y+46
    expect(getCoords(comp2, 'input', 0)).toEqual({ x: 100, y: 234 });
    expect(getCoords(comp2, 'input', 1)).toEqual({ x: 100, y: 258 });
    expect(getCoords(comp2, 'output', 0)).toEqual({ x: 230, y: 246 });

    // 3 inputs: pins at y+34, y+54, y+74; output at y+54
    const comp3: VisualComponent = { ...comp2, inputCount: 3, height: 96 };
    expect(getCoords(comp3, 'input', 0)).toEqual({ x: 100, y: 234 });
    expect(getCoords(comp3, 'input', 1)).toEqual({ x: 100, y: 254 });
    expect(getCoords(comp3, 'input', 2)).toEqual({ x: 100, y: 274 });
    expect(getCoords(comp3, 'output', 0)).toEqual({ x: 230, y: 254 });

    // 4 inputs: pins at y+34, y+54, y+74, y+94; output at y+64
    const comp4: VisualComponent = { ...comp2, inputCount: 4, height: 116 };
    expect(getCoords(comp4, 'input', 0)).toEqual({ x: 100, y: 234 });
    expect(getCoords(comp4, 'input', 1)).toEqual({ x: 100, y: 254 });
    expect(getCoords(comp4, 'input', 2)).toEqual({ x: 100, y: 274 });
    expect(getCoords(comp4, 'input', 3)).toEqual({ x: 100, y: 294 });
    expect(getCoords(comp4, 'output', 0)).toEqual({ x: 230, y: 264 });
  });
});

describe('Explain My Circuit with multi-input gates', () => {
  it('explains a 3-input AND gate with named pins A, B, C', () => {
    const circuit = new Circuit();
    const a = circuit.addComponent(INPUT, 'A');
    const b = circuit.addComponent(INPUT, 'B');
    const c = circuit.addComponent(INPUT, 'C');
    const and3 = circuit.addComponent(makeGate('AND', 3), 'AND_G');
    const out = circuit.addComponent(OUTPUT, 'OUT');

    circuit.wire(a, 0, and3, 0);
    circuit.wire(b, 0, and3, 1);
    circuit.wire(c, 0, and3, 2);
    circuit.wire(and3, 0, out, 0);

    circuit.setInput(a, '1');
    circuit.setInput(b, '1');
    circuit.setInput(c, '0');
    circuit.settle();

    const explanation = explainCircuit(circuit, out)!;
    expect(explanation.outputValue).toBe('0');
    const step = explanation.steps.find((s) => s.componentId === and3)!;
    expect(step.inputs.map((i) => i.value)).toEqual(['1', '1', '0']);
    expect(step.description).toContain('C is LOW');
    expect(step.description).toContain('output is LOW');
  });
});
