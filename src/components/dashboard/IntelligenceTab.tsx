import { useDashboard } from '@/contexts/DashboardContext';
import { RootCauseTable } from './RootCauseTable';
import { RecommendationsPanel } from './RecommendationsPanel';
import { MoMTab } from './MoMTab';
import { CorporateTab } from './CorporateTab';
import { AIReportTab } from './AIReportTab';

export function IntelligenceTab() {
  const { globalData } = useDashboard();
  if (!globalData) return null;
  return (
    <div className="animate-fadeIn">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-bold text-foreground">Intelligence</h2>
        <p className="text-[12px] text-muted-foreground">Root causes, recommendations and trends.</p>
      </div>
      <RootCauseTable g={globalData} />
      <RecommendationsPanel g={globalData} />
      <MoMTab />
      <CorporateTab />
      <AIReportTab />
    </div>
  );
}