import { MapCanvas } from '@/components/MapCanvas';
import { TopBar } from '@/components/TopBar';

export function App(): JSX.Element {
  return (
    <div className="flex h-full flex-col bg-surface">
      <TopBar />
      <main className="relative min-h-0 flex-1">
        <MapCanvas />
      </main>
    </div>
  );
}
