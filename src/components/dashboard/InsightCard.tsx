import { AlertTriangle, AlertOctagon, Info, CheckCircle2, ArrowRight } from 'lucide-react';
import { Insight } from '@/lib/insights-engine';

const SEV_STYLES = {
  critical: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-900', text: 'text-red-700 dark:text-red-400', Icon: AlertOctagon, label: 'Urgent' },
  warning:  { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-900', text: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle, label: 'Watch' },
  info:     { bg: 'bg-blue-50 dark:bg-blue-950/30',  border: 'border-blue-200 dark:border-blue-900', text: 'text-blue-700 dark:text-blue-400', Icon: Info, label: 'Insight' },
  good:     { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-900', text: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2, label: 'Healthy' },
} as const;

export function InsightCard({ insight }: { insight: Insight }) {
  const s = SEV_STYLES[insight.severity];
  const Icon = s.Icon;
  return (
    <div className={`rounded-lg border ${s.border} ${s.bg} p-3.5 flex gap-3`}>
      <Icon className={`h-4 w-4 ${s.text} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="text-[13px] font-semibold text-foreground leading-snug">{insight.title}</div>
          <span className={`text-[9px] font-bold tracking-wider uppercase ${s.text} flex-shrink-0`}>{s.label}</span>
        </div>
        <div className="text-[11.5px] text-muted-foreground leading-snug mb-1.5">{insight.detail}</div>
        {insight.impact && (
          <div className="text-[11px] font-semibold text-foreground/90 mb-1">{insight.impact}</div>
        )}
        {insight.action && (
          <div className="flex items-center gap-1 text-[11px] text-foreground/80 mt-1.5 pt-1.5 border-t border-border/60">
            <ArrowRight className="h-3 w-3" />
            <span>{insight.action}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function InsightList({ insights, title, subtitle, empty = 'No issues detected.' }: {
  insights: Insight[]; title: string; subtitle?: string; empty?: string;
}) {
  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[13px] font-semibold text-foreground">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase text-rcm-500">AI Insights</span>
      </div>
      {insights.length === 0 ? (
        <div className="text-[12px] text-muted-foreground italic py-4 text-center">{empty}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      )}
    </div>
  );
}