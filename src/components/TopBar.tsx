import { useEffect, useState } from 'react';
import { Map, RotateCcw } from 'lucide-react';
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
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        <Map className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <h1 className="text-sm font-medium text-foreground">Карта мира</h1>
        <span className="text-xs tabular-nums text-muted-foreground">
          {world.width} × {world.height}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span id="seed-label" className="text-xs text-muted-foreground">
            Сид
          </span>
          <Slider
            aria-labelledby="seed-label"
            className="w-48"
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
          <span className="w-12 text-right text-xs tabular-nums text-foreground">{draftSeed}</span>
        </div>
        <Button onClick={generateNewWorld}>
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
          Новый мир
        </Button>
      </div>
    </header>
  );
}
