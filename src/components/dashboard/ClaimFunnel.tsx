import { fmt, fN, pct, SEVERITY } from '@/lib/rcm-utils';
import { GlobalData } from '@/lib/rcm-data';

interface Stage { label: string; value: number; color: string; }

export function ClaimFunnel({ g }: { g: GlobalData }) {
  const billed = g.totalClaimed;
  const approved = g.totalApproved;
  const settled = g.totalSettled;
  // "Collected" = settled minus expected TDS already netted; we approximate collected as settled
  // and surface uncollected approved separately.
  const collected = settled;

  const stages: Stage[] = [
    { label: 'Billed',    value: billed,   color: '#1D4ED8' },
    { label: 'Approved',  value: approved, color: '#0891B2' },
    { label: 'Settled',   value: settled,  color: SEVERITY.good },
    { label: 'Collected', value: collected, color: '#047857' },
  ];
  const max = Math.max(...stages.map(s => s.value), 1);

  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-[13px] font-semibold text-foreground">Revenue Funnel</div>
          <div className="text-[11px] text-muted-foreground">Stage-by-stage leakage from billed to collected</div>
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: SEVERITY.critical }}>
          Total leakage {fmt(billed - collected)}
        </span>
      </div>
      <div className="space-y-2.5">
        {stages.map((s, i) => {
          const w = (s.value / max) * 100;
          const prev = i > 0 ? stages[i - 1] : null;
          const drop = prev ? prev.value - s.value : 0;
          const dropPct = prev ? pct(drop, prev.value) : 0;
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-foreground">{s.label}</span>
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{fmt(s.value)}</strong>
                  {prev && drop > 0 && (
                    <span className="ml-2" style={{ color: SEVERITY.critical }}>
                      − {fmt(drop)} ({fN(dropPct)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-7 bg-muted/40 rounded-md overflow-hidden">
                <div
                  className="h-full rounded-md transition-all"
                  style={{ width: `${w}%`, background: s.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}