/**
 * Four-value logic — the same convention real HDL simulators use, instead of
 * plain booleans:
 *
 *   '0' / '1'  driven low / high
 *   'Z'        high-impedance — nothing is actively driving this point
 *   'X'        unknown / conflict (uninitialized state, or two drivers disagree)
 *
 * Building on 4 values instead of 2 from day one is what lets the debugger
 * later detect real design mistakes (floating inputs, bus contention)
 * instead of silently guessing '0'.
 */
export type LogicValue = '0' | '1' | 'X' | 'Z';

/** A single time-stamped value change on a net — the unit a waveform view or step-debugger reads. */
export interface HistoryEntry {
  time: number;
  value: LogicValue;
}
