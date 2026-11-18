// Priority queue of the province growth (provinces.ts).

const INV_BUCKET_WIDTH = 50;
const BUCKETS = 2048;

/**
 * Monotone bucket priority queue (Dial's algorithm) over a circular array: keys are quantised to
 * 1 / INV_BUCKET_WIDTH; within a bucket, order is LIFO. Every push must be within BUCKETS / INV_BUCKET_WIDTH of the last pop.
 */
export class BucketQueue {
  // Each bucket is a singly linked LIFO stack over typed arrays (head per bucket, `next` per node);
  // popped nodes go to a free list. Same order as per-bucket JS arrays, without their overhead.
  private readonly heads = new Int32Array(BUCKETS).fill(-1);
  private next: Int32Array;
  private ids: Int32Array;
  private used = 0;
  private free = -1;
  private cur = 0;
  private count = 0;
  constructor(capacity: number) {
    const c = Math.max(16, capacity);
    this.next = new Int32Array(c);
    this.ids = new Int32Array(c);
  }
  /** Priority of the bucket the last `pop` came from (quantised). */
  lastKey = 0;
  push(key: number, id: number): void {
    let node = this.free;
    if (node >= 0) {
      this.free = this.next[node]!;
    } else {
      if (this.used === this.ids.length) this.grow();
      node = this.used++;
    }
    const b = ((key * INV_BUCKET_WIDTH) | 0) & (BUCKETS - 1);
    this.ids[node] = id;
    this.next[node] = this.heads[b]!;
    this.heads[b] = node;
    this.count++;
  }
  /** Returns the id of an entry with (approximately) minimal key, or -1 when empty. */
  pop(): number {
    if (this.count === 0) return -1;
    const heads = this.heads;
    for (;;) {
      const b = this.cur & (BUCKETS - 1);
      const node = heads[b]!;
      if (node >= 0) {
        heads[b] = this.next[node]!;
        this.next[node] = this.free;
        this.free = node;
        this.count--;
        this.lastKey = this.cur / INV_BUCKET_WIDTH;
        return this.ids[node]!;
      }
      this.cur++;
    }
  }
  private grow(): void {
    const next = new Int32Array(this.ids.length * 2);
    next.set(this.next);
    const ids = new Int32Array(this.ids.length * 2);
    ids.set(this.ids);
    this.next = next;
    this.ids = ids;
  }
}
