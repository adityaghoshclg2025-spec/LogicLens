import { describe, expect, it } from 'vitest';
import { Circuit } from '../src/circuit.js';
import { AND, BUFFER, DFF, INPUT, NAND, NOR, NOT, OR, OUTPUT, XNOR, XOR } from '../src/component.js';
import { explainCircuit } from '../src/explainCircuit.js';

function buildOutput(circuit: Circuit, label = 'OUT'): string {
  return circuit.addComponent(OUTPUT, label);
}

describe('Explain My Circuit dependency trace', () => {
  it('explains a simple gate with its actual current input and output values', () => {
    const circuit = new Circuit();
    const a = circuit.addComponent(INPUT, 'A');
    const b = circuit.addComponent(INPUT, 'B');
    const and = circuit.addComponent(AND, 'G');
    const output = buildOutput(circuit);
    circuit.wire(a, 0, and, 0, 'aNet');
    circuit.wire(b, 0, and, 1, 'bNet');
    circuit.wire(and, 0, output, 0, 'result');
    circuit.setInput(a, '1');
    circuit.setInput(b, '0');
    circuit.settle();

    const explanation = explainCircuit(circuit, output)!;
    expect(explanation.outputValue).toBe('0');
    expect(explanation.steps.map((step) => step.type)).toEqual(['INPUT', 'INPUT', 'AND', 'OUTPUT']);
    expect(explanation.steps[2].inputs.map((input) => input.value)).toEqual(['1', '0']);
    expect(explanation.steps[2].outputs[0].value).toBe('0');
    expect(explanation.steps[2].description).toContain('B is LOW');
    expect(explanation.steps[2].description).toContain('output is LOW');

    circuit.setInput(b, '1');
    circuit.settle();
    const updated = explainCircuit(circuit, output)!;
    expect(updated.outputValue).toBe('1');
    expect(updated.steps.find((step) => step.type === 'AND')?.inputs.map((input) => input.value)).toEqual(['1', '1']);
    expect(updated.steps.find((step) => step.type === 'AND')?.description).toContain('output is HIGH');
  });

  it('traces a multigate circuit in dependency order', () => {
    const circuit = new Circuit();
    const input = circuit.addComponent(INPUT, 'A');
    const inverter = circuit.addComponent(NOT, 'INV');
    const buffer = circuit.addComponent(BUFFER, 'BUF');
    const output = buildOutput(circuit);
    circuit.wire(input, 0, inverter, 0, 'n1');
    circuit.wire(inverter, 0, buffer, 0, 'n2');
    circuit.wire(buffer, 0, output, 0, 'n3');
    circuit.setInput(input, '1');
    circuit.settle();

    const explanation = explainCircuit(circuit, output)!;
    expect(explanation.steps.map((step) => step.type)).toEqual(['INPUT', 'NOT', 'BUFFER', 'OUTPUT']);
    expect(explanation.outputValue).toBe('0');
  });

  it.each([
    { gate: NAND, label: 'NAND', inputs: ['1', '1'] as const, expected: '0', phrase: 'NAND inverts it to LOW' },
    { gate: NOR, label: 'NOR', inputs: ['0', '0'] as const, expected: '1', phrase: 'NOR inverts it to HIGH' },
    { gate: XOR, label: 'XOR', inputs: ['1', '0'] as const, expected: '1', phrase: 'They differ' },
    { gate: XNOR, label: 'XNOR', inputs: ['1', '1'] as const, expected: '1', phrase: 'They match' }
  ])('explains $label using its current input values', ({ gate, inputs, expected, phrase }) => {
    const circuit = new Circuit();
    const a = circuit.addComponent(INPUT, 'A');
    const b = circuit.addComponent(INPUT, 'B');
    const operation = circuit.addComponent(gate, 'Gate');
    const output = buildOutput(circuit);
    circuit.wire(a, 0, operation, 0, 'inputA');
    circuit.wire(b, 0, operation, 1, 'inputB');
    circuit.wire(operation, 0, output, 0, 'result');
    circuit.setInput(a, inputs[0]);
    circuit.setInput(b, inputs[1]);
    circuit.settle();

    const explanation = explainCircuit(circuit, output)!;
    const gateStep = explanation.steps.find((step) => step.componentId === operation)!;
    expect(explanation.outputValue).toBe(expected);
    expect(gateStep.inputs.map((input) => input.value)).toEqual(inputs);
    expect(gateStep.description).toContain(phrase);
  });

  it('lists shared upstream dependencies once', () => {
    const circuit = new Circuit();
    const shared = circuit.addComponent(INPUT, 'SHARED');
    const other = circuit.addComponent(INPUT, 'OTHER');
    const left = circuit.addComponent(OR, 'LEFT');
    const right = circuit.addComponent(OR, 'RIGHT');
    const combine = circuit.addComponent(AND, 'COMBINE');
    const output = buildOutput(circuit);
    circuit.wire(shared, 0, left, 0, 'shared');
    circuit.wire(other, 0, left, 1, 'other');
    circuit.wire(shared, 0, right, 0, 'shared');
    circuit.wire(other, 0, right, 1, 'other');
    circuit.wire(left, 0, combine, 0, 'leftResult');
    circuit.wire(right, 0, combine, 1, 'rightResult');
    circuit.wire(combine, 0, output, 0, 'result');
    circuit.setInput(shared, '1');
    circuit.setInput(other, '0');
    circuit.settle();

    const explanation = explainCircuit(circuit, output)!;
    expect(explanation.steps.filter((step) => step.componentId === shared)).toHaveLength(1);
    expect(explanation.steps.map((step) => step.type)).toEqual(['INPUT', 'INPUT', 'OR', 'OR', 'AND', 'OUTPUT']);
  });

  it('reports floating Z and X values without converting them to binary', () => {
    const circuit = new Circuit();
    const floatingGate = circuit.addComponent(BUFFER, 'FLOATING');
    const output = buildOutput(circuit);
    circuit.connectInput(floatingGate, 0, 'orphan');
    circuit.wire(floatingGate, 0, output, 0, 'result');
    circuit.settle();
    const floating = explainCircuit(circuit, output)!;
    expect(floating.outputValue).toBe('Z');
    expect(floating.notes.some((note) => note.includes('floating'))).toBe(true);

    const xCircuit = new Circuit();
    const unknown = xCircuit.addComponent(INPUT, 'UNKNOWN');
    const xOutput = buildOutput(xCircuit);
    xCircuit.wire(unknown, 0, xOutput, 0, 'xNet');
    xCircuit.setInput(unknown, 'X');
    xCircuit.settle();
    const xExplanation = explainCircuit(xCircuit, xOutput)!;
    expect(xExplanation.outputValue).toBe('X');
    expect(xExplanation.notes.some((note) => note.startsWith('X means'))).toBe(true);
    expect(xExplanation.warnings.some((warning) => warning.kind === 'unknown')).toBe(true);
  });

  it('marks sequential and unsupported components as boundaries, and handles unconnected outputs', () => {
    const circuit = new Circuit();
    const data = circuit.addComponent(INPUT, 'D');
    const clock = circuit.addComponent(INPUT, 'CLK');
    const dff = circuit.addComponent(DFF, 'FF');
    const output = buildOutput(circuit);
    circuit.wire(data, 0, dff, 0, 'd');
    circuit.wire(clock, 0, dff, 1, 'clk');
    circuit.wire(dff, 0, output, 0, 'q');
    circuit.settle();
    const sequential = explainCircuit(circuit, output)!;
    expect(sequential.steps.find((step) => step.type === 'DFF')?.kind).toBe('sequential');
    expect(sequential.steps.find((step) => step.type === 'DFF')?.note).toContain('clock edge');
    expect(sequential.warnings.some((warning) => warning.kind === 'sequential')).toBe(true);

    const customCircuit = new Circuit();
    const source = customCircuit.addComponent(INPUT, 'SRC');
    const custom = customCircuit.addComponent({
      type: 'CUSTOM', inputCount: 1, outputCount: 1, delay: 0,
      evaluate: ([value]) => ({ outputs: [value], nextState: undefined })
    }, 'CUSTOM');
    const customOutput = buildOutput(customCircuit);
    customCircuit.wire(source, 0, custom, 0, 'customIn');
    customCircuit.wire(custom, 0, customOutput, 0, 'customOut');
    customCircuit.setInput(source, '1');
    customCircuit.settle();
    expect(explainCircuit(customCircuit, customOutput)?.steps.find((step) => step.type === 'CUSTOM')?.kind).toBe('unsupported');

    const emptyCircuit = new Circuit();
    const unconnectedOutput = buildOutput(emptyCircuit);
    const emptyExplanation = explainCircuit(emptyCircuit, unconnectedOutput)!;
    expect(emptyExplanation.outputValue).toBe('Z');
    expect(emptyExplanation.notes.some((note) => note.includes('high impedance'))).toBe(true);
    expect(explainCircuit(emptyCircuit, 'missing')).toBeNull();
  });

  it('reports conflicting active drivers separately from an unknown X source', () => {
    const circuit = new Circuit();
    const low = circuit.addComponent(INPUT, 'LOW');
    const high = circuit.addComponent(INPUT, 'HIGH');
    const output = buildOutput(circuit);
    circuit.wire(low, 0, output, 0, 'sharedBus');
    circuit.wire(high, 0, output, 0, 'sharedBus');
    circuit.setInput(low, '0');
    circuit.setInput(high, '1');
    circuit.settle();

    const explanation = explainCircuit(circuit, output)!;
    expect(explanation.outputValue).toBe('X');
    expect(explanation.warnings.some((warning) => warning.kind === 'contention' && warning.message.includes('drivers disagree'))).toBe(true);
    expect(circuit.getNetDrivers('sharedBus').map((driver) => driver.value)).toEqual(['0', '1']);
  });

  it('detects a feedback boundary without claiming to replay its history', () => {
    const circuit = new Circuit();
    const source = circuit.addComponent(INPUT, 'A');
    const gate = circuit.addComponent(AND, 'Loop Gate');
    const output = buildOutput(circuit);
    circuit.wire(gate, 0, gate, 0, 'loop');
    circuit.wire(source, 0, gate, 1, 'source');
    circuit.connectInput(output, 0, 'loop');
    circuit.setInput(source, '0');
    circuit.settle();

    const explanation = explainCircuit(circuit, output)!;
    expect(explanation.warnings.some((warning) => warning.kind === 'feedback')).toBe(true);
    expect(explanation.steps.find((step) => step.type === 'AND')?.inputs.map((input) => input.value)).toEqual(['0', '0']);
  });
});
