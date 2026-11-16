import { clamp } from '@/lib/math';

export interface HillshadeOptions {
  /** Direction the light comes from, degrees clockwise from north */
  readonly azimuthDeg: number;
  /** Sun height above the horizon, degrees */
  readonly altitudeDeg: number;
  /** Vertical exaggeration of the elevation field */
  readonly exaggeration: number;
  /** How much the illumination changes the tile brightness */
  readonly strength: number;
  readonly minFactor: number;
  readonly maxFactor: number;
}

export const DEFAULT_HILLSHADE: HillshadeOptions = {
  azimuthDeg: 315,
  altitudeDeg: 45,
  exaggeration: 0.6,
  strength: 0.55,
  minFactor: 0.88,
  maxFactor: 1.1,
};

/**
 * Per-tile brightness multipliers produced by the hillshade model.
 * Row-major, one value per tile, 1 = unlit flat surface.
 */
export function createHillshadeField(
  heightMap: Float32Array,
  width: number,
  height: number,
  options: HillshadeOptions = DEFAULT_HILLSHADE,
): Float32Array {
  const azimuth = (options.azimuthDeg * Math.PI) / 180;
  const altitude = (options.altitudeDeg * Math.PI) / 180;
  const cosAltitude = Math.cos(altitude);
  const lightX = cosAltitude * Math.sin(azimuth);
  const lightY = -cosAltitude * Math.cos(azimuth);
  const lightZ = Math.sin(altitude);

  const field = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const north = Math.max(0, y - 1);
    const south = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const west = Math.max(0, x - 1);
      const east = Math.min(width - 1, x + 1);

      const dzdx = ((heightMap[y * width + east] ?? 0) - (heightMap[y * width + west] ?? 0)) / 2;
      const dzdy = ((heightMap[south * width + x] ?? 0) - (heightMap[north * width + x] ?? 0)) / 2;

      const gx = dzdx * options.exaggeration;
      const gy = dzdy * options.exaggeration;

      const normalLength = Math.sqrt(gx * gx + gy * gy + 1);
      const illumination = (-gx * lightX - gy * lightY + lightZ) / normalLength;
      const relative = illumination / lightZ;

      field[y * width + x] = clamp(1 + options.strength * (relative - 1), options.minFactor, options.maxFactor);
    }
  }

  return field;
}

export interface Field {
  readonly data: Float32Array;
  readonly width: number;
  readonly height: number;
}

/** Bilinear upsampling of a tile sized field to pixel resolution. */
export function upsampleField(
  source: Float32Array,
  width: number,
  height: number,
  scale: number,
): Field {
  const outWidth = width * scale;
  const outHeight = height * scale;
  const data = new Float32Array(outWidth * outHeight);

  for (let py = 0; py < outHeight; py += 1) {
    const sourceY = clamp((py + 0.5) / scale - 0.5, 0, height - 1);
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(height - 1, y0 + 1);
    const ty = sourceY - y0;

    for (let px = 0; px < outWidth; px += 1) {
      const sourceX = clamp((px + 0.5) / scale - 0.5, 0, width - 1);
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(width - 1, x0 + 1);
      const tx = sourceX - x0;

      const topLeft = source[y0 * width + x0] ?? 0;
      const topRight = source[y0 * width + x1] ?? 0;
      const bottomLeft = source[y1 * width + x0] ?? 0;
      const bottomRight = source[y1 * width + x1] ?? 0;

      const top = topLeft + (topRight - topLeft) * tx;
      const bottom = bottomLeft + (bottomRight - bottomLeft) * tx;
      data[py * outWidth + px] = top + (bottom - top) * ty;
    }
  }

  return { data, width: outWidth, height: outHeight };
}

/** Bilinear sample of a tile sized field at fractional tile coordinates. */
export function sampleField(
  field: Float32Array,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
): number {
  const x = clamp(tileX, 0, width - 1);
  const y = clamp(tileY, 0, height - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const topLeft = field[y0 * width + x0] ?? 1;
  const topRight = field[y0 * width + x1] ?? 1;
  const bottomLeft = field[y1 * width + x0] ?? 1;
  const bottomRight = field[y1 * width + x1] ?? 1;

  const top = topLeft + (topRight - topLeft) * tx;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * tx;
  return top + (bottom - top) * ty;
}
