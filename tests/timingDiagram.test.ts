import { describe, expect, it } from 'vitest';
import { Circuit } from '../src/circuit.js';
import { AND, DFF, INPUT, makeClock, OUTPUT } from '../src/component.js';
import { buildTimingSignals, selectTimingSignals } from '../src/timingDiagram.js';

describe('Timing Diagram data', () => {
  it('adds a high-impedance baseline and preserves all four-state transitions in event order', () => {
    const signals = buildTimingSignals([{
      netName: 'bus',
      label: 'Input A → Output Y',
      history: [
        { time: 2, value: '1' },
        { time: 3, value: 'X' },
        { time: 3, value: '0' },
        { time: 5, value: 'Z' }
      ]
    }]);

    expect(signals).toHaveLength(1);
    expect(signals[0].label).toBe('Input A → Output Y');
    expect(signals[0].transitions).toEqual([
      { time: 0, value: 'Z' },
      { time: 2, value: '1' },
      { time: 3, value: 'X' },
      { time: 3, value: '0' },
      { time: 5, value: 'Z' }
    ]);
  });

  it('provides separate labeled rows for multiple nets and uses recorded current simulation history', () => {
    const circuit = new Circuit();
    const a = circuit.addComponent(INPUT, 'A');
    const b = circuit.addComponent(INPUT, 'B');
    const and = circuit.addComponent(AND, 'G');
    const out = circuit.addComponent(OUTPUT, 'Y');
    circuit.wire(a, 0, and, 0, 'inputA');
    circuit.wire(b, 0, and, 1, 'inputB');
    circuit.wire(and, 0, out, 0, 'outputY');
    circuit.setInput(a, '1');
    circuit.setInput(b, '1');
    circuit.run(3);
    circuit.setInput(a, '0');
    circuit.run(6);

    const signals = buildTimingSignals([
      { netName: 'inputA', label: 'A', history: circuit.getHistory('inputA') },
      { netName: 'outputY', label: 'Y', history: circuit.getHistory('outputY') }
    ]);
    expect(signals.map((signal) => signal.label)).toEqual(['A', 'Y']);
    expect(signals[0].transitions).toContainEqual({ time: 3, value: '0' });
    expect(signals[1].transitions.some((transition) => transition.value === '1')).toBe(true);
    expect(signals[1].transitions.at(-1)?.value).toBe('0');
    expect(selectTimingSignals(signals, new Set(['outputY']))).toEqual([signals[1]]);
    expect(selectTimingSignals(signals, new Set(['inputA', 'outputY']))).toEqual(signals);
  });

  it('returns no selected rows after the selection is cleared and a fresh circuit has no history', () => {
    const previous = new Circuit();
    const source = previous.addComponent(INPUT, 'A');
    const sink = previous.addComponent(OUTPUT, 'Y');
    previous.wire(source, 0, sink, 0, 'signalA');
    previous.setInput(source, '1');
    previous.run(1);
    expect(previous.getHistory('signalA')).toContainEqual({ time: 0, value: '1' });

    const freshCircuit = new Circuit();
    const freshSignal = buildTimingSignals([{ netName: 'newSignal', label: 'New signal', history: freshCircuit.getHistory('newSignal') }]);
    expect(freshSignal[0].transitions).toEqual([{ time: 0, value: 'Z' }]);
    expect(selectTimingSignals(freshSignal, new Set())).toEqual([]);
  });

  it('records clock and DFF transitions at their simulated times', () => {
    const circuit = new Circuit();
    const data = circuit.addComponent(INPUT, 'D');
    const clock = circuit.addComponent(makeClock(2), 'CLK');
    const dff = circuit.addComponent(DFF, 'FF');
    const output = circuit.addComponent(OUTPUT, 'Q');
    circuit.wire(data, 0, dff, 0, 'data');
    circuit.wire(clock, 0, dff, 1, 'clock');
    circuit.wire(dff, 0, output, 0, 'q');
    circuit.setInput(data, '1');
    circuit.run(7);

    const clockTrace = buildTimingSignals([{ netName: 'clock', label: 'CLK', history: circuit.getHistory('clock') }])[0];
    const qTrace = buildTimingSignals([{ netName: 'q', label: 'Q', history: circuit.getHistory('q') }])[0];
    expect(clockTrace.transitions.filter((transition) => transition.value !== 'Z')).toEqual([
      { time: 0, value: '1' },
      { time: 2, value: '0' },
      { time: 4, value: '1' },
      { time: 6, value: '0' }
    ]);
    expect(qTrace.transitions.some((transition) => transition.value === '1' && transition.time > 0)).toBe(true);
  });
});
