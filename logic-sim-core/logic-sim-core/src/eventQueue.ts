type EventCallback = () => void;

interface QueuedEvent {
  time: number;
  seq: number; // tie-breaker: same-time events run in the order they were scheduled
  callback: EventCallback;
}

/**
 * Min-heap priority queue keyed by simulated time.
 *
 * This is the whole "engine" of the discrete-event simulator: nothing happens
 * instantly. A gate re-evaluating, an output changing, a clock ticking — all
 * of it is just a callback scheduled for some future tick and popped in time
 * order. Giving every gate a propagation delay and driving everything through
 * this queue is what lets feedback loops (latches, oscillators) fall out
 * naturally instead of needing special-case handling.
 */
export class EventQueue {
  private heap: QueuedEvent[] = [];
  private seqCounter = 0;

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  schedule(time: number, callback: EventCallback): void {
    const event: QueuedEvent = { time, seq: this.seqCounter++, callback };
    this.heap.push(event);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): QueuedEvent | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  peekTime(): number | undefined {
    return this.heap[0]?.time;
  }

  private less(a: QueuedEvent, b: QueuedEvent): boolean {
    return a.time !== b.time ? a.time < b.time : a.seq < b.seq;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(this.heap[i], this.heap[parent])) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < n && this.less(this.heap[l], this.heap[smallest])) smallest = l;
      if (r < n && this.less(this.heap[r], this.heap[smallest])) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
