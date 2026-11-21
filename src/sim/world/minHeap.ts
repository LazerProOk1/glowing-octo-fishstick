/**
 * 4-ary min-heap on (key, index) over typed arrays; ties broken by index, so the pop order is a
 * total order and does not depend on the heap shape. Grows on demand. Four children per node halve
 * the depth of a binary heap: fewer cache misses per pop on large heaps.
 */
export class MinHeap {
  private keys: Float64Array;
  private ids: Int32Array;
  size = 0;
  /** Key of the element returned by the last `pop()`. */
  lastKey = 0;
  constructor(cap: number) {
    const c = Math.max(16, cap);
    this.keys = new Float64Array(c);
    this.ids = new Int32Array(c);
  }
  push(key: number, id: number): void {
    if (this.size === this.ids.length) {
      const keys = new Float64Array(this.ids.length * 2);
      keys.set(this.keys);
      const ids = new Int32Array(this.ids.length * 2);
      ids.set(this.ids);
      this.keys = keys;
      this.ids = ids;
    }
    const { keys, ids } = this;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 2;
      const kp = keys[p]!;
      if (key > kp || (key === kp && id > ids[p]!)) break;
      keys[i] = kp;
      ids[i] = ids[p]!;
      i = p;
    }
    keys[i] = key;
    ids[i] = id;
  }
  /** Pops the minimum and returns its id; its key is available via `lastKey`. */
  pop(): number {
    const { keys, ids } = this;
    const topId = ids[0]!;
    this.lastKey = keys[0]!;
    const n = --this.size;
    const key = keys[n]!;
    const id = ids[n]!;
    let i = 0;
    for (;;) {
      const first = 4 * i + 1;
      if (first >= n) break;
      const last = first + 4 < n ? first + 4 : n;
      let c = first;
      let kc = keys[c]!;
      let ic = ids[c]!;
      for (let j = first + 1; j < last; j++) {
        const kj = keys[j]!;
        if (kj < kc || (kj === kc && ids[j]! < ic)) {
          c = j;
          kc = kj;
          ic = ids[j]!;
        }
      }
      if (kc > key || (kc === key && ic > id)) break;
      keys[i] = kc;
      ids[i] = ic;
      i = c;
    }
    keys[i] = key;
    ids[i] = id;
    return topId;
  }
}
