import { describe, expect, it } from 'vitest';
import { AND, INPUT, OUTPUT } from '../src/component.js';
import { Circuit } from '../src/circuit.js';
import { explainCircuit } from '../src/explainCircuit.js';
import { renderCircuitExplanationHTML } from '../src/ui/explainRenderer.js';

describe('Explain My Circuit teaching view', () => {
  it('shows labeled current values and the gate rule before technical net details', () => {
    const circuit = new Circuit();
    const a = circuit.addComponent(INPUT, 'Input A');
    const b = circuit.addComponent(INPUT, 'Input B');
    const gate = circuit.addComponent(AND, 'AND Gate');
    const output = circuit.addComponent(OUTPUT, 'Result');
    circuit.wire(a, 0, gate, 0, 'net_for_a');
    circuit.wire(b, 0, gate, 1, 'net_for_b');
    circuit.wire(gate, 0, output, 0, 'net_for_result');
    circuit.setInput(a, '1');
    circuit.setInput(b, '0');
    circuit.settle();

    const labels = new Map([[a, 'Input A'], [b, 'Input B'], [gate, 'AND Gate'], [output, 'Result']]);
    const explanation = explainCircuit(circuit, output, (id) => labels.get(id))!;
    const html = renderCircuitExplanationHTML(explanation);
    const teachingView = html.split('<details class="explanation-technical">')[0];

    expect(teachingView).toContain('Why is Result LOW?');
    expect(teachingView).toContain('Input A');
    expect(teachingView).toContain('Input B');
    expect(teachingView).toContain('AND Gate');
    expect(teachingView).toContain('HIGH (1)');
    expect(teachingView).toContain('LOW (0)');
    expect(teachingView).toContain('B is LOW');
    expect(teachingView).not.toContain('net_for_');
    expect(html).toContain('<summary>Technical details</summary>');
    expect(html).toContain('net_for_result');
  });
});
