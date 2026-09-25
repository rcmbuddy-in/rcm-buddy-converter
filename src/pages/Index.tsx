import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext';
import { ChartPrefsProvider } from '@/contexts/ChartPrefsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
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
import { MoMTab } from '@/components/dashboard/MoMTab';
import { CorporateTab } from '@/components/dashboard/CorporateTab';
import { CashFlowTab } from '@/components/dashboard/CashFlowTab';
import { PayerProfitabilityTab } from '@/components/dashboard/PayerProfitabilityTab';
import { DSOTab } from '@/components/dashboard/DSOTab';
import { DataQualityModal } from '@/components/dashboard/DataQualityModal';
import { VarianceTab } from '@/components/dashboard/VarianceTab';
import { AuditTab } from '@/components/dashboard/AuditTab';

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
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'variance' && <VarianceTab />}
        {activeTab === 'audit' && <AuditTab />}
        {activeTab === 'financial' && <FinancialTab />}
        {activeTab === 'tat' && <TATTab />}
        {activeTab === 'denial' && <DenialTab />}
        {activeTab === 'ar' && <ARTab />}
        {activeTab === 'payer' && <PayerTab />}
        {activeTab === 'mom' && <MoMTab />}
        {activeTab === 'corporate' && <CorporateTab />}
        {activeTab === 'cashflow' && <CashFlowTab />}
        {activeTab === 'profitability' && <PayerProfitabilityTab />}
        {activeTab === 'dso' && <DSOTab />}
        {activeTab === 'leakage' && <LeakageTab />}
        {activeTab === 'ai-report' && <AIReportTab />}
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
