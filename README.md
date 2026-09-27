# logic-sim-core

A headless, event-driven digital logic simulation engine — the core you'd put
underneath a Logisim-style editor UI. No DOM, no canvas, no rendering: just
gates, wires, and time. That separation is deliberate — the debugger,
autograder, and "explain" features all need to inspect simulation state
directly, and that's much easier against a plain TypeScript object graph than
against whatever your canvas is doing.

## Why event-driven?

Every component has a **propagation delay** (in simulated ticks). When an
input changes, the component doesn't update its output immediately — it
schedules an update for `now + delay` ticks later, via a min-heap priority
queue (`EventQueue`). This one decision is why:

- **Feedback loops just work.** A cross-coupled SR latch or a ring oscillator
  needs no special-casing — the scheduler naturally processes cause →
  effect → cause in time order.
- **Oscillation is *detectable*, not a hang.** A circuit that never settles
  keeps generating events forever. `Circuit.run()` caps the number of events
  it will process and throws `OscillationError` if that cap is hit — this
  cap *is* your automatic debugger's "this circuit is unstable" check.
- **You get a real timeline for free.** Every net records a `{time, value}`
  history (`Circuit.getHistory(netName)`), which is exactly what a
  step-debugger or waveform viewer needs to render.

## 4-valued logic, not booleans

Values are `'0' | '1' | 'X' | 'Z'`, not `boolean`. This is what lets the
simulator distinguish "genuinely driven low" from "nothing is driving this
at all" (`Z`, floating) from "conflicting drivers" (`X`). The gate functions
implement the standard **dominant-value rule** real HDL simulators use — e.g.
`OR(1, X)` is `1` regardless of the unknown operand, `AND(0, X)` is `0` —
which is *why* the SR latch test settles cleanly instead of getting stuck at
`X` forever (see the comment in `component.ts` above `andLike`/`orLike` if
you want the full reasoning; it's the single trickiest bit of this codebase
and worth reading before you add more gate types).

## Layout

```
src/
  types.ts       LogicValue, HistoryEntry
  eventQueue.ts  min-heap scheduler (no domain knowledge, pure data structure)
  net.ts         Net: resolves multiple drivers, tracks history
  component.ts   ComponentDefinition interface + built-in gates (AND/OR/NAND/
                 NOR/XOR/XNOR/NOT/BUFFER), INPUT/OUTPUT, DFF, makeClock()
  circuit.ts     Circuit: the public API — addComponent/wire/setInput/run
tests/
  circuit.test.ts  5 tests: basic gates, floating-net detection, an SR latch
                   settling, a ring oscillator being caught, a clocked DFF
```

## Quick example

```ts
import { Circuit, AND, INPUT, OUTPUT } from './src/index.js';

const c = new Circuit();
const a = c.addComponent(INPUT, 'A');
const b = c.addComponent(INPUT, 'B');
const g = c.addComponent(AND, 'G');
const out = c.addComponent(OUTPUT, 'OUT');

c.wire(a, 0, g, 0, 'netA');
c.wire(b, 0, g, 1, 'netB');
c.wire(g, 0, out, 0, 'netOut');

c.setInput(a, '1');
c.setInput(b, '1');
c.run(10);

console.log(c.getNetValue('netOut')); // '1'
```

## Running it

```
npm install
npm test        # vitest, run once
npm run build   # tsc -> dist/
```

## How this maps onto the features you're planning

- **Automatic debugger**: build on `Circuit.getHistory()`,
  `findFloatingNets()`, `findConflictedNets()`, and `OscillationError`.
  These are the four building blocks — floating input, bus contention,
  unstable feedback, and a full value-over-time trace — that cover most of
  what a beginner actually gets wrong in a circuit. A step-through UI is just
  calling `run(t)` for increasing `t` and re-rendering net values each time.
- **Get help / explain**: feed an LLM a structured description (the
  sub-circuit's netlist, plus its current `getNetValue`s) rather than raw
  canvas pixels. Pattern-match common structures (an XOR built from NAND
  gates, a mux, an SR latch) for instant canned explanations first, and fall
  back to a model call for anything else.
- **Challenges**: a challenge is a spec + a hidden test bench (input vectors
  → expected output vectors) + optional starter circuit. Grading is just:
  run the student's circuit through `setInput`/`run`/`getNetValue` for each
  vector and diff the outputs. No new engine code needed.
- **Build from requirement**: for structured specs ("output 1 when ≥2 of 3
  inputs are high"), derive a truth table, minimize it (K-map / Quine–
  McCluskey), and emit `Circuit.addComponent`/`wire` calls directly — fully
  deterministic. For free-form natural language, have an LLM translate into
  that structured form rather than asking it to design gates directly;
  you'll get far more reliable results.

## Extending it

- **New gate types**: add a `ComponentDefinition` in `component.ts`. If it's
  a 2-input gate with a dominant value (like AND/OR), follow the
  `andLike`/`orLike` pattern rather than blanket "any unknown input → X" —
  that shortcut is what makes feedback circuits settle correctly.
- **Multi-bit buses**: currently every net is 1 bit. The cleanest extension
  is a `width` field on `Net` and treating a bus as an array of 1-bit nets
  under one logical name, rather than teaching `LogicValue` to be an array —
  keeps the core simulator unchanged.
- **Subcircuits** (using a saved circuit as a component elsewhere, à la
  Logisim): wrap a `Circuit` in a `ComponentDefinition` whose `evaluate`
  runs the inner circuit for enough ticks to settle and reads its named
  output nets. Worth its own dedicated module rather than bolting onto
  `circuit.ts`.
