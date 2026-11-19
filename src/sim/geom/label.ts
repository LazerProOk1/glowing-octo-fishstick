/**
 * Labeling of 4-connected cell regions: one implementation (labelByKey), labelComponents is its
 * mask variant. The traversal (stack, neighbour order) determines the region numbers; later
 * generation steps depend on them, so the order is pinned by the world fingerprints.
 */

/** 4-connected components of equal `key` values. Returns per-cell component id and per-component sizes. */
export function labelByKey(key: Int32Array, w: number, h: number): { comp: Int32Array; sizes: number[] } {
  const n = w * h;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const sizes: number[] = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    const id = sizes.length;
    const k = key[s]!;
    let size = 0;
    let top = 0;
    stack[top++] = s;
    comp[s] = id;
    while (top > 0) {
      const c = stack[--top]!;
      size++;
      const x = c % w;
      if (x > 0 && comp[c - 1] === -1 && key[c - 1] === k) {
        comp[c - 1] = id;
        stack[top++] = c - 1;
      }
      if (x < w - 1 && comp[c + 1] === -1 && key[c + 1] === k) {
        comp[c + 1] = id;
        stack[top++] = c + 1;
      }
      if (c >= w && comp[c - w] === -1 && key[c - w] === k) {
        comp[c - w] = id;
        stack[top++] = c - w;
      }
      if (c + w < n && comp[c + w] === -1 && key[c + w] === k) {
        comp[c + w] = id;
        stack[top++] = c + w;
      }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

/**
 * 4-connected components of a mask (e.g. land = 1, water = 0): areas of equal mask value,
 * both the set and the unset cells are labelled.
 */
export function labelComponents(mask: Uint8Array, w: number, h: number): { comp: Int32Array; sizes: number[] } {
  return labelByKey(Int32Array.from(mask), w, h);
}
