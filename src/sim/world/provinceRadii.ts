// Poisson sampling radii for province seeds (provinces.ts, provinceSeeds.ts).
import { borderDistance } from '../geom/edt';
import { KIND_WATER } from './provinceSeeds';

/** Poisson-disk radius on land, tuned for ~3100-3200 land provinces (mean ~250 cells). */
export const LAND_RADIUS = 15.8;
/**
 * Sea Poisson radius by distance to land d: COAST + (OPEN - COAST) * min(1, d / FAR)^1.5.
 * A candidate keeps its own radius from earlier sea samples (provinceSeeds.ts). Coastal seeds sit
 * some 20-40 cells off the shore, where the ramp has already risen, so COAST is below the former
 * single radius (x3): with 2.5 the mean coastal sea province on medium "1" is ~3100 cells, as fine
 * as before (~3300), while the open sea is about twice as coarse (~6000 vs ~2800).
 */
export const SEA_RADIUS_COAST = LAND_RADIUS * 2.5;
export const SEA_RADIUS_OPEN = LAND_RADIUS * 6;
export const SEA_RADIUS_FAR = 80;
/** Lakes and land cells of the sea pattern (they keep sea seeds off the shore): the old radius, x3. */
const OTHER_RADIUS = LAND_RADIUS * 3;

/**
 * Poisson radius of the sea pattern per cell: sea water by its distance to land (SEA_RADIUS_*),
 * lakes and land OTHER_RADIUS. Distance to land = distance to the nearest water/non-water edge
 * (borderDistance on the water mask); lakes never touch the sea, so for sea cells that is land.
 */
export function seaRadiusAt(kind: Uint8Array, lake: Uint8Array, w: number, h: number): (cell: number) => number {
  const n = w * h;
  const water = new Uint16Array(n);
  for (let i = 0; i < n; i++) water[i] = kind[i] === KIND_WATER ? 1 : 0;
  const dist = borderDistance(water, w, h);
  return (c) => {
    if (kind[c] !== KIND_WATER || lake[c]) return OTHER_RADIUS;
    const t = Math.min(1, dist[c]! / SEA_RADIUS_FAR);
    // t^1.5 as t * sqrt(t): sqrt is exact, so the result is the same on every engine.
    return SEA_RADIUS_COAST + (SEA_RADIUS_OPEN - SEA_RADIUS_COAST) * t * Math.sqrt(t);
  };
}
