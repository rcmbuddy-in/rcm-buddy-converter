import { useDashboard } from '@/contexts/DashboardContext';
import { fN } from '@/lib/rcm-utils';

export function DataQualityBadge() {
  const { dqReport, openDQModal } = useDashboard();
  if (!dqReport || dqReport.fileRejected) return null;

  const pct = dqReport.totalRows > 0 ? ((dqReport.cleanRows + dqReport.warningRows) / dqReport.totalRows) * 100 : 0;
  const color = pct > 90 ? '#15803D' : pct > 70 ? '#D97706' : '#DC2626';
  const dot = pct > 90 ? '🟢' : pct > 70 ? '🟡' : '🔴';

  return (
    <button
      onClick={openDQModal}
      title="View data quality report"
      className="flex items-center gap-1.5 bg-primary-foreground/15 border border-primary-foreground/25 text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary-foreground/25 transition-colors"
    >
      <span className="text-[11px]">{dot}</span>
      <span className="hidden md:inline">DQ</span>
      <span className="font-bold" style={{ color: '#fff' }}>{fN(pct)}%</span>
    </button>
  );
}