// Описание мира: всё, что однозначно задаёт результат генерации (спец §7.2).
import type { GenOptions } from '../../content/biomes/types';
import { DEFAULT_PACKS } from '../../content/registry';

/**
 * Версия генератора. ПРАВИЛО: поднимать на 1 при ЛЮБОМ изменении генерации, которое меняет
 * результат для тех же WorldParams (массивы мира, провинции, рёбра соседства, состав World) —
 * в том же коммите, вместе с обновлением отпечатка в tests/sim/world/fingerprint.test.ts.
 * Чистые оптимизации с побитно тем же результатом версию не меняют.
 * История: 1 — этапы 1–12; 2 — WorldParams, размер мира, граф соседства провинций;
 * 3 — озёра, плотность морских провинций, граница джунглей (этап 1.5).
 */
export const GEN_VERSION = 3;

export type WorldSize = 'small' | 'medium' | 'large';

export const WORLD_SIZES: readonly WorldSize[] = ['small', 'medium', 'large'];
export const DEFAULT_SIZE: WorldSize = 'medium';

/** Размеры карты в клетках. Материки задаются в долях карты, так что размер — это разрешение. */
export const SIZE_PRESETS: Readonly<Record<WorldSize, { readonly w: number; readonly h: number }>> = {
  small: { w: 1024, h: 512 },
  medium: { w: 2048, h: 1024 },
  large: { w: 3072, h: 1536 },
};

/** Высота карты по умолчанию (medium): масштаб для величин, заданных в клетках. */
export const MEDIUM_H = SIZE_PRESETS.medium.h;

export interface WorldParams {
  genVersion: number;
  seed: string;
  /** Паки по порядку. */
  packs: string[];
  options: {
    fantasy: boolean;
    /** Без повторов, по алфавиту. */
    disabledBiomes: string[];
    size: WorldSize;
  };
}

export function isWorldSize(s: string): s is WorldSize {
  return (WORLD_SIZES as readonly string[]).includes(s);
}

/** Параметры по умолчанию для сида: текущая версия, базовый пак, без фэнтези, medium. */
export function defaultParams(seed: string): WorldParams {
  return {
    genVersion: GEN_VERSION,
    seed,
    packs: [...DEFAULT_PACKS],
    options: { fantasy: false, disabledBiomes: [], size: DEFAULT_SIZE },
  };
}

/** Опции сборки биомов из параметров мира. */
export function genOptionsOf(params: WorldParams): GenOptions {
  return {
    packs: params.packs,
    fantasy: params.options.fantasy,
    disabledBiomes: params.options.disabledBiomes,
  };
}
