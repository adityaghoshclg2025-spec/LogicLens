import { EventQueue } from './eventQueue.js';
import { Net } from './net.js';
import type { ComponentDefinition, ComponentInstance } from './component.js';
import type { LogicValue, HistoryEntry } from './types.js';

export class OscillationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OscillationError';
  }
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${idCounter++}`;

/**
 * High-level API for building and running a circuit. This is the surface a
 * UI — or an "explain" / "build from requirement" feature — talks to; it
 * hides the event queue and net bookkeeping behind addComponent / wire /
 * setInput / run.
 */
export class Circuit {
  private queue = new EventQueue();
  private nets = new Map<string, Net>();
  private components = new Map<string, ComponentInstance>();
  time = 0;

  /** Add an instance of a gate/component definition. Returns its id. */
  addComponent(def: ComponentDefinition<any>, label?: string): string {
    const id = nextId(label ?? def.type);
    this.components.set(id, {
      id,
      def,
      state: def.initialState ? def.initialState() : undefined,
      inputNetIds: new Array(def.inputCount).fill(''),
      outputNetIds: new Array(def.outputCount).fill(''),
    });
    // A component with no inputs (a source, like INPUT or CLOCK) needs one initial
    // kick at t=0 so its starting output actually propagates onto its net.
    if (def.inputCount === 0) {
      this.queue.schedule(0, () => this.evaluateComponent(id));
    }
    return id;
  }

  /** Remove a component instance from the circuit simulation engine. */
  removeComponent(id: string): boolean {
    const inst = this.components.get(id);
    if (!inst) return false;

    inst.outputNetIds.forEach((netName, outIndex) => {
      if (netName) {
        const net = this.nets.get(netName);
        if (net) {
          net.removeDriver(`${id}.out${outIndex}`);
        }
      }
    });

    inst.inputNetIds.forEach((netName) => {
      if (netName) {
        const net = this.nets.get(netName);
        if (net) {
          net.removeReader(id);
        }
      }
    });

    return this.components.delete(id);
  }

  getComponent(id: string): ComponentInstance | undefined {
    return this.components.get(id);
  }

  private getOrCreateNet(netName: string): Net {
    let net = this.nets.get(netName);
    if (!net) {
      net = new Net(netName);
      this.nets.set(netName, net);
    }
    return net;
  }

  /** Connect component `id`'s output pin `outIndex` to a named net. */
  connectOutput(id: string, outIndex: number, netName: string): void {
    const inst = this.components.get(id);
    if (!inst) throw new Error(`Unknown component ${id}`);
    inst.outputNetIds[outIndex] = netName;
    this.getOrCreateNet(netName).addDriver(`${id}.out${outIndex}`);
  }

  /** Connect component `id`'s input pin `inIndex` to a named net. */
  connectInput(id: string, inIndex: number, netName: string): void {
    const inst = this.components.get(id);
    if (!inst) throw new Error(`Unknown component ${id}`);
    inst.inputNetIds[inIndex] = netName;
    this.getOrCreateNet(netName).addReader(id);
  }

  /** Convenience: wire component A's output straight to component B's input on a shared net. */
  wire(fromId: string, fromOut: number, toId: string, toIn: number, netName?: string): string {
    const name = netName ?? `net_${fromId}_${fromOut}_${toId}_${toIn}`;
    this.connectOutput(fromId, fromOut, name);
    this.connectInput(toId, toIn, name);
    return name;
  }

  /** Unwire connection between component A's output pin and component B's input pin on netName. */
  unwire(fromId: string, fromOut: number, toId: string, toIn: number, netName: string): void {
    const fromInst = this.components.get(fromId);
    if (fromInst && fromInst.outputNetIds[fromOut] === netName) {
      fromInst.outputNetIds[fromOut] = '';
    }
    const toInst = this.components.get(toId);
    if (toInst && toInst.inputNetIds[toIn] === netName) {
      toInst.inputNetIds[toIn] = '';
    }

    const net = this.nets.get(netName);
    if (net) {
      net.removeDriver(`${fromId}.out${fromOut}`);
      net.removeReader(toId);
      if (net.hasNoDrivers && net.readerComponentIds.size === 0) {
        this.nets.delete(netName);
      }
    }

    if (toInst) {
      this.queue.schedule(this.time, () => this.evaluateComponent(toId));
    }
  }

  /** Drive an INPUT-type component's value externally (e.g. a user flipping a switch). */
  setInput(id: string, value: LogicValue): void {
    const inst = this.components.get(id);
    if (!inst) throw new Error(`Unknown component ${id}`);
    inst.state = { ...inst.state, value };
    this.queue.schedule(this.time, () => this.evaluateComponent(id));
  }

  /** Force a net to a concrete value once, without a permanent driver — useful for kicking a
   *  feedback loop (e.g. a ring oscillator) off with a real 0/1 instead of a stable 'X'. */
  seedNet(netName: string, value: LogicValue): void {
    const net = this.getOrCreateNet(netName);
    net.forceValue(this.time, value);
    for (const readerId of net.readerComponentIds) {
      const reader = this.components.get(readerId)!;
      this.queue.schedule(this.time + reader.def.delay, () => this.evaluateComponent(readerId));
    }
  }

  getNetValue(netName: string): LogicValue {
    return this.nets.get(netName)?.value ?? 'Z';
  }

  getHistory(netName: string): HistoryEntry[] {
    return this.nets.get(netName)?.history ?? [];
  }

  /** Debugger hook: nets with zero registered drivers are structurally floating inputs. */
  findFloatingNets(): string[] {
    return [...this.nets.entries()].filter(([, net]) => net.hasNoDrivers).map(([name]) => name);
  }

  /** Debugger hook: nets currently resolved to 'X' because of disagreeing drivers or an unknown source. */
  findConflictedNets(): string[] {
    return [...this.nets.entries()].filter(([, net]) => net.value === 'X').map(([name]) => name);
  }

  private evaluateComponent(id: string): void {
    const inst = this.components.get(id);
    if (!inst) return;

    const inputValues = inst.inputNetIds.map((n) => this.getNetValue(n));
    const { outputs, nextState } = inst.def.evaluate(inputValues, inst.state);
    inst.state = nextState;

    outputs.forEach((val, i) => {
      const netName = inst.outputNetIds[i];
      if (!netName) return;
      const net = this.nets.get(netName)!;
      net.setDriverValue(`${id}.out${i}`, val);
      if (net.recordIfChanged(this.time)) {
        for (const readerId of net.readerComponentIds) {
          const reader = this.components.get(readerId)!;
          this.queue.schedule(this.time + reader.def.delay, () => this.evaluateComponent(readerId));
        }
      }
    });

    if (inst.def.autonomous) {
      this.queue.schedule(this.time + inst.def.delay, () => this.evaluateComponent(id));
    }
  }

  /**
   * Advance simulation up to `untilTime`. `maxEvents` is the oscillation guard:
   * a circuit that never settles (e.g. a ring with an odd number of inverters)
   * will keep generating events forever, so we bail out with a clear error
   * instead of hanging — this is exactly the signal an "automatic debugger"
   * feature would catch and report to the user.
   */
  run(untilTime: number, maxEvents = 100_000): void {
    let processed = 0;
    while (!this.queue.isEmpty && (this.queue.peekTime() ?? Infinity) <= untilTime) {
      const evt = this.queue.pop()!;
      this.time = evt.time;
      evt.callback();
      processed++;
      if (processed > maxEvents) {
        throw new OscillationError(
          `Circuit did not settle after ${maxEvents} events (by t=${this.time}) — ` +
            `likely an unstable feedback loop, such as a ring with an odd number of inverters.`
        );
      }
    }
    this.time = untilTime;
  }
}
