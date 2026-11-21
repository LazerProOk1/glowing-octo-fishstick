/**
 * Labeling of 4-connected cell regions: one implementation (labelByKey), labelComponents is its
 * mask variant. Region numbers (first cell in row-major order) feed later generation steps, so
 * the numbering is pinned by the world fingerprints.
 */

/**
 * 4-connected components of equal `key` values. Returns per-cell component id and per-component sizes.
 * Ids are numbered in the order of each component's first cell in row-major order (what a flood
 * fill started from every unlabelled cell in index order gives). Computed in two sequential passes
 * with union-find over provisional labels, which is much faster than a flood fill on large maps.
 */
export function labelByKey(key: Int32Array, w: number, h: number): { comp: Int32Array; sizes: number[] } {
  const n = w * h;
  const comp = new Int32Array(n);
  // parent[l] <= l: a set is always linked under its smallest label, i.e. its first cell.
  const parent = new Int32Array(n);
  let labels = 0;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const k = key[i]!;
      const left = x > 0 && key[i - 1] === k ? comp[i - 1]! : -1;
      const up = y > 0 && key[i - w] === k ? comp[i - w]! : -1;
      if (left < 0 && up < 0) {
        parent[labels] = labels;
        comp[i] = labels++;
      } else if (up < 0) {
        comp[i] = left;
      } else {
        comp[i] = up;
        if (left >= 0 && left !== up) {
          let a = left;
          while (parent[a] !== a) a = parent[a] = parent[parent[a]!]!;
          let b = up;
          while (parent[b] !== b) b = parent[b] = parent[parent[b]!]!;
          if (a < b) parent[b] = a;
          else if (b < a) parent[a] = b;
        }
      }
    }
  }
  // Roots in increasing label order are the components in order of their first cell.
  const id = parent; // reused in place: id of label l is final once all labels below l are done
  let count = 0;
  for (let l = 0; l < labels; l++) {
    const p = parent[l]!;
    id[l] = p === l ? count++ : id[p]!;
  }
  const sizes: number[] = new Array<number>(count).fill(0);
  for (let i = 0; i < n; i++) {
    const c = id[comp[i]!]!;
    comp[i] = c;
    sizes[c]!++;
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
