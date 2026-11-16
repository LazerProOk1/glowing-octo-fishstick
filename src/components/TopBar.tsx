import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { MAX_SEED, MIN_SEED, useWorldStore } from '@/store/worldStore';

export function TopBar(): JSX.Element {
  const world = useWorldStore((state) => state.world);
  const seed = useWorldStore((state) => state.seed);
  const setSeed = useWorldStore((state) => state.setSeed);
  const generateNewWorld = useWorldStore((state) => state.generateNewWorld);
  const [draftSeed, setDraftSeed] = useState<number>(seed);

  useEffect(() => {
    setDraftSeed(seed);
  }, [seed]);

  return (
    <header className="absolute inset-x-0 top-0 z-10 flex h-12 items-center justify-between gap-4 border-b border-zinc-200 bg-white/80 px-4 backdrop-blur-md">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="truncate text-sm font-medium tracking-tight text-zinc-900">Карта мира</h1>
        <span className="text-xs tabular-nums text-zinc-500">
          {world.width} × {world.height}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span id="seed-label" className="text-xs text-zinc-500">
            Сид
          </span>
          <Slider
            aria-labelledby="seed-label"
            className="w-40"
            min={MIN_SEED}
            max={MAX_SEED}
            step={1}
            value={[draftSeed]}
            onValueChange={(value) => {
              const next = value[0];
              if (next !== undefined) {
                setDraftSeed(next);
              }
            }}
            onValueCommit={(value) => {
              const next = value[0];
              if (next !== undefined) {
                setSeed(next);
              }
            }}
          />
          <span className="w-11 text-right text-xs tabular-nums text-zinc-900">{draftSeed}</span>
        </div>

        <span className="h-4 w-px bg-zinc-200" />

        <Button size="sm" onClick={generateNewWorld}>
          Новый мир
        </Button>
      </div>
    </header>
  );
}
