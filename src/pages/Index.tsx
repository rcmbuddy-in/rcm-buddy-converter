import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext';
import { ChartPrefsProvider } from '@/contexts/ChartPrefsContext';
import { UploadScreen } from '@/components/UploadScreen';
import { TopBar, NavTabs, FilterBar } from '@/components/dashboard/DashboardLayout';
import { OverviewTab } from '@/components/dashboard/OverviewTab';
import { FinancialTab } from '@/components/dashboard/FinancialTab';
import { TATTab } from '@/components/dashboard/TATTab';
import { DenialTab } from '@/components/dashboard/DenialTab';
import { ARTab } from '@/components/dashboard/ARTab';
import { PayerTab } from '@/components/dashboard/PayerTab';
import { LeakageTab } from '@/components/dashboard/LeakageTab';
import { AIReportTab } from '@/components/dashboard/AIReportTab';

function DashboardContent() {
  const { globalData, activeTab } = useDashboard();

  if (!globalData) return <UploadScreen />;

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <NavTabs />
      <FilterBar />
      <div id="dashboard-tab-content" className="max-w-[1440px] mx-auto px-7 py-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'financial' && <FinancialTab />}
        {activeTab === 'tat' && <TATTab />}
        {activeTab === 'denial' && <DenialTab />}
        {activeTab === 'ar' && <ARTab />}
        {activeTab === 'payer' && <PayerTab />}
        {activeTab === 'leakage' && <LeakageTab />}
        {activeTab === 'ai-report' && <AIReportTab />}
      </div>
    </div>
  );
}

const Index = () => (
  <DashboardProvider>
    <ChartPrefsProvider>
      <DashboardContent />
    </ChartPrefsProvider>
  </DashboardProvider>
);

export default Index;
