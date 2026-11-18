// Уровни рельефа, общие для генератора (src/sim) и данных паков (src/content): условия биомов
// записываются через них, а sim импортирует content — поэтому они живут здесь, а не в sim.

/** Уровень моря: суша — клетки выше него. */
export const SEA_LEVEL = 0.5;
/** Heights above this are mountains (top ~3% of land). */
export const MOUNTAIN_LEVEL = 0.85;
/** Heights above this (and up to MOUNTAIN_LEVEL) are hills (~12% of land). */
export const HILL_LEVEL = 0.72;
