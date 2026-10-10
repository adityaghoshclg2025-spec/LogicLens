import { describe, it, expect } from 'vitest';
import { Circuit, OscillationError } from '../src/circuit.js';
import { AND, OR, NOR, NOT, BUFFER, DFF, makeClock, INPUT, OUTPUT } from '../src/component.js';

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

describe('circuit wiring and fan-out behavior', () => {
  it('supports single output fan-out to multiple gate inputs', () => {
    const c = new Circuit();
    const src = c.addComponent(INPUT, 'SRC');
    const not1 = c.addComponent(NOT, 'NOT1');
    const not2 = c.addComponent(NOT, 'NOT2');
    const out1 = c.addComponent(OUTPUT, 'OUT1');
    const out2 = c.addComponent(OUTPUT, 'OUT2');

    // Fan-out: src out0 connects to both not1 in0 and not2 in0
    const netName1 = c.wire(src, 0, not1, 0);
    const netName2 = c.wire(src, 0, not2, 0);
    expect(netName1).toBe(netName2); // Both share the same driver net

    c.wire(not1, 0, out1, 0, 'outNet1');
    c.wire(not2, 0, out2, 0, 'outNet2');

    c.setInput(src, '1');
    c.run(10);

    expect(c.getNetValue('outNet1')).toBe('0');
    expect(c.getNetValue('outNet2')).toBe('0');

    c.setInput(src, '0');
    c.run(20);

    expect(c.getNetValue('outNet1')).toBe('1');
    expect(c.getNetValue('outNet2')).toBe('1');
  });

  it('handles dynamic unwiring and net cleanup gracefully', () => {
    const c = new Circuit();
    const a = c.addComponent(INPUT, 'A');
    const g = c.addComponent(AND, 'G');
    const out = c.addComponent(OUTPUT, 'OUT');

    const netA = c.wire(a, 0, g, 0);
    const netOut = c.wire(g, 0, out, 0);

    c.setInput(a, '1');
    c.run(5);

    // Unwire a -> g
    c.unwire(a, 0, g, 0, netA);
    c.run(10);

    // netA is cleaned up and reads Z
    expect(c.getNetValue(netA)).toBe('Z');
  });

  it('cleans up all nets when removing a component', () => {
    const c = new Circuit();
    const a = c.addComponent(INPUT, 'A');
    const g = c.addComponent(AND, 'G');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(a, 0, g, 0, 'netA');
    c.wire(g, 0, out, 0, 'netOut');

    expect(c.getComponent(g)).toBeDefined();
    const removed = c.removeComponent(g);
    expect(removed).toBe(true);
    expect(c.getComponent(g)).toBeUndefined();
  });
});

describe('multi-gate series propagation and repetitive toggling regression', () => {
  it('propagates through 2 gates in series when input is toggled', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const not1 = c.addComponent(NOT, 'NOT1');
    const not2 = c.addComponent(NOT, 'NOT2');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(inA, 0, not1, 0, 'w1');
    c.wire(not1, 0, not2, 0, 'w2');
    const outNet = c.wire(not2, 0, out, 0, 'w3');

    // Initial input = 0 -> NOT(0)=1 -> NOT(1)=0
    c.setInput(inA, '0');
    c.settle();
    expect(c.getNetValue('w1')).toBe('0');
    expect(c.getNetValue('w2')).toBe('1');
    expect(c.getNetValue(outNet)).toBe('0');

    // Toggle input to 1 -> NOT(1)=0 -> NOT(0)=1
    c.setInput(inA, '1');
    c.settle();
    expect(c.getNetValue('w1')).toBe('1');
    expect(c.getNetValue('w2')).toBe('0');
    expect(c.getNetValue(outNet)).toBe('1');
  });

  it('propagates through 3 or more gates in sequence (AND -> OR -> NOT -> BUFFER)', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const inB = c.addComponent(INPUT, 'B');
    const inC = c.addComponent(INPUT, 'C');
    const andGate = c.addComponent(AND, 'AND');
    const orGate = c.addComponent(OR, 'OR');
    const notGate = c.addComponent(NOT, 'NOT');
    const bufGate = c.addComponent(BUFFER, 'BUF');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(inA, 0, andGate, 0, 'wA');
    c.wire(inB, 0, andGate, 1, 'wB');
    c.wire(andGate, 0, orGate, 0, 'wAnd');
    c.wire(inC, 0, orGate, 1, 'wC');
    c.wire(orGate, 0, notGate, 0, 'wOr');
    c.wire(notGate, 0, bufGate, 0, 'wNot');
    const outNet = c.wire(bufGate, 0, out, 0, 'wBuf');

    // A=1, B=1, C=0 -> AND(1,1)=1 -> OR(1,0)=1 -> NOT(1)=0 -> BUF(0)=0
    c.setInput(inA, '1');
    c.setInput(inB, '1');
    c.setInput(inC, '0');
    c.settle();

    expect(c.getNetValue('wAnd')).toBe('1');
    expect(c.getNetValue('wOr')).toBe('1');
    expect(c.getNetValue('wNot')).toBe('0');
    expect(c.getNetValue(outNet)).toBe('0');

    // Toggle B to 0 -> AND(1,0)=0 -> OR(0,0)=0 -> NOT(0)=1 -> BUF(1)=1
    c.setInput(inB, '0');
    c.settle();

    expect(c.getNetValue('wAnd')).toBe('0');
    expect(c.getNetValue('wOr')).toBe('0');
    expect(c.getNetValue('wNot')).toBe('1');
    expect(c.getNetValue(outNet)).toBe('1');
  });

  it('updates final output reliably when changing inputs repeatedly', () => {
    const c = new Circuit();
    const inA = c.addComponent(INPUT, 'A');
    const not1 = c.addComponent(NOT, 'N1');
    const not2 = c.addComponent(NOT, 'N2');
    const not3 = c.addComponent(NOT, 'N3');
    const out = c.addComponent(OUTPUT, 'OUT');

    c.wire(inA, 0, not1, 0, 'w1');
    c.wire(not1, 0, not2, 0, 'w2');
    c.wire(not2, 0, not3, 0, 'w3');
    const outNet = c.wire(not3, 0, out, 0, 'w4');

    // Test 10 consecutive toggles
    for (let i = 0; i < 10; i++) {
      const val = i % 2 === 0 ? '1' : '0';
      const expectedOut = val === '1' ? '0' : '1'; // 3 inverters: NOT(NOT(NOT(v))) = NOT(v)

      c.setInput(inA, val);
      c.settle();

      expect(c.getNetValue('w1')).toBe(val);
      expect(c.getNetValue(outNet)).toBe(expectedOut);
    }
  });

  it('propagates through multiple downstream fan-out branches', () => {
    const c = new Circuit();
    const src = c.addComponent(INPUT, 'SRC');
    const not1 = c.addComponent(NOT, 'NOT1');
    const not2 = c.addComponent(NOT, 'NOT2');
    const andGate = c.addComponent(AND, 'AND');
    const out1 = c.addComponent(OUTPUT, 'OUT1');
    const out2 = c.addComponent(OUTPUT, 'OUT2');

    // Branch 1: src -> NOT1 -> NOT2 -> OUT1
    c.wire(src, 0, not1, 0);
    c.wire(not1, 0, not2, 0);
    const outNet1 = c.wire(not2, 0, out1, 0);

    // Branch 2: src -> AND (with constant 1) -> OUT2
    const constOne = c.addComponent(INPUT, 'ONE');
    c.setInput(constOne, '1');
    c.wire(src, 0, andGate, 0);
    c.wire(constOne, 0, andGate, 1);
    const outNet2 = c.wire(andGate, 0, out2, 0);

    // src = 0 -> Branch 1 = 0, Branch 2 = 0
    c.setInput(src, '0');
    c.settle();
    expect(c.getNetValue(outNet1)).toBe('0');
    expect(c.getNetValue(outNet2)).toBe('0');

    // src = 1 -> Branch 1 = 1, Branch 2 = 1
    c.setInput(src, '1');
    c.settle();
    expect(c.getNetValue(outNet1)).toBe('1');
    expect(c.getNetValue(outNet2)).toBe('1');
  });
});


