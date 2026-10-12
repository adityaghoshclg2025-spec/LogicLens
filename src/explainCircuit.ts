import type { ComponentInstance } from './component.js';
import { Circuit } from './circuit.js';
import type { LogicValue } from './types.js';

export interface ExplanationInput {
  pin: number;
  net: string;
  value: LogicValue;
  floating: boolean;
}

export interface ExplanationStep {
  componentId: string;
  label: string;
  type: string;
  kind: 'input' | 'gate' | 'sequential' | 'unsupported' | 'output';
  inputs: ExplanationInput[];
  outputs: Array<{ pin: number; net: string; value: LogicValue }>;
  description: string;
  note?: string;
}

export interface CircuitExplanation {
  outputId: string;
  outputLabel: string;
  outputNet: string;
  outputValue: LogicValue;
  steps: ExplanationStep[];
  notes: string[];
}

const GATE_OPERATIONS: Record<string, string> = {
  AND: 'AND: output is 1 only when both inputs are 1; a 0 input forces 0.',
  OR: 'OR: output is 1 when either input is 1.',
  NAND: 'NAND: the inverse of AND.',
  NOR: 'NOR: the inverse of OR.',
  XOR: 'XOR: output is 1 when the two inputs differ.',
  XNOR: 'XNOR: output is 1 when the two inputs match.',
  NOT: 'NOT: inverts a known 0 or 1.',
  BUFFER: 'BUFFER: passes its input value through.'
};

function getLabel(instance: ComponentInstance): string {
  return instance.id.slice(0, instance.id.lastIndexOf('_')) || instance.id;
}

/** Trace a probe's actual upstream nets and report their current simulator values. */
export function explainCircuit(circuit: Circuit, outputId: string): CircuitExplanation | null {
  const output = circuit.getComponent(outputId);
  if (!output || output.def.type !== 'OUTPUT') return null;

  const components = circuit.getAllComponents();
  const driverMap = new Map<string, Array<{ instance: ComponentInstance; pin: number }>>();
  for (const instance of components.values()) {
    instance.outputNetIds.forEach((net, pin) => {
      if (!net) return;
      const drivers = driverMap.get(net) ?? [];
      drivers.push({ instance, pin });
      driverMap.set(net, drivers);
    });
  }

  const floatingNets = new Set(circuit.findFloatingNets());
  const steps: ExplanationStep[] = [];
  const notes: string[] = [];
  const visited = new Set<string>();
  const active = new Set<string>();

  const visitNet = (net: string): void => {
    if (!net) return;
    const drivers = driverMap.get(net) ?? [];
    if (drivers.length === 0) {
      if (floatingNets.has(net)) notes.push(`Net ${net} has no registered driver and is floating.`);
      return;
    }
    for (const { instance } of drivers) visitComponent(instance);
  };

  const visitComponent = (instance: ComponentInstance): void => {
    if (instance.def.type === 'OUTPUT') return;
    if (active.has(instance.id)) {
      notes.push(`Feedback loop detected at ${getLabel(instance)}; the trace stops at this loop boundary.`);
      return;
    }
    if (visited.has(instance.id)) return;
    active.add(instance.id);

    const inputs = instance.inputNetIds.map((net, pin) => ({
      pin,
      net,
      value: net ? circuit.getNetValue(net) : 'Z' as LogicValue,
      floating: !net || floatingNets.has(net)
    }));
    for (const input of inputs) visitNet(input.net);

    const outputs = instance.outputNetIds.map((net, pin) => ({
      pin,
      net,
      value: net ? circuit.getNetValue(net) : 'Z' as LogicValue
    }));
    for (const input of inputs) {
      if (input.value === 'X') notes.push(`Input net ${input.net || `(unconnected pin ${input.pin})`} is X (unknown or conflicting).`);
      if (input.value === 'Z') {
        notes.push(input.floating
          ? `Input net ${input.net || `(unconnected pin ${input.pin})`} is structurally floating and reads Z.`
          : `Input net ${input.net} reads Z (high impedance; no active signal is driving it).`);
      }
    }
    for (const output of outputs) {
      if (output.value === 'X') notes.push(`Output net ${output.net || `(unconnected pin ${output.pin})`} currently resolves to X (unknown or conflicting).`);
      if (output.value === 'Z' && output.net) {
        notes.push(floatingNets.has(output.net)
          ? `Output net ${output.net} is structurally floating and reads Z.`
          : `Output net ${output.net} reads Z (high impedance; no active signal is driving it).`);
      }
    }
    const type = instance.def.type;
    let kind: ExplanationStep['kind'];
    let description: string;
    let note: string | undefined;

    if (type === 'INPUT') {
      kind = 'input';
      description = 'Input switch: its current value is set by the user.';
    } else if (type === 'CLOCK' || instance.def.autonomous || type === 'DFF') {
      kind = 'sequential';
      description = type === 'CLOCK' || instance.def.autonomous
        ? 'Clock/autonomous source: its value changes over simulation time.'
        : 'D flip-flop: Q depends on stored state and a clock edge.';
      note = 'Sequential behavior is summarized at its current value; this trace does not replay its past state or clock edges.';
    } else if (GATE_OPERATIONS[type]) {
      kind = 'gate';
      description = GATE_OPERATIONS[type];
    } else {
      kind = 'unsupported';
      description = `Unsupported component type “${type}”: its operation is not interpreted by Explain My Circuit.`;
      note = 'The output shown is still the simulator’s current resolved net value.';
    }

    steps.push({ componentId: instance.id, label: getLabel(instance), type, kind, inputs, outputs, description, note });
    active.delete(instance.id);
    visited.add(instance.id);
  };

  const outputNet = output.inputNetIds[0] ?? '';
  visitNet(outputNet);
  const outputValue = outputNet ? circuit.getNetValue(outputNet) : 'Z';
  if (!outputNet || floatingNets.has(outputNet)) notes.push('The selected output is floating (Z) because no driver is connected.');
  if (outputValue === 'X') notes.push('X means the simulator cannot determine a single 0/1 value (unknown or conflicting drivers).');
  if (outputValue === 'Z') notes.push('Z means no active signal is driving this output (high impedance).');

  steps.push({
    componentId: outputId,
    label: getLabel(output),
    type: 'OUTPUT',
    kind: 'output',
    inputs: [{ pin: 0, net: outputNet, value: outputValue, floating: !outputNet || floatingNets.has(outputNet) }],
    outputs: [],
    description: `Output probe reads ${outputValue}${outputNet ? ` from net ${outputNet}` : ' from an unconnected input'}.`
  });

  return {
    outputId,
    outputLabel: getLabel(output),
    outputNet,
    outputValue,
    steps,
    notes: [...new Set(notes)]
  };
}
