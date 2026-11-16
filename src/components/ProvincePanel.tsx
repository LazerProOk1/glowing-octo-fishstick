import { X } from 'lucide-react';
import { useWorldStore } from '@/store/worldStore';
import type { Biome } from '@/types/world';

const BIOME_LABELS: Record<Biome, string> = {
  ocean: 'Океан',
  coast: 'Побережье',
  plains: 'Равнина',
  forest: 'Лес',
  mountains: 'Горы',
  desert: 'Пустыня',
  tundra: 'Тундра',
  swamp: 'Болото',
  volcanic: 'Вулкан',
};

export function ProvincePanel(): JSX.Element | null {
  const world = useWorldStore((state) => state.world);
  const selectedProvinceId = useWorldStore((state) => state.selectedProvinceId);
  const selectProvince = useWorldStore((state) => state.selectProvince);

  if (selectedProvinceId === null) {
    return null;
  }

  const province = world.provinces[selectedProvinceId];
  if (province === undefined) {
    return null;
  }

  return (
    <aside className="absolute right-4 top-16 z-10 w-[300px] overflow-hidden rounded-lg border border-zinc-200 bg-white/85 backdrop-blur-md">
      <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-3">
        <span className="text-sm font-medium tracking-tight text-zinc-900">
          Провинция #{province.id}
        </span>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => selectProvince(null)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/20"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <dl className="divide-y divide-zinc-200/70 text-sm">
        <div className="flex items-center justify-between px-3 py-2.5">
          <dt className="text-zinc-500">Биом</dt>
          <dd className="text-zinc-900">{BIOME_LABELS[province.dominantBiome]}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <dt className="text-zinc-500">Население</dt>
          <dd className="tabular-nums text-zinc-900">{province.population}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <dt className="text-zinc-500">Принадлежность</dt>
          <dd className="text-zinc-900">{province.ownerId === null ? 'Нет' : province.ownerId}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <dt className="text-zinc-500">Тайлов</dt>
          <dd className="tabular-nums text-zinc-900">{province.tileCount}</dd>
        </div>
      </dl>
    </aside>
  );
}
