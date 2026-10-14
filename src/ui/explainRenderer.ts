import type { CircuitExplanation, ExplanationStep } from '../explainCircuit.js';
import type { LogicValue } from '../types.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char] ?? char);
}

export function logicValueName(value: LogicValue): string {
  return value === '1' ? 'HIGH' : value === '0' ? 'LOW' : value === 'X' ? 'UNKNOWN' : 'HIGH-IMPEDANCE';
}

function valuePill(value: LogicValue): string {
  return `<span class="explanation-value value-pill val-${value}" aria-label="${logicValueName(value)} (${value})">${logicValueName(value)} <span>(${value})</span></span>`;
}

function pinName(step: ExplanationStep, pin: number): string {
  if (step.type === 'DFF') return pin === 0 ? 'D' : pin === 1 ? 'Clock' : `Input ${pin + 1}`;
  if (step.type === 'NOT' || step.type === 'BUFFER') return 'Input';
  return pin === 0 ? 'A' : pin === 1 ? 'B' : `Input ${pin + 1}`;
}

function renderStep(step: ExplanationStep, index: number): string {
  if (step.kind === 'output') return '';
  const sequential = step.kind === 'sequential';
  const inputRows = step.inputs.map((input) => `
    <li class="explanation-signal-row"><span>${pinName(step, input.pin)}</span>${valuePill(input.value)}</li>`).join('');
  const outputValue = step.outputs[0]?.value ?? 'Z';
  const outputRows = step.outputs.map((output) => {
    const driverValue = output.drivenValue ?? output.value;
    const hasContention = driverValue !== output.value;
    const driverLabel = hasContention
      ? step.kind === 'input' ? 'Input drives' : step.type === 'DFF' ? 'Q drives' : 'Gate drives'
      : step.kind === 'input' ? 'Input value' : step.type === 'DFF' ? 'Q output' : 'Output';
    const driven = `<li class="explanation-signal-row"><span>${driverLabel}</span>${valuePill(driverValue)}</li>`;
    const resolved = hasContention ? `<li class="explanation-signal-row"><span>Shared signal resolves to</span>${valuePill(output.value)}</li>` : '';
    return `${driven}${resolved}`;
  }).join('');
  const outputsHtml = outputRows || '';

  return `<article class="explanation-step ${step.kind === 'unsupported' ? 'is-unsupported' : sequential ? 'is-sequential' : ''}">
    <div class="explanation-step-heading"><span class="explanation-step-number">${index + 1}</span><h4>${escapeHtml(step.label)}</h4></div>
    ${inputRows ? `<ul class="explanation-signals" aria-label="Current input values">${inputRows}</ul>` : ''}
    <p class="explanation-rule">${escapeHtml(step.description)}</p>
    ${outputsHtml ? `<ul class="explanation-signals explanation-outputs" aria-label="Current output values">${outputsHtml}</ul>` : `<p class="explanation-current-value">Current value: ${valuePill(outputValue)}</p>`}
    ${step.note ? `<p class="explanation-note">${escapeHtml(step.note)}</p>` : ''}
  </article>`;
}

/** Render a student-facing explanation with engine details kept behind a disclosure. */
export function renderCircuitExplanationHTML(result: CircuitExplanation): string {
  const outputName = logicValueName(result.outputValue);
  const steps = result.steps.filter((step) => step.kind !== 'output');
  const teachingSteps = steps.map((step, index) => renderStep(step, index)).join('');
  const warnings = result.warnings.length
    ? `<section class="explanation-warnings" aria-labelledby="explanation-warnings-title">
        <h4 id="explanation-warnings-title">Things to know</h4>
        <ul>${result.warnings.map((warning) => `<li class="explanation-warning explanation-warning-${warning.kind}">${escapeHtml(warning.message)}</li>`).join('')}</ul>
      </section>`
    : '';

  const technicalLines = [
    `Output component: ${result.outputId}`,
    `Output net: ${result.outputNet || '(unconnected)'}`,
    ...steps.map((step) => {
      const pinNets = [
        ...step.inputs.map((input) => `input ${input.pin}: ${input.net || '(unconnected)'}`),
        ...step.outputs.map((output) => `output ${output.pin}: ${output.net || '(unconnected)'}`)
      ];
      return `${step.componentId} (${step.type}) — ${pinNets.join('; ') || 'no connected pins'}`;
    }),
    ...result.notes
  ];

  return `<section class="explanation-view">
    <header class="explanation-summary">
      <p class="explanation-eyebrow">Circuit result</p>
      <h3>Why is ${escapeHtml(result.outputLabel)} ${outputName}?</h3>
      <p class="explanation-output-line">The output is ${valuePill(result.outputValue)}.</p>
    </header>
    ${teachingSteps ? `<section class="explanation-flow" aria-label="Circuit explanation in signal-flow order"><h4>Follow the signal</h4>${teachingSteps}</section>` : '<p class="explanation-empty">No upstream components are connected to this output.</p>'}
    ${warnings}
    <details class="explanation-technical">
      <summary>Technical details</summary>
      <ul>${technicalLines.map((line) => `<li><code>${escapeHtml(line)}</code></li>`).join('')}</ul>
    </details>
  </section>`;
}
