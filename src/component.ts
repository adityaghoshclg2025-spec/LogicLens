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
function invert(v: LogicValue): LogicValue {
  return v === '0' ? '1' : v === '1' ? '0' : 'X';
}

export function evaluateAnd(inputs: LogicValue[]): LogicValue {
  if (inputs.some((v) => v === '0')) return '0';
  return inputs.length > 0 && inputs.every(isKnown) ? '1' : 'X';
}

export function evaluateOr(inputs: LogicValue[]): LogicValue {
  if (inputs.some((v) => v === '1')) return '1';
  return inputs.length > 0 && inputs.every(isKnown) ? '0' : 'X';
}

export function evaluateXor(inputs: LogicValue[]): LogicValue {
  if (inputs.length === 0 || !inputs.every(isKnown)) return 'X';
  const highCount = inputs.filter((v) => v === '1').length;
  return highCount % 2 === 1 ? '1' : '0';
}

export function evaluateXnor(inputs: LogicValue[]): LogicValue {
  if (inputs.length === 0 || !inputs.every(isKnown)) return 'X';
  const highCount = inputs.filter((v) => v === '1').length;
  return highCount % 2 === 0 ? '1' : '0';
}

export const CONFIGURABLE_GATE_TYPES = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'] as const;
export type ConfigurableGateType = (typeof CONFIGURABLE_GATE_TYPES)[number];

export function isConfigurableGate(type: string): type is ConfigurableGateType {
  return CONFIGURABLE_GATE_TYPES.includes(type.toUpperCase() as ConfigurableGateType);
}

/**
 * Factory for creating gate definitions with a configurable number of inputs.
 * NOT is strictly single-input.
 */
export function makeGate(type: string, inputCount = 2): ComponentDefinition {
  const upper = type.toUpperCase();
  if (upper === 'NOT') {
    if (inputCount !== 1) {
      throw new Error('NOT gate must remain a single-input gate');
    }
    return NOT;
  }
  if (upper === 'BUFFER') {
    if (inputCount !== 1) {
      throw new Error('BUFFER must have 1 input');
    }
    return BUFFER;
  }

  if (inputCount < 2) {
    throw new Error(`${upper} gate must have at least 2 inputs`);
  }

  let evalFn: (inputs: LogicValue[]) => LogicValue;
  switch (upper) {
    case 'AND':
      evalFn = evaluateAnd;
      break;
    case 'OR':
      evalFn = evaluateOr;
      break;
    case 'NAND':
      evalFn = (inputs) => invert(evaluateAnd(inputs));
      break;
    case 'NOR':
      evalFn = (inputs) => invert(evaluateOr(inputs));
      break;
    case 'XOR':
      evalFn = evaluateXor;
      break;
    case 'XNOR':
      evalFn = evaluateXnor;
      break;
    default:
      throw new Error(`Unsupported gate type: ${type}`);
  }

  return {
    type: upper,
    inputCount,
    outputCount: 1,
    delay: 1,
    evaluate: (inputs) => ({ outputs: [evalFn(inputs)], nextState: undefined }),
  };
}

export const AND = makeGate('AND', 2);
export const OR = makeGate('OR', 2);
export const NAND = makeGate('NAND', 2);
export const NOR = makeGate('NOR', 2);
export const XOR = makeGate('XOR', 2);
export const XNOR = makeGate('XNOR', 2);

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
