import { OverviewTab } from './OverviewTab';
import { ReportHeader } from './ReportHeader';
import { FinancialTab } from './FinancialTab';
import { TATTab } from './TATTab';
import { DenialTab } from './DenialTab';
import { ARTab } from './ARTab';
import { PayerTab } from './PayerTab';
import { LeakageTab } from './LeakageTab';
import { AIReportTab } from './AIReportTab';
import { MoMTab } from './MoMTab';
import { CorporateTab } from './CorporateTab';
import { VarianceTab } from './VarianceTab';
import { AuditTab } from './AuditTab';
import { PayerAuditTab } from './PayerAuditTab';
import { CashFlowTab } from './CashFlowTab';
import { PayerProfitabilityTab } from './PayerProfitabilityTab';
import { DSOTab } from './DSOTab';
import { MoneyChaseReport } from './MoneyChaseReport';

interface ExportRenderSurfaceProps {
  tabs: unknown;
}

const renderTab = (tabId: string) => {
  switch (tabId) {
    case 'overview':
      return <OverviewTab />;
    case 'financial':
      return <FinancialTab />;
    case 'tat':
      return <TATTab />;
    case 'denial':
      return <DenialTab />;
    case 'ar':
      return <ARTab />;
    case 'payer':
      return <PayerTab />;
    case 'leakage':
      return <LeakageTab />;
    case 'ai-report':
      return <AIReportTab />;
    case 'mom':
      return <MoMTab />;
    case 'corporate':
      return <CorporateTab />;
    case 'variance': return <VarianceTab />;
    case 'audit': return <AuditTab />;
    case 'payer-audit': return <PayerAuditTab />;
    case 'cashflow': return <CashFlowTab />;
    case 'profitability': return <PayerProfitabilityTab />;
    case 'dso': return <DSOTab />;
    case 'money-chase': return <MoneyChaseReport />;
    default:
      return null;
  }
};

export function ExportRenderSurface({ tabs }: ExportRenderSurfaceProps) {
  const tabIds = Array.isArray(tabs)
    ? tabs.filter((tabId): tabId is string => typeof tabId === 'string')
    : [];

  if (tabIds.length === 0) return null;

  return (
    <div
      id="dashboard-export-surface"
      aria-hidden="true"
      className="fixed left-0 top-0 -z-10 pointer-events-none"
      style={{ width: '1440px', transform: 'translateX(-200vw)', background: '#ffffff' }}
    >
      {tabIds.map(tabId => (
        <section
          key={tabId}
          data-export-section={tabId}
          className="bg-background px-7 py-6"
          style={{ width: '1440px' }}
        >
          <ReportHeader />
          {renderTab(tabId)}
        </section>
      ))}
    </div>
  );
}