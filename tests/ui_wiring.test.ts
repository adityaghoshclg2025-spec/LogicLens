import { describe, it, expect } from 'vitest';
import { Circuit } from '../src/circuit.js';
import { AND, INPUT, OUTPUT, NOT, DFF } from '../src/component.js';
import { COMPONENT_SPECS, VisualComponent } from '../src/ui/app.js';

describe('UI wiring and component geometry', () => {
  it('has consistent component dimensions defined for all component types', () => {
    expect(COMPONENT_SPECS.INPUT).toBeDefined();
    expect(COMPONENT_SPECS.OUTPUT).toBeDefined();
    expect(COMPONENT_SPECS.AND).toBeDefined();
    expect(COMPONENT_SPECS.NOT).toBeDefined();
    expect(COMPONENT_SPECS.DFF).toBeDefined();

    expect(COMPONENT_SPECS.AND.width).toBe(130);
    expect(COMPONENT_SPECS.AND.height).toBe(76);
  });

  it('calculates orthogonal wire paths correctly for forward routing', () => {
    // Basic test of orthogonal routing helper logic
    const calculateOrthogonalPath = (x1: number, y1: number, x2: number, y2: number): string => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const stub = 20;
      if (x2 >= x1 + stub * 2) {
        const midX = Math.round(x1 + dx / 2);
        return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
      } else {
        const midY = dy >= 0 ? Math.max(y1, y2) + 26 : Math.min(y1, y2) - 26;
        const stub1 = x1 + stub;
        const stub2 = x2 - stub;
        return `M ${x1} ${y1} H ${stub1} V ${midY} H ${stub2} V ${y2} H ${x2}`;
      }
    };

    const path1 = calculateOrthogonalPath(100, 100, 200, 150);
    expect(path1).toBe('M 100 100 H 150 V 150 H 200');

    const pathReverse = calculateOrthogonalPath(200, 100, 100, 150);
    expect(pathReverse).toBe('M 200 100 H 220 V 176 H 80 V 150 H 100');
  });

  it('integrates multiple wires and updates outputs across logic gates', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const inB = c.addComponent(INPUT, 'B');
    const andG = c.addComponent(AND, 'G');
    const notG = c.addComponent(NOT, 'N');
    const out = c.addComponent(OUTPUT, 'OUT');

    const netA = c.wire(inA, 0, andG, 0);
    const netB = c.wire(inB, 0, andG, 1);
    const netAnd = c.wire(andG, 0, notG, 0);
    const netOut = c.wire(notG, 0, out, 0);

    // Initial state: inputs 0, 0 -> AND gives 0 -> NOT gives 1
    c.setInput(inA, '0');
    c.setInput(inB, '0');
    c.run(10);
    expect(c.getNetValue(netOut)).toBe('1');

    // Toggle inputs to 1, 1 -> AND gives 1 -> NOT gives 0
    c.setInput(inA, '1');
    c.setInput(inB, '1');
    c.run(20);
    expect(c.getNetValue(netOut)).toBe('0');
  });
});
