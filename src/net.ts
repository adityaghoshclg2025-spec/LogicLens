import type { LogicValue, HistoryEntry } from './types.js';

/**
 * A Net is a single electrical node: every pin connected to it sees the same
 * resolved value. A net can have zero, one, or many drivers — modeling a
 * shared bus with tri-state outputs — which is what lets us detect real bus
 * contention (two drivers disagreeing) as 'X' rather than picking one
 * arbitrarily.
 */
export class Net {
  readonly id: string;
  private drivers = new Map<string, LogicValue>(); // pinKey -> value that pin is currently driving
  readonly readerComponentIds = new Set<string>(); // components with an input pin on this net
  value: LogicValue = 'Z';
  history: HistoryEntry[] = [];

  constructor(id: string) {
    this.id = id;
  }

  /** Register a pin as a potential driver of this net (e.g. a gate's output pin). */
  addDriver(pinKey: string): void {
    if (!this.drivers.has(pinKey)) this.drivers.set(pinKey, 'Z');
  }

  removeDriver(pinKey: string): void {
    this.drivers.delete(pinKey);
  }

  addReader(componentId: string): void {
    this.readerComponentIds.add(componentId);
  }

  removeReader(componentId: string): void {
    this.readerComponentIds.delete(componentId);
  }

  setDriverValue(pinKey: string, value: LogicValue): void {
    this.drivers.set(pinKey, value);
  }

  /** True if nothing is even wired to drive this net — a structural floating-input bug. */
  get hasNoDrivers(): boolean {
    return this.drivers.size === 0;
  }

  /** Combine every driver's contribution into this net's resolved value. */
  resolve(): LogicValue {
    if (this.drivers.size === 0) return 'Z';
    const active = [...this.drivers.values()].filter((v) => v !== 'Z');
    if (active.length === 0) return 'Z';
    const distinct = new Set(active);
    if (distinct.size > 1) return 'X'; // bus contention: disagreeing drivers
    return active[0];
  }

  /** Recompute the net's value; returns true (and records history) only if it actually changed. */
  recordIfChanged(time: number): boolean {
    const resolved = this.resolve();
    if (resolved === this.value) return false;
    this.value = resolved;
    this.history.push({ time, value: resolved });
    return true;
  }

  /** Force this net to a concrete value without registering a permanent driver — used to seed
   *  feedback loops (e.g. a ring oscillator) that would otherwise sit at a stable 'X'. */
  forceValue(time: number, value: LogicValue): void {
    if (value === this.value) return;
    this.value = value;
    this.history.push({ time, value });
  }
}
