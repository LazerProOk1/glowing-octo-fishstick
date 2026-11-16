export type Noise2D = (x: number, y: number) => number;

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRADIENT_X = new Float64Array([1, -1, 1, -1, 1, -1, 0, 0]);
const GRADIENT_Y = new Float64Array([1, 1, -1, -1, 0, 0, 1, -1]);

/** Deterministic 32-bit PRNG, returns values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createPermutation(seed: number): Uint8Array {
  const random = mulberry32(seed);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    base[i] = i;
  }
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const current = base[i] ?? 0;
    base[i] = base[j] ?? 0;
    base[j] = current;
  }
  const permutation = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) {
    permutation[i] = base[i & 255] ?? 0;
  }
  return permutation;
}

/** Seeded 2D simplex noise, output in [-1, 1]. */
export function createNoise2D(seed: number): Noise2D {
  const permutation = createPermutation(seed);

  const gradient = (hash: number, x: number, y: number): number => {
    const index = hash & 7;
    return (GRADIENT_X[index] ?? 0) * x + (GRADIENT_Y[index] ?? 0) * y;
  };

  return (x: number, y: number): number => {
    const skew = (x + y) * F2;
    const cellX = Math.floor(x + skew);
    const cellY = Math.floor(y + skew);

    const unskew = (cellX + cellY) * G2;
    const originX = x - (cellX - unskew);
    const originY = y - (cellY - unskew);

    const stepX = originX > originY ? 1 : 0;
    const stepY = originX > originY ? 0 : 1;

    const cornerX = originX - stepX + G2;
    const cornerY = originY - stepY + G2;
    const farX = originX - 1 + 2 * G2;
    const farY = originY - 1 + 2 * G2;

    const ii = cellX & 255;
    const jj = cellY & 255;

    let value = 0;

    let t0 = 0.5 - originX * originX - originY * originY;
    if (t0 > 0) {
      const contribution = t0 * t0;
      value += contribution * contribution * gradient(permutation[ii + (permutation[jj] ?? 0)] ?? 0, originX, originY);
    }

    let t1 = 0.5 - cornerX * cornerX - cornerY * cornerY;
    if (t1 > 0) {
      const contribution = t1 * t1;
      value +=
        contribution * contribution * gradient(permutation[ii + stepX + (permutation[jj + stepY] ?? 0)] ?? 0, cornerX, cornerY);
    }

    let t2 = 0.5 - farX * farX - farY * farY;
    if (t2 > 0) {
      const contribution = t2 * t2;
      value += contribution * contribution * gradient(permutation[ii + 1 + (permutation[jj + 1] ?? 0)] ?? 0, farX, farY);
    }

    return 70 * value;
  };
}

/** Deterministic hash based value in [0, 1). */
export function hash2D(x: number, y: number, seed: number): number {
  let hash = (seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}
