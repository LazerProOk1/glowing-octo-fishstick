import { MapCanvas } from '@/components/MapCanvas';
import { TopBar } from '@/components/TopBar';

export function App(): JSX.Element {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-100">
      <MapCanvas />
      <TopBar />
    </div>
  );
}
