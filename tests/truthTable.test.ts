import { describe, it, expect } from 'vitest';
import { Circuit } from '../src/circuit.js';
import { AND, OR, NOT, NAND, XOR, INPUT, OUTPUT, makeClock, DFF } from '../src/component.js';
import { generateTruthTable, resolveUniqueLabels } from '../src/truthTable.js';

describe('Automatic Truth-Table Generator', () => {
  it('generates correct truth table for an AND gate (00->0, 01->0, 10->0, 11->1)', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const inB = c.addComponent(INPUT, 'B');
    const andGate = c.addComponent(AND, 'G');
    const outY = c.addComponent(OUTPUT, 'Y');

    c.wire(inA, 0, andGate, 0);
    c.wire(inB, 0, andGate, 1);
    c.wire(andGate, 0, outY, 0);

    const result = generateTruthTable(c, {
      inputs: [{ id: inA, label: 'A' }, { id: inB, label: 'B' }],
      outputs: [{ id: outY, label: 'Y' }]
    });

    expect(result.success).toBe(true);
    expect(result.inputs).toEqual(['A', 'B']);
    expect(result.outputs).toEqual(['Y']);
    expect(result.totalCombinations).toBe(4);
    expect(result.rows).toHaveLength(4);

    // Row 0: 0, 0 -> 0
    expect(result.rows[0].inputs).toEqual({ A: '0', B: '0' });
    expect(result.rows[0].outputs).toEqual({ Y: '0' });

    // Row 1: 0, 1 -> 0
    expect(result.rows[1].inputs).toEqual({ A: '0', B: '1' });
    expect(result.rows[1].outputs).toEqual({ Y: '0' });

    // Row 2: 1, 0 -> 0
    expect(result.rows[2].inputs).toEqual({ A: '1', B: '0' });
    expect(result.rows[2].outputs).toEqual({ Y: '0' });

    // Row 3: 1, 1 -> 1
    expect(result.rows[3].inputs).toEqual({ A: '1', B: '1' });
    expect(result.rows[3].outputs).toEqual({ Y: '1' });
  });

  it('generates correct truth table for an OR gate (00->0, 01->1, 10->1, 11->1)', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const inB = c.addComponent(INPUT, 'B');
    const orGate = c.addComponent(OR, 'OR');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(inA, 0, orGate, 0);
    c.wire(inB, 0, orGate, 1);
    c.wire(orGate, 0, out, 0);

    const result = generateTruthTable(c, {
      inputs: [{ id: inA, label: 'A' }, { id: inB, label: 'B' }],
      outputs: [{ id: out, label: 'OUT' }]
    });

    expect(result.success).toBe(true);
    expect(result.rows[0].outputs.OUT).toBe('0');
    expect(result.rows[1].outputs.OUT).toBe('1');
    expect(result.rows[2].outputs.OUT).toBe('1');
    expect(result.rows[3].outputs.OUT).toBe('1');
  });

  it('generates correct truth table for a NOT gate (0->1, 1->0)', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const notGate = c.addComponent(NOT, 'NOT');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(inA, 0, notGate, 0);
    c.wire(notGate, 0, out, 0);

    const result = generateTruthTable(c, {
      inputs: [{ id: inA, label: 'A' }],
      outputs: [{ id: out, label: 'OUT' }]
    });

    expect(result.success).toBe(true);
    expect(result.totalCombinations).toBe(2);
    expect(result.rows[0].inputs.A).toBe('0');
    expect(result.rows[0].outputs.OUT).toBe('1');
    expect(result.rows[1].inputs.A).toBe('1');
    expect(result.rows[1].outputs.OUT).toBe('0');
  });

  it('evaluates a multi-gate combinational circuit (XOR built with NANDs)', () => {
    // Standard 4-NAND XOR implementation
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const inB = c.addComponent(INPUT, 'B');
    const n1 = c.addComponent(NAND, 'N1');
    const n2 = c.addComponent(NAND, 'N2');
    const n3 = c.addComponent(NAND, 'N3');
    const n4 = c.addComponent(NAND, 'N4');
    const out = c.addComponent(OUTPUT, 'XOR_OUT');

    c.wire(inA, 0, n1, 0);
    c.wire(inB, 0, n1, 1);

    c.wire(inA, 0, n2, 0);
    c.wire(n1, 0, n2, 1);

    c.wire(n1, 0, n3, 0);
    c.wire(inB, 0, n3, 1);

    c.wire(n2, 0, n4, 0);
    c.wire(n3, 0, n4, 1);

    c.wire(n4, 0, out, 0);

    const result = generateTruthTable(c, {
      inputs: [{ id: inA, label: 'A' }, { id: inB, label: 'B' }],
      outputs: [{ id: out, label: 'XOR_OUT' }]
    });

    expect(result.success).toBe(true);
    expect(result.rows[0].outputs.XOR_OUT).toBe('0'); // 0 ^ 0 = 0
    expect(result.rows[1].outputs.XOR_OUT).toBe('1'); // 0 ^ 1 = 1
    expect(result.rows[2].outputs.XOR_OUT).toBe('1'); // 1 ^ 0 = 1
    expect(result.rows[3].outputs.XOR_OUT).toBe('0'); // 1 ^ 1 = 0
  });

  it('handles circuits with no inputs or no outputs with clear error messages', () => {
    const emptyCircuit = new Circuit();
    const resultEmpty = generateTruthTable(emptyCircuit);
    expect(resultEmpty.success).toBe(false);
    expect(resultEmpty.error).toContain('No input switches or output probes');

    // Circuit with only an output probe
    const cOut = new Circuit();
    cOut.addComponent(OUTPUT, 'OUT');
    const resultNoIn = generateTruthTable(cOut);
    expect(resultNoIn.success).toBe(false);
    expect(resultNoIn.error).toContain('No input switches found');

    // Circuit with only an input switch
    const cIn = new Circuit();
    cIn.addComponent(INPUT, 'IN');
    const resultNoOut = generateTruthTable(cIn);
    expect(resultNoOut.success).toBe(false);
    expect(resultNoOut.error).toContain('No output probes found');
  });

  it('accurately captures floating nets (Z) and contended signals without converting to boolean', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const outUnconnected = c.addComponent(OUTPUT, 'FLOATING_PROBE');

    const result = generateTruthTable(c, {
      inputs: [{ id: inA, label: 'A' }],
      outputs: [{ id: outUnconnected, label: 'FLOATING_PROBE' }]
    });

    expect(result.success).toBe(true);
    // Unconnected output probe must resolve to 'Z', never silently converted to 0 or 1
    expect(result.rows[0].outputs.FLOATING_PROBE).toBe('Z');
    expect(result.rows[1].outputs.FLOATING_PROBE).toBe('Z');
  });

  it('preserves the user original input switch values and simulation state after table generation', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const inB = c.addComponent(INPUT, 'B');
    const andGate = c.addComponent(AND, 'AND');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(inA, 0, andGate, 0);
    c.wire(inB, 0, andGate, 1);
    const outNet = c.wire(andGate, 0, out, 0);

    // User set switch A to 1, switch B to 0
    c.setInput(inA, '1');
    c.setInput(inB, '0');
    c.run(10);
    expect(c.getNetValue(outNet)).toBe('0');

    // Generate truth table (which tests all combinations: 00, 01, 10, 11)
    const result = generateTruthTable(c, {
      inputs: [{ id: inA, label: 'A' }, { id: inB, label: 'B' }],
      outputs: [{ id: out, label: 'OUT' }]
    });
    expect(result.success).toBe(true);

    // Verify user's original values are faithfully restored
    expect(c.getComponent(inA)?.state?.value).toBe('1');
    expect(c.getComponent(inB)?.state?.value).toBe('0');
    expect(c.getNetValue(outNet)).toBe('0');
  });

  it('rejects excessive input counts exceeding max limit with clear explanation', () => {
    const c = new Circuit();
    const inputDescs = [];
    for (let i = 0; i < 12; i++) {
      const id = c.addComponent(INPUT, `IN_${i}`);
      inputDescs.push({ id, label: `IN_${i}` });
    }
    const out = c.addComponent(OUTPUT, 'OUT');

    const result = generateTruthTable(c, {
      inputs: inputDescs,
      outputs: [{ id: out, label: 'OUT' }],
      maxInputs: 10
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('capped at 10 inputs');
    expect(result.totalCombinations).toBe(4096);
  });

  it('resolves duplicate and default column labels uniquely', () => {
    const items = [
      { id: '1', label: 'Input Switch' },
      { id: '2', label: 'Input Switch' },
      { id: '3', label: 'A' },
      { id: '4', label: 'A' },
      { id: '5', label: 'B' }
    ];

    const resolved = resolveUniqueLabels(items, 'In');
    expect(resolved.map((r) => r.label)).toEqual(['In 1', 'In 2', 'A (1)', 'A (2)', 'B']);
  });
});
