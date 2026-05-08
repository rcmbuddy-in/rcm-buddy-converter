import { useDashboard } from '@/contexts/DashboardContext';
import { AgingHeatmap } from './AgingHeatmap';
import { ARTab } from './ARTab';
import { TATTab } from './TATTab';
import { DSOTab } from './DSOTab';
import { CashFlowTab } from './CashFlowTab';

export function OperationsTab() {
  const { globalData } = useDashboard();
  if (!globalData) return null;
  return (
    <div className="animate-fadeIn">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-bold text-foreground">Operations</h2>
        <p className="text-[12px] text-muted-foreground">Aging, throughput and cash velocity.</p>
      </div>
      <AgingHeatmap g={globalData} />
      <ARTab />
      <TATTab />
      <DSOTab />
      <CashFlowTab />
    </div>
  );
}