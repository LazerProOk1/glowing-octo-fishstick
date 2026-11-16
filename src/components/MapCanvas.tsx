import { useEffect, useRef } from 'react';
import { MapRenderer } from '@/rendering/MapRenderer';
import { useWorldStore } from '@/store/worldStore';

export function MapCanvas(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const world = useWorldStore((state) => state.world);
  const selectedProvinceId = useWorldStore((state) => state.selectedProvinceId);
  const selectProvince = useWorldStore((state) => state.selectProvince);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return undefined;
    }
    const renderer = new MapRenderer(canvas, {
      onProvinceSelect: (provinceId) => {
        selectProvince(provinceId);
      },
    });
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [selectProvince]);

  useEffect(() => {
    rendererRef.current?.setWorld(world);
  }, [world]);

  useEffect(() => {
    rendererRef.current?.setSelectedProvince(selectedProvinceId);
  }, [selectedProvinceId, world]);

  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-grab" />;
}
