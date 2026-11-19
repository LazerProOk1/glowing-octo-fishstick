// Фактура волн на воде: неподвижная мелкая рябь, освещённая тем же светом, что отмывка суши
// (лёгкие блики и тени на гребнях). Процедурная, в координатах мира: при панорамировании не
// «ползёт». Без выборок текстур: 3 октавы шума значений с аналитической производной (по 4 хэша).
// GLSL (WAVE_GLSL) вставляется в шейдер карты; TS-копия — для тестов (на GPU точность float32,
// поэтому побитного совпадения нет, совпадает форма).

/** Наибольшее отклонение яркости воды от ряби (±3.5%). */
export const WAVE_AMP = 0.035;
/** Зум (CSS px на клетку): рябь появляется с WAVE_FADE[0] и в полную силу с WAVE_FADE[1]. Общий вид ≤ ~0.9. */
export const WAVE_FADE = [1.5, 5] as const;
/** Частоты октав, 1/клетка: длина волны ~2.9, 1.25 и 0.55 клетки. */
export const WAVE_FREQ = [0.35, 0.8, 1.8] as const;
/** Веса октав. */
export const WAVE_OCT_AMP = [1, 0.6, 0.35] as const;
/** Повороты октав, радианы: разные углы, чтобы ни одна не легла на сетку клеток и не дала полос. */
export const WAVE_ANGLE = [0.35, -0.6, 1.1] as const;
/** Сжатие поперёк волны: гребни вытянуты в ~1.8 раза. */
export const WAVE_STRETCH = 1.8;
/**
 * Октава гаснет, когда её волна короче WAVE_PX[1] физических пикселей, и пропадает при WAVE_PX[0]:
 * волна в пару пикселей дала бы муар.
 */
export const WAVE_PX = [3, 8] as const;
/** Направление на свет в плоскости карты (как LIGHT в шейдере: с северо-запада). */
const LIGHT_XY = [-Math.SQRT1_2, -Math.SQRT1_2] as const;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Сила ряби по зуму: 0 на общем виде, 1 вблизи. */
export function waveStrength(zoom: number): number {
  return smoothstep(WAVE_FADE[0], WAVE_FADE[1], zoom);
}

const fract = (v: number): number => v - Math.floor(v);

/** Тот же хэш, что hash12 в шейдере. */
function hash12(x: number, y: number): number {
  // p3 = fract(p.xyx · 0.1031); p3 += dot(p3, p3.yzx + 33.33); fract((p3.x + p3.y) · p3.z)
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = fract(x * 0.1031);
  const s = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += s;
  b += s;
  c += s;
  return fract((a + b) * c);
}

/** Шум значений с квинтической интерполяцией: [значение, d/dx, d/dy]. */
function vnoiseD(x: number, y: number): [number, number, number] {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const a = hash12(ix, iy);
  const b = hash12(ix + 1, iy);
  const c = hash12(ix, iy + 1);
  const d = hash12(ix + 1, iy + 1);
  const k1 = b - a;
  const k2 = c - a;
  const k4 = a - b - c + d;
  return [a + k1 * ux + k2 * uy + k4 * ux * uy, dux * (k1 + k4 * uy), duy * (k2 + k4 * ux)];
}

/**
 * Относительное изменение яркости воды от ряби в точке мира (x, y) клеток: в пределах ±WAVE_AMP.
 * pxPerCell — физических пикселей на клетку (для гашения мелких октав), zoom — CSS px на клетку.
 */
export function waveShade(x: number, y: number, zoom: number, pxPerCell: number): number {
  const strength = waveStrength(zoom);
  if (strength <= 0) return 0;
  let s = 0;
  let norm = 0;
  for (let i = 0; i < 3; i++) {
    const f = WAVE_FREQ[i] as number;
    const ang = WAVE_ANGLE[i] as number;
    const co = Math.cos(ang);
    const si = Math.sin(ang);
    // q = R·p·f, затем сжатие по второй оси; градиент возвращается в оси мира через Rᵀ.
    const qx = (co * x - si * y) * f + 17.1 * i;
    const qy = (si * x + co * y) * f * WAVE_STRETCH + 31.7 * i;
    const n = vnoiseD(qx, qy);
    const gx = n[1];
    const gy = n[2] * WAVE_STRETCH;
    const wx = co * gx + si * gy;
    const wy = -si * gx + co * gy;
    const a = (WAVE_OCT_AMP[i] as number) * smoothstep(WAVE_PX[0], WAVE_PX[1], pxPerCell / f);
    s += a * (wx * LIGHT_XY[0] + wy * LIGHT_XY[1]);
    norm += WAVE_OCT_AMP[i] as number;
  }
  return strength * WAVE_AMP * Math.min(Math.max(s / norm, -1), 1);
}

const f4 = (n: number): string => n.toFixed(4);
const vec3 = (v: readonly number[]): string => `float[3](${v.map(f4).join(', ')})`;

/** GLSL: vnoiseD и waveShade (нужен hash12 и LIGHT шейдера карты). */
export const WAVE_GLSL = /* glsl */ `
const float WAVE_AMP = ${f4(WAVE_AMP)};
const vec2 WAVE_FADE = vec2(${WAVE_FADE.map(f4).join(', ')});
const vec2 WAVE_PX = vec2(${WAVE_PX.map(f4).join(', ')});
const float WAVE_STRETCH = ${f4(WAVE_STRETCH)};
const float WAVE_FREQ[3] = ${vec3(WAVE_FREQ)};
const float WAVE_OCT_AMP[3] = ${vec3(WAVE_OCT_AMP)};
const float WAVE_ANGLE[3] = ${vec3(WAVE_ANGLE)};

// Value noise, quintic interpolation (no creases in the derivative at cell lines): value, d/dx, d/dy.
vec3 vnoiseD(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  float k1 = b - a;
  float k2 = c - a;
  float k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * (vec2(k1, k2) + k4 * u.yx));
}

// Static ripple lit like the hillshade: relative luminance change within +-WAVE_AMP. 3 octaves of
// stretched, rotated value noise (4 hashes each, no texture fetches); an octave fades out when its
// wavelength gets below ~3-8 physical px (no moire); the whole field fades in from mid zoom.
float waveShade(vec2 p, float zoom, float pxPerCell) {
  float strength = smoothstep(WAVE_FADE.x, WAVE_FADE.y, zoom);
  if (strength <= 0.0) return 0.0;
  vec2 l = normalize(LIGHT.xy);
  float s = 0.0;
  float norm = 0.0;
  for (int i = 0; i < 3; i++) {
    float f = WAVE_FREQ[i];
    float co = cos(WAVE_ANGLE[i]);
    float si = sin(WAVE_ANGLE[i]);
    vec2 q = vec2(co * p.x - si * p.y, (si * p.x + co * p.y) * WAVE_STRETCH) * f
      + vec2(17.1, 31.7) * float(i);
    vec3 n = vnoiseD(q);
    vec2 g = vec2(n.y, n.z * WAVE_STRETCH);
    vec2 wg = vec2(co * g.x + si * g.y, -si * g.x + co * g.y);
    float a = WAVE_OCT_AMP[i] * smoothstep(WAVE_PX.x, WAVE_PX.y, pxPerCell / f);
    s += a * dot(wg, l);
    norm += WAVE_OCT_AMP[i];
  }
  return strength * WAVE_AMP * clamp(s / norm, -1.0, 1.0);
}
`;
