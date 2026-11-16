/** Binary min-heap on (key, index) over typed arrays; ties broken by index for determinism. Grows on demand. */
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
  private less(ka: number, ia: number, kb: number, ib: number): boolean {
    return ka < kb || (ka === kb && ia < ib);
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
      const p = (i - 1) >> 1;
      if (!this.less(key, id, keys[p]!, ids[p]!)) break;
      keys[i] = keys[p]!;
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
    const key = keys[--this.size]!;
    const id = ids[this.size]!;
    let i = 0;
    const n = this.size;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.less(keys[c + 1]!, ids[c + 1]!, keys[c]!, ids[c]!)) c++;
      if (!this.less(keys[c]!, ids[c]!, key, id)) break;
      keys[i] = keys[c]!;
      ids[i] = ids[c]!;
      i = c;
    }
    keys[i] = key;
    ids[i] = id;
    return topId;
  }
}
