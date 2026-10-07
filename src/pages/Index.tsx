import { lazy, Suspense, type ComponentType } from 'react';
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext';
import { ChartPrefsProvider } from '@/contexts/ChartPrefsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UploadScreen } from '@/components/UploadScreen';
import { TopBar, NavTabs, FilterBar } from '@/components/dashboard/DashboardLayout';
import { DataQualityModal } from '@/components/dashboard/DataQualityModal';
import { ReportHeader } from '@/components/dashboard/ReportHeader';

// Each report page is loaded only when it is opened, keeping the first load fast.
const lazyTab = (loader: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() => loader().then(m => ({ default: m[name] as ComponentType })));

const TAB_COMPONENTS: Record<string, ComponentType> = {
  overview: lazyTab(() => import('@/components/dashboard/OverviewTab'), 'OverviewTab'),
  variance: lazyTab(() => import('@/components/dashboard/VarianceTab'), 'VarianceTab'),
  audit: lazyTab(() => import('@/components/dashboard/AuditTab'), 'AuditTab'),
  financial: lazyTab(() => import('@/components/dashboard/FinancialTab'), 'FinancialTab'),
  tat: lazyTab(() => import('@/components/dashboard/TATTab'), 'TATTab'),
  denial: lazyTab(() => import('@/components/dashboard/DenialTab'), 'DenialTab'),
  ar: lazyTab(() => import('@/components/dashboard/ARTab'), 'ARTab'),
  payer: lazyTab(() => import('@/components/dashboard/PayerTab'), 'PayerTab'),
  'payer-audit': lazyTab(() => import('@/components/dashboard/PayerAuditTab'), 'PayerAuditTab'),
  mom: lazyTab(() => import('@/components/dashboard/MoMTab'), 'MoMTab'),
  corporate: lazyTab(() => import('@/components/dashboard/CorporateTab'), 'CorporateTab'),
  cashflow: lazyTab(() => import('@/components/dashboard/CashFlowTab'), 'CashFlowTab'),
  profitability: lazyTab(() => import('@/components/dashboard/PayerProfitabilityTab'), 'PayerProfitabilityTab'),
  dso: lazyTab(() => import('@/components/dashboard/DSOTab'), 'DSOTab'),
  leakage: lazyTab(() => import('@/components/dashboard/LeakageTab'), 'LeakageTab'),
  'ai-report': lazyTab(() => import('@/components/dashboard/AIReportTab'), 'AIReportTab'),
};

function TabLoading() {
  return (
    <div className="flex items-center justify-center py-24 gap-3 text-sm text-muted-foreground">
      <div className="w-5 h-5 border-2 border-rcm-300 border-t-rcm-600 rounded-full animate-spin" />
      Loading report…
    </div>
  );
}

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

  const ActiveTab = TAB_COMPONENTS[activeTab];

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <NavTabs />
      <FilterBar />
      <div id="dashboard-tab-content" className="max-w-[1440px] mx-auto px-7 py-6">
        <ReportHeader />
        <Suspense fallback={<TabLoading />}>
          {ActiveTab && <ActiveTab />}
        </Suspense>
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
