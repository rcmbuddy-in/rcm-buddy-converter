import { useDashboard } from '@/contexts/DashboardContext';
import { LeakageTab } from './LeakageTab';
import { DenialTab } from './DenialTab';
import { InsurerScorecard } from './InsurerScorecard';
import { getRecoverabilitySplit } from '@/lib/insights-engine';
import { fmt, fN, SEVERITY } from '@/lib/rcm-utils';

export function LeakageAnalysisTab() {
  const { globalData } = useDashboard();
  if (!globalData) return null;
  const split = getRecoverabilitySplit(globalData);
  const recW = split.total ? (split.recoverable / split.total) * 100 : 0;

  return (
    <div className="animate-fadeIn">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-bold text-foreground">Leakage Analysis</h2>
        <p className="text-[12px] text-muted-foreground">Recoverable vs structural — and where to chase first.</p>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
          <div>
            <div className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Recoverable Leakage</div>
            <div className="font-display text-3xl font-bold" style={{ color: SEVERITY.warning }}>{fmt(split.recoverable)}</div>
            <div className="text-[11px] text-muted-foreground">{fN(split.recPct)}% of total leakage is potentially recoverable</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Structural / Non-Recoverable</div>
            <div className="font-display text-2xl font-semibold text-foreground">{fmt(split.structural)}</div>
            <div className="text-[11px] text-muted-foreground">Discount, TDS, exhausted sum-insured</div>
          </div>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden">
          <div style={{ width: `${recW}%`, background: SEVERITY.warning }} />
          <div style={{ width: `${100 - recW}%`, background: SEVERITY.neutral }} />
        </div>
      </div>

      <InsurerScorecard g={globalData} />
      <LeakageTab />
      <DenialTab />
    </div>
  );
}