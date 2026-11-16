import { useEffect, useRef } from 'react';
import { MapRenderer } from '@/rendering/MapRenderer';
import { useWorldStore } from '@/store/worldStore';

export function MapCanvas(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const world = useWorldStore((state) => state.world);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return undefined;
    }
    const renderer = new MapRenderer(canvas);
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setWorld(world);
  }, [world]);

  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-grab" />;
}
