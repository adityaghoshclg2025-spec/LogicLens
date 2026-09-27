import { describe, it, expect } from 'vitest';
import { Circuit, OscillationError } from '../src/circuit.js';
import { AND, NOR, NOT, DFF, makeClock, INPUT, OUTPUT } from '../src/component.js';

describe('basic combinational gates', () => {
  it('evaluates AND correctly after propagation delay', () => {
    const c = new Circuit();
    const a = c.addComponent(INPUT, 'A');
    const b = c.addComponent(INPUT, 'B');
    const g = c.addComponent(AND, 'G');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(a, 0, g, 0, 'netA');
    c.wire(b, 0, g, 1, 'netB');
    c.wire(g, 0, out, 0, 'netOut');

    c.setInput(a, '1');
    c.setInput(b, '1');
    c.run(10);

    expect(c.getNetValue('netOut')).toBe('1');
  });

  it('flags an unconnected input as a floating net', () => {
    const c = new Circuit();
    const g = c.addComponent(AND, 'G');
    c.connectInput(g, 0, 'netA'); // never driven by anything
    c.run(5);
    expect(c.findFloatingNets()).toContain('netA');
  });
});

describe('feedback and sequential behavior', () => {
  it('settles a cross-coupled NOR SR latch to a stable state', () => {
    const c = new Circuit();
    const setIn = c.addComponent(INPUT, 'SET');
    const resetIn = c.addComponent(INPUT, 'RESET');
    const norQ = c.addComponent(NOR, 'NOR_Q');
    const norQBar = c.addComponent(NOR, 'NOR_QBAR');

    c.wire(setIn, 0, norQBar, 0, 'set');
    c.wire(resetIn, 0, norQ, 0, 'reset');
    // Cross-couple: each NOR's output feeds the other's second input.
    c.wire(norQ, 0, norQBar, 1, 'q');
    c.wire(norQBar, 0, norQ, 1, 'qbar');

    c.setInput(setIn, '1');
    c.setInput(resetIn, '0');
    c.run(20);

    expect(c.getNetValue('q')).toBe('1');
    expect(c.getNetValue('qbar')).toBe('0');
  });

  it('detects a genuinely unstable ring oscillator instead of hanging', () => {
    const c = new Circuit();
    const n1 = c.addComponent(NOT, 'N1');
    const n2 = c.addComponent(NOT, 'N2');
    const n3 = c.addComponent(NOT, 'N3'); // odd number of inversions -> never settles

    c.wire(n1, 0, n2, 0, 'wA');
    c.wire(n2, 0, n3, 0, 'wB');
    c.wire(n3, 0, n1, 0, 'wC');

    // Kick the loop off with a concrete value instead of leaving it at a stable 'X'.
    c.seedNet('wC', '0');

    expect(() => c.run(1000, 200)).toThrow(OscillationError);
  });

  it('captures a value into a D flip-flop only on the clock rising edge', () => {
    const c = new Circuit();
    const d = c.addComponent(INPUT, 'D');
    const clk = c.addComponent(makeClock(5), 'CLK');
    const dff = c.addComponent(DFF, 'DFF');
    const out = c.addComponent(OUTPUT, 'Q');

    c.wire(d, 0, dff, 0, 'd');
    c.wire(clk, 0, dff, 1, 'clk');
    c.wire(dff, 0, out, 0, 'q');

    c.setInput(d, '1');
    c.run(11); // one rising edge should have occurred by now

    expect(c.getNetValue('q')).toBe('1');
  });
});
