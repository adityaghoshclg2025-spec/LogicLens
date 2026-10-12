import { describe, expect, it } from 'vitest';
import { Circuit } from '../src/circuit.js';
import { AND, BUFFER, DFF, INPUT, NOT, OR, OUTPUT } from '../src/component.js';
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
    expect(sequential.steps.find((step) => step.type === 'DFF')?.note).toContain('clock edges');

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
});
