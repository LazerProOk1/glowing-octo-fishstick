import { MapCanvas } from '@/components/MapCanvas';
import { ProvincePanel } from '@/components/ProvincePanel';
import { TopBar } from '@/components/TopBar';

export function App(): JSX.Element {
  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#1B4965]">
      <MapCanvas />
      <TopBar />
      <ProvincePanel />
    </div>
  );
}
