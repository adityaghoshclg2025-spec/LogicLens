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
  outputs: Array<{ pin: number; net: string; value: LogicValue; drivenValue?: LogicValue }>;
  description: string;
  note?: string;
}

export type ExplanationWarningKind = 'floating' | 'unknown' | 'contention' | 'high-impedance' | 'feedback' | 'sequential' | 'unsupported';

export interface ExplanationWarning {
  kind: ExplanationWarningKind;
  message: string;
}

export interface CircuitExplanation {
  outputId: string;
  outputLabel: string;
  outputNet: string;
  outputValue: LogicValue;
  steps: ExplanationStep[];
  /** Human-readable warnings intended for the teaching view. */
  warnings: ExplanationWarning[];
  /** Engine-oriented diagnostics retained for the collapsed technical section. */
  notes: string[];
}

const DEFAULT_LABELS: Record<string, string> = {
  INPUT: 'Input', OUTPUT: 'Output probe', CLOCK: 'Clock', AND: 'AND gate', OR: 'OR gate',
  NAND: 'NAND gate', NOR: 'NOR gate', XOR: 'XOR gate', XNOR: 'XNOR gate',
  NOT: 'NOT gate', BUFFER: 'Buffer', DFF: 'D flip-flop'
};

function getLabel(instance: ComponentInstance, resolveLabel?: (id: string, type: string) => string | undefined): string {
  const resolved = resolveLabel?.(instance.id, instance.def.type);
  if (resolved) return resolved;

  const prefix = instance.id.slice(0, instance.id.lastIndexOf('_'));
  if (prefix && prefix !== instance.def.type) return prefix;
  return DEFAULT_LABELS[instance.def.type] ?? instance.def.type;
}

function valueName(value: LogicValue): string {
  return value === '1' ? 'HIGH' : value === '0' ? 'LOW' : value === 'X' ? 'UNKNOWN' : 'HIGH-IMPEDANCE';
}

function pinName(type: string, pin: number): string {
  if (type === 'DFF') return pin === 0 ? 'D' : pin === 1 ? 'clock' : `input ${pin + 1}`;
  if (type === 'NOT' || type === 'BUFFER') return 'input';
  return pin === 0 ? 'A' : pin === 1 ? 'B' : `input ${pin + 1}`;
}

function explainGate(type: string, inputs: ExplanationInput[], output: LogicValue): string {
  const named = inputs.map((input) => ({ ...input, name: pinName(type, input.pin), word: valueName(input.value) }));
  const a = named[0];
  const b = named[1];

  if (type === 'AND' || type === 'NAND') {
    const inverted = type === 'NAND';
    const op = inverted ? 'NAND' : 'AND';
    const controlling = named.find((input) => input.value === '0');
    if (controlling) {
      return `${op} needs every input HIGH${inverted ? ', then inverts that result' : ''}. ${controlling.name} is LOW, so the output is ${valueName(output)}.`;
    }
    if (named.every((input) => input.value === '1')) {
      return `Every input is HIGH, so AND is HIGH${inverted ? ' and NAND inverts it to LOW' : ''}. The output is ${valueName(output)}.`;
    }
    return `At least one input is ${named.find((input) => input.value === 'Z') ? 'high-impedance' : 'unknown'}, so the simulator cannot decide the AND result. The output is ${valueName(output)}.`;
  }

  if (type === 'OR' || type === 'NOR') {
    const inverted = type === 'NOR';
    const op = inverted ? 'NOR' : 'OR';
    const controlling = named.find((input) => input.value === '1');
    if (controlling) {
      return `OR is HIGH when any input is HIGH${inverted ? ', then NOR inverts that result' : ''}. ${controlling.name} is HIGH, so the output is ${valueName(output)}.`;
    }
    if (named.every((input) => input.value === '0')) {
      return `Every input is LOW, so OR is LOW${inverted ? ' and NOR inverts it to HIGH' : ''}. The output is ${valueName(output)}.`;
    }
    return `At least one input is ${named.find((input) => input.value === 'Z') ? 'high-impedance' : 'unknown'}, so the simulator cannot decide the OR result. The output is ${valueName(output)}.`;
  }

  if (type === 'XOR' || type === 'XNOR') {
    if (a && b && (a.value === '0' || a.value === '1') && (b.value === '0' || b.value === '1')) {
      const match = a.value === b.value;
      const isHigh = type === 'XOR' ? !match : match;
      return `${type} is HIGH when inputs ${type === 'XOR' ? 'differ' : 'match'}. They ${match ? 'match' : 'differ'}, so the output is ${isHigh ? 'HIGH' : 'LOW'}.`;
    }
    return `${type} needs known 0 or 1 values to compare its inputs. At least one input is unknown or high-impedance, so the output is ${valueName(output)}.`;
  }

  if (type === 'NOT') {
    if (a && (a.value === '0' || a.value === '1')) {
      return `NOT inverts its input: ${a.word} becomes ${valueName(output)}.`;
    }
    return `NOT cannot determine an inverse for an unknown or high-impedance input, so the output is ${valueName(output)}.`;
  }

  if (type === 'BUFFER') {
    return `A buffer passes its input value through unchanged, so the output is ${valueName(output)}.`;
  }
  return `The simulator currently reports ${valueName(output)} for this gate output.`;
}

/** Trace a probe's actual upstream nets and report their current simulator values. */
export function explainCircuit(
  circuit: Circuit,
  outputId: string,
  resolveLabel?: (componentId: string, type: string) => string | undefined
): CircuitExplanation | null {
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
  const warnings: ExplanationWarning[] = [];
  const warningKeys = new Set<string>();
  const notes: string[] = [];
  const visited = new Set<string>();
  const active = new Set<string>();

  const addWarning = (kind: ExplanationWarningKind, message: string, key = `${kind}:${message}`): void => {
    if (warningKeys.has(key)) return;
    warningKeys.add(key);
    warnings.push({ kind, message });
  };

  const inspectSignal = (net: string, value: LogicValue, isFloating: boolean, label: string): void => {
    if (isFloating) {
      addWarning('floating', `${label} is floating because no component is driving it, so it reads Z (high impedance).` , `floating:${net || label}`);
      if (net) notes.push(`Net ${net} has no registered driver and is structurally floating.`);
    }
    if (value === 'X') {
      const drivers = net ? circuit.getNetDrivers(net) : [];
      const activeValues = [...new Set(drivers.map((driver) => driver.value).filter((driverValue) => driverValue !== 'Z'))];
      const hasKnownContention = activeValues.includes('0') && activeValues.includes('1');
      if (hasKnownContention) {
        addWarning('contention', `${label} is UNKNOWN because active drivers disagree.` , `contention:${net}`);
        notes.push(`Net ${net} resolves to X because its active drivers disagree: ${drivers.map((driver) => `${driver.id}=${driver.value}`).join(', ')}.`);
      } else {
        addWarning('unknown', `${label} is UNKNOWN. The simulator cannot determine a single 0 or 1 value; an upstream unknown may be responsible.` , `unknown:${net || label}`);
        notes.push('X means the simulator cannot determine a single 0/1 value from the current signal state.');
        if (net) notes.push(`Net ${net} resolves to X. Current drivers: ${drivers.map((driver) => `${driver.id}=${driver.value}`).join(', ') || 'none'}.`);
      }
    } else if (value === 'Z') {
      if (!isFloating) addWarning('high-impedance', `${label} is HIGH-IMPEDANCE (Z); no active signal is driving it.` , `high-impedance:${net || label}`);
      notes.push('Z means no active signal is driving this point (high impedance).');
      if (net) notes.push(`Net ${net} reads Z; it has no active driver value.`);
    }
  };

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
    const label = getLabel(instance, resolveLabel);
    if (active.has(instance.id)) {
      addWarning('feedback', `A feedback loop reaches ${label}; this trace stops at the loop boundary.`, `feedback:${instance.id}`);
      notes.push(`Feedback loop detected at component ${instance.id} (${label}); upstream traversal stops at this loop boundary.`);
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
      value: net ? circuit.getNetValue(net) : 'Z' as LogicValue,
      drivenValue: net
        ? circuit.getNetDrivers(net).find((driver) => driver.id === `${instance.id}.out${pin}`)?.value ?? circuit.getNetValue(net)
        : 'Z' as LogicValue
    }));

    inputs.forEach((input) => inspectSignal(input.net, input.value, input.floating, `${label} input ${pinName(instance.def.type, input.pin)}`));
    outputs.forEach((outputPin) => inspectSignal(outputPin.net, outputPin.value, !outputPin.net || floatingNets.has(outputPin.net), `${label} output`));

    const type = instance.def.type;
    let kind: ExplanationStep['kind'];
    let description: string;
    let note: string | undefined;

    if (type === 'INPUT') {
      kind = 'input';
      description = 'This input is set by the user.';
    } else if (type === 'CLOCK' || instance.def.autonomous || type === 'DFF') {
      kind = 'sequential';
      description = type === 'CLOCK' || instance.def.autonomous
        ? `This clock is currently ${valueName(outputs[0]?.value ?? 'Z')}; it changes as simulation time advances.`
        : 'A D flip-flop copies D to Q on a rising clock edge and holds Q between edges.';
      note = type === 'DFF'
        ? 'The current Q value is stored state. The current D and clock values alone do not show what happened on an earlier clock edge.'
        : undefined;
      addWarning('sequential', `${label} has time-dependent behavior; this explanation shows its current value, not a replay of earlier events.`, `sequential:${instance.id}`);
    } else if (DEFAULT_LABELS[type] && !['OUTPUT', 'INPUT', 'CLOCK'].includes(type)) {
      kind = 'gate';
      description = explainGate(type, inputs, outputs[0]?.drivenValue ?? outputs[0]?.value ?? 'Z');
      if (outputs[0] && outputs[0].drivenValue !== outputs[0].value) {
        description += ` This gate drives ${valueName(outputs[0].drivenValue ?? outputs[0].value)}, but the shared signal resolves to ${valueName(outputs[0].value)} because drivers disagree.`;
      }
    } else {
      kind = 'unsupported';
      description = `The simulator currently reports ${valueName(outputs[0]?.value ?? 'Z')} for this component, but Explain My Circuit does not interpret its operation.`;
      note = 'The shown value comes from the simulator; the internal operation is not explained.';
      addWarning('unsupported', `The operation of ${label} is not supported by this explanation. Its simulator value is shown as-is.`, `unsupported:${instance.id}`);
    }

    if (inputs.some((input) => input.floating)) {
      addWarning('floating', `${label} has an unconnected or floating input.`, `floating-component:${instance.id}`);
    }
    steps.push({ componentId: instance.id, label, type, kind, inputs, outputs, description, note });
    active.delete(instance.id);
    visited.add(instance.id);
  };

  const outputNet = output.inputNetIds[0] ?? '';
  visitNet(outputNet);
  const outputValue = outputNet ? circuit.getNetValue(outputNet) : 'Z';
  const outputLabel = getLabel(output, resolveLabel);
  inspectSignal(outputNet, outputValue, !outputNet || floatingNets.has(outputNet), `${outputLabel}`);

  steps.push({
    componentId: outputId,
    label: outputLabel,
    type: 'OUTPUT',
    kind: 'output',
    inputs: [{ pin: 0, net: outputNet, value: outputValue, floating: !outputNet || floatingNets.has(outputNet) }],
    outputs: [],
    description: `The output probe currently reads ${valueName(outputValue)} (${outputValue}).`
  });

  return { outputId, outputLabel, outputNet, outputValue, steps, warnings, notes: [...new Set(notes)] };
}
