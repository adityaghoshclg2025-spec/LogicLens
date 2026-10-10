import { Circuit, OscillationError } from './circuit.js';
import type { LogicValue } from './types.js';

export const MAX_TRUTH_TABLE_INPUTS = 10;

export interface TruthTableInputDescriptor {
  id: string; // simulation component ID
  label: string;
}

export interface TruthTableOutputDescriptor {
  id: string; // simulation component ID
  label: string;
}

export interface TruthTableRow {
  inputs: Record<string, '0' | '1'>;
  outputs: Record<string, LogicValue>;
}

export interface TruthTableOptions {
  inputs?: TruthTableInputDescriptor[];
  outputs?: TruthTableOutputDescriptor[];
  maxInputs?: number;
  settleTicks?: number;
}

export interface TruthTableResult {
  success: boolean;
  inputs: string[]; // input column headers in deterministic order
  outputs: string[]; // output column headers in deterministic order
  rows: TruthTableRow[];
  totalCombinations: number;
  warnings: string[];
  error?: string;
  isSequentialDetected: boolean;
}

/**
 * Resolves unique, human-friendly labels for inputs and outputs.
 * Handles duplicate names gracefully (e.g. "A", "A" -> "A (1)", "A (2)").
 */
export function resolveUniqueLabels(
  items: Array<{ id: string; label: string }>,
  defaultPrefix: string = 'In'
): Array<{ id: string; label: string }> {
  const counts = new Map<string, number>();
  // Count frequency of cleaned labels
  items.forEach((item, idx) => {
    let raw = item.label ? item.label.trim() : '';
    // Normalize generic default labels like "Input Switch" or "Output Probe"
    if (!raw || raw.toLowerCase().startsWith('input switch') || raw.toLowerCase().startsWith('output probe')) {
      raw = `${defaultPrefix} ${idx + 1}`;
    }
    counts.set(raw, (counts.get(raw) || 0) + 1);
  });

  const seen = new Map<string, number>();
  return items.map((item, idx) => {
    let raw = item.label ? item.label.trim() : '';
    if (!raw || raw.toLowerCase().startsWith('input switch') || raw.toLowerCase().startsWith('output probe')) {
      raw = `${defaultPrefix} ${idx + 1}`;
    }

    const total = counts.get(raw) || 0;
    if (total > 1) {
      const occurrence = (seen.get(raw) || 0) + 1;
      seen.set(raw, occurrence);
      return { id: item.id, label: `${raw} (${occurrence})` };
    }
    return { id: item.id, label: raw };
  });
}

/**
 * Automatically generates a complete 2^n truth table for a given circuit.
 * Discovers inputs and outputs, applies all binary combinations, allows circuit to settle,
 * records resolved 4-valued outputs ('0'|'1'|'X'|'Z'), and safely restores user state.
 */
export function generateTruthTable(circuit: Circuit, options?: TruthTableOptions): TruthTableResult {
  const maxInputs = options?.maxInputs ?? MAX_TRUTH_TABLE_INPUTS;
  const settleTicks = options?.settleTicks ?? 10;
  const warnings: string[] = [];

  // 1. Discover or use provided inputs & outputs
  let rawInputs: TruthTableInputDescriptor[] = options?.inputs ? [...options.inputs] : [];
  let rawOutputs: TruthTableOutputDescriptor[] = options?.outputs ? [...options.outputs] : [];

  let sequentialDetected = false;

  // If inputs or outputs were not explicitly passed, discover them from circuit components
  const allComps = circuit.getAllComponents();
  for (const [id, inst] of allComps.entries()) {
    if (inst.def.type === 'DFF' || inst.def.type === 'CLOCK' || inst.def.autonomous) {
      sequentialDetected = true;
    }
    if (!options?.inputs && inst.def.type === 'INPUT') {
      rawInputs.push({ id, label: id });
    }
    if (!options?.outputs && inst.def.type === 'OUTPUT') {
      rawOutputs.push({ id, label: id });
    }
  }

  // Deduplicate and resolve clean column header labels
  const resolvedInputs = resolveUniqueLabels(rawInputs, 'In');
  const resolvedOutputs = resolveUniqueLabels(rawOutputs, 'Out');

  const inputHeaders = resolvedInputs.map((i) => i.label);
  const outputHeaders = resolvedOutputs.map((o) => o.label);

  // 2. Validation & Edge Cases
  if (resolvedInputs.length === 0 && resolvedOutputs.length === 0) {
    return {
      success: false,
      inputs: [],
      outputs: [],
      rows: [],
      totalCombinations: 0,
      warnings: [],
      error: 'No input switches or output probes found in circuit. Place Input Switches and Output Probes on the canvas to generate a truth table.',
      isSequentialDetected: sequentialDetected
    };
  }

  if (resolvedInputs.length === 0) {
    return {
      success: false,
      inputs: [],
      outputs: outputHeaders,
      rows: [],
      totalCombinations: 0,
      warnings: [],
      error: 'No input switches found in circuit. Place at least one Input Switch to drive the truth table.',
      isSequentialDetected: sequentialDetected
    };
  }

  if (resolvedOutputs.length === 0) {
    return {
      success: false,
      inputs: inputHeaders,
      outputs: [],
      rows: [],
      totalCombinations: 0,
      warnings: [],
      error: 'No output probes found in circuit. Place at least one Output Probe to measure truth table outputs.',
      isSequentialDetected: sequentialDetected
    };
  }

  if (resolvedInputs.length > maxInputs) {
    const totalCombos = Math.pow(2, resolvedInputs.length);
    return {
      success: false,
      inputs: inputHeaders,
      outputs: outputHeaders,
      rows: [],
      totalCombinations: totalCombos,
      warnings: [],
      error: `Circuit has ${resolvedInputs.length} inputs (${totalCombos.toLocaleString()} combinations). Truth table generation is capped at ${maxInputs} inputs to prevent performance lockup.`,
      isSequentialDetected: sequentialDetected
    };
  }

  if (sequentialDetected) {
    warnings.push('Sequential or clock component detected in circuit. Output values reflect instantaneous simulation state.');
  }

  const floatingNets = circuit.findFloatingNets();
  if (floatingNets.length > 0) {
    warnings.push(`Floating net(s) detected (${floatingNets.join(', ')}). Some outputs may evaluate to 'X' or 'Z'.`);
  }

  // 3. Snapshot original user simulation state to ensure lossless restoration
  const originalInputValues = new Map<string, LogicValue>();
  for (const inputDesc of resolvedInputs) {
    const comp = circuit.getComponent(inputDesc.id);
    const val: LogicValue = comp?.state?.value ?? '0';
    originalInputValues.set(inputDesc.id, val);
  }

  const numInputs = resolvedInputs.length;
  const totalRows = 1 << numInputs; // 2^n
  const rows: TruthTableRow[] = [];

  try {
    // 4. Iterate all 2^n binary combinations in standard ascending count order (00..0 to 11..1)
    for (let r = 0; r < totalRows; r++) {
      const rowInputs: Record<string, '0' | '1'> = {};

      // Set each input bit
      for (let j = 0; j < numInputs; j++) {
        // High-order bit corresponds to first input column
        const bitShift = numInputs - 1 - j;
        const bitVal: '0' | '1' = ((r >> bitShift) & 1) === 1 ? '1' : '0';
        const inputDesc = resolvedInputs[j];

        rowInputs[inputDesc.label] = bitVal;
        circuit.setInput(inputDesc.id, bitVal);
      }

      // Settle circuit in simulation engine
      let rowOscillation = false;
      try {
        circuit.settle();
      } catch (err) {
        if (err instanceof OscillationError) {
          rowOscillation = true;
          if (!warnings.includes('Circuit oscillation detected during simulation evaluation.')) {
            warnings.push('Circuit oscillation detected during simulation evaluation.');
          }
        } else {
          throw err;
        }
      }

      // Read output probe values directly from simulation engine nets
      const rowOutputs: Record<string, LogicValue> = {};
      for (const outputDesc of resolvedOutputs) {
        if (rowOscillation) {
          rowOutputs[outputDesc.label] = 'X';
        } else {
          const outComp = circuit.getComponent(outputDesc.id);
          const netName = outComp?.inputNetIds[0];
          const val: LogicValue = netName ? circuit.getNetValue(netName) : 'Z';
          rowOutputs[outputDesc.label] = val;
        }
      }

      rows.push({
        inputs: rowInputs,
        outputs: rowOutputs
      });
    }
  } finally {
    // 5. Restore original input states and re-settle circuit
    for (const [id, originalVal] of originalInputValues.entries()) {
      circuit.setInput(id, originalVal);
    }
    try {
      circuit.settle();
    } catch {
      // Ignored during restoration
    }
  }

  return {
    success: true,
    inputs: inputHeaders,
    outputs: outputHeaders,
    rows,
    totalCombinations: totalRows,
    warnings,
    isSequentialDetected: sequentialDetected
  };
}
