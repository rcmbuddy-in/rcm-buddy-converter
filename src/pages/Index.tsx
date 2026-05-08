import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext';
import { ChartPrefsProvider } from '@/contexts/ChartPrefsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UploadScreen } from '@/components/UploadScreen';
import { TopBar, NavTabs, FilterBar } from '@/components/dashboard/DashboardLayout';
import { CommandCenterTab } from '@/components/dashboard/CommandCenterTab';
import { LeakageAnalysisTab } from '@/components/dashboard/LeakageAnalysisTab';
import { OperationsTab } from '@/components/dashboard/OperationsTab';
import { IntelligenceTab } from '@/components/dashboard/IntelligenceTab';
import { DataQualityModal } from '@/components/dashboard/DataQualityModal';

function DashboardContent() {
  const { globalData, activeTab } = useDashboard();

  if (!globalData) {
    return (
      <>
        <UploadScreen />
        <DataQualityModal />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <NavTabs />
      <FilterBar />
      <div id="dashboard-tab-content" className="max-w-[1440px] mx-auto px-7 py-6">
        {(activeTab === 'command' || activeTab === 'overview') && <CommandCenterTab />}
        {activeTab === 'leakage-analysis' && <LeakageAnalysisTab />}
        {activeTab === 'ops' && <OperationsTab />}
        {activeTab === 'intel' && <IntelligenceTab />}
      </div>
      <DataQualityModal />
    </div>
  );
}

const Index = () => (
  <ThemeProvider>
    <DashboardProvider>
      <ChartPrefsProvider>
        <DashboardContent />
      </ChartPrefsProvider>
    </DashboardProvider>
  </ThemeProvider>
);

export default Index;
