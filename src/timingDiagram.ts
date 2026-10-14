import type { HistoryEntry, LogicValue } from './types.js';

export interface TimingSignalInput {
  netName: string;
  label: string;
  history: HistoryEntry[];
}

export interface TimingTransition {
  time: number;
  value: LogicValue;
}

export interface TimingSignal {
  netName: string;
  label: string;
  transitions: TimingTransition[];
}

/** Prepare a stable transition timeline; each net starts high-impedance until its first recorded change. */
export function buildTimingSignals(signals: TimingSignalInput[]): TimingSignal[] {
  return signals.map(({ netName, label, history }) => ({
    netName,
    label,
    transitions: [
      { time: 0, value: 'Z' as LogicValue },
      ...history.map((entry, index) => ({ entry, index }))
        .sort((a, b) => a.entry.time - b.entry.time || a.index - b.index)
        .map(({ entry }) => ({ time: entry.time, value: entry.value }))
    ]
  }));
}

/** Return only the signal rows explicitly selected by their net names. */
export function selectTimingSignals(signals: TimingSignal[], selectedNetNames: ReadonlySet<string>): TimingSignal[] {
  return signals.filter((signal) => selectedNetNames.has(signal.netName));
}
