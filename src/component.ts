import type { LogicValue } from './types.js';

/**
 * A ComponentDefinition is a pure description of a gate/element's behavior:
 * given input values (and, for stateful parts, its current internal state),
 * produce output values and next state. It knows nothing about nets,
 * scheduling, or wiring — that separation is what makes gates trivially
 * unit-testable and easy to add without touching the simulator itself.
 */
export interface ComponentDefinition<S = undefined> {
  type: string;
  inputCount: number;
  outputCount: number;
  /** Propagation delay in simulated ticks between an input settling and the output updating. */
  delay: number;
  /** Set for components that re-schedule themselves every cycle regardless of input changes (e.g. a clock). */
  autonomous?: boolean;
  initialState?: () => S;
  evaluate(inputs: LogicValue[], state: S): { outputs: LogicValue[]; nextState: S };
}

export interface ComponentInstance {
  id: string;
  def: ComponentDefinition<any>;
  state: any;
  inputNetIds: string[];
  outputNetIds: string[];
}

function isKnown(v: LogicValue): v is '0' | '1' {
  return v === '0' || v === '1';
}

/**
 * AND/OR (and their inverted forms) follow the standard 4-valued "dominant value"
 * rule real HDL simulators use: a controlling input decides the output even if the
 * *other* input is unknown or floating — e.g. OR(1, X) is definitely 1, AND(0, X) is
 * definitely 0. Only when neither input is dominant, and either is unknown, does the
 * output become genuinely unknown. This dominance is exactly what lets a cross-coupled
 * latch settle to a stable state instead of getting stuck at 'X' forever: whichever
 * gate has its SET/RESET input already known resolves immediately, regardless of what
 * its cross-coupled (still-unevaluated) partner is currently reporting.
 */
function andLike(a: LogicValue, b: LogicValue): LogicValue {
  if (a === '0' || b === '0') return '0';
  return isKnown(a) && isKnown(b) ? '1' : 'X';
}

function orLike(a: LogicValue, b: LogicValue): LogicValue {
  if (a === '1' || b === '1') return '1';
  return isKnown(a) && isKnown(b) ? '0' : 'X';
}

function invert(v: LogicValue): LogicValue {
  return v === '0' ? '1' : v === '1' ? '0' : 'X';
}

const twoInput = (name: string, fn: (a: LogicValue, b: LogicValue) => LogicValue): ComponentDefinition => ({
  type: name,
  inputCount: 2,
  outputCount: 1,
  delay: 1,
  evaluate: ([a, b]) => ({ outputs: [fn(a, b)], nextState: undefined }),
});

export const AND = twoInput('AND', andLike);
export const OR = twoInput('OR', orLike);
export const NAND = twoInput('NAND', (a, b) => invert(andLike(a, b)));
export const NOR = twoInput('NOR', (a, b) => invert(orLike(a, b)));
// XOR/XNOR have no dominant single input — an unknown operand always makes the result unknown.
export const XOR = twoInput('XOR', (a, b) => (isKnown(a) && isKnown(b) ? (a !== b ? '1' : '0') : 'X'));
export const XNOR = twoInput('XNOR', (a, b) => (isKnown(a) && isKnown(b) ? (a === b ? '1' : '0') : 'X'));

export const NOT: ComponentDefinition = {
  type: 'NOT',
  inputCount: 1,
  outputCount: 1,
  delay: 1,
  evaluate: ([a]) => ({ outputs: [a === '1' ? '0' : a === '0' ? '1' : 'X'], nextState: undefined }),
};

export const BUFFER: ComponentDefinition = {
  type: 'BUFFER',
  inputCount: 1,
  outputCount: 1,
  delay: 1,
  evaluate: ([a]) => ({ outputs: [a], nextState: undefined }),
};

/** A user-controlled source: no inputs, one output. Its value is set externally via Circuit.setInput(). */
export const INPUT: ComponentDefinition<{ value: LogicValue }> = {
  type: 'INPUT',
  inputCount: 0,
  outputCount: 1,
  delay: 0,
  initialState: () => ({ value: 'Z' }),
  evaluate: (_inputs, state) => ({ outputs: [state.value], nextState: state }),
};

/** A probe: one input, no outputs — a named point in the circuit for the UI/debugger to read. */
export const OUTPUT: ComponentDefinition = {
  type: 'OUTPUT',
  inputCount: 1,
  outputCount: 0,
  delay: 0,
  evaluate: () => ({ outputs: [], nextState: undefined }),
};

/**
 * Positive-edge-triggered D flip-flop. inputs = [D, CLK].
 * The first stateful, sequential component: it must remember the previous
 * clock value to detect a rising edge, rather than just reacting to levels
 * the way the combinational gates above do.
 */
interface DFFState {
  q: LogicValue;
  prevClk: LogicValue;
}
export const DFF: ComponentDefinition<DFFState> = {
  type: 'DFF',
  inputCount: 2,
  outputCount: 1,
  delay: 1,
  initialState: () => ({ q: 'X', prevClk: '0' }),
  evaluate: ([d, clk], state) => {
    const risingEdge = state.prevClk !== '1' && clk === '1';
    const q = risingEdge ? d : state.q;
    return { outputs: [q], nextState: { q, prevClk: clk } };
  },
};

/** Free-running clock: no inputs, toggles its own output every `halfPeriod` ticks. */
export function makeClock(halfPeriod: number): ComponentDefinition<{ value: LogicValue }> {
  return {
    type: 'CLOCK',
    inputCount: 0,
    outputCount: 1,
    delay: halfPeriod,
    autonomous: true,
    initialState: () => ({ value: '0' }),
    evaluate: (_inputs, state) => {
      const next: LogicValue = state.value === '0' ? '1' : '0';
      return { outputs: [next], nextState: { value: next } };
    },
  };
}

export const BUILTIN_GATES = { AND, OR, NAND, NOR, XOR, XNOR, NOT, BUFFER, INPUT, OUTPUT, DFF };
