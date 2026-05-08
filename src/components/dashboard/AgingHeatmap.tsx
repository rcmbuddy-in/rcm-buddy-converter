import { GlobalData } from '@/lib/rcm-data';
import { fmt, shortP } from '@/lib/rcm-utils';

const BUCKETS = ['0-7', '8-15', '16-30', '30+'] as const;

function bucketFor(days: number): typeof BUCKETS[number] {
  if (days <= 7) return '0-7';
  if (days <= 15) return '8-15';
  if (days <= 30) return '16-30';
  return '30+';
}

function cellColor(value: number, max: number) {
  if (max === 0 || value === 0) return 'hsl(var(--muted))';
  const r = value / max;
  if (r > 0.66) return '#9B1C1C';
  if (r > 0.33) return '#D97706';
  if (r > 0.10) return '#FACC15';
  return '#16A34A';
}

export function AgingHeatmap({ g }: { g: GlobalData }) {
  const open = g.data.filter(x => !['Settled', 'Settlement Initiated', 'Cancelled'].includes(x.status)
    && !x.status.toLowerCase().includes('denied'));

  const insurerTotals: Record<string, number> = {};
  open.forEach(x => { insurerTotals[x.insurer || 'Unknown'] = (insurerTotals[x.insurer || 'Unknown'] || 0) + x.claimedAmt; });
  const top = Object.entries(insurerTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);

  const grid: Record<string, Record<string, number>> = {};
  top.forEach(k => { grid[k] = { '0-7': 0, '8-15': 0, '16-30': 0, '30+': 0 }; });
  const now = Date.now();
  open.forEach(x => {
    const k = x.insurer || 'Unknown';
    if (!grid[k]) return;
    if (!x.admission) return;
    const days = Math.round((now - x.admission.getTime()) / 86400000);
    grid[k][bucketFor(days)] += x.claimedAmt;
  });

  const max = Math.max(...top.flatMap(k => BUCKETS.map(b => grid[k][b])), 1);

  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[13px] font-semibold text-foreground">Claim Aging Heatmap</div>
          <div className="text-[11px] text-muted-foreground">Open AR by insurer × days bucket</div>
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Operations</span>
      </div>
      {top.length === 0 ? (
        <div className="text-[12px] text-muted-foreground italic py-4 text-center">No open claims to age.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium px-2 py-1.5 w-48">Insurer</th>
                {BUCKETS.map(b => (
                  <th key={b} className="text-right font-medium px-2 py-1.5">{b} days</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map(k => (
                <tr key={k}>
                  <td className="px-2 py-1.5 text-foreground font-medium">{shortP(k)}</td>
                  {BUCKETS.map(b => {
                    const v = grid[k][b];
                    return (
                      <td key={b} className="px-1 py-1">
                        <div
                          className="rounded-md text-right px-2 py-1.5 font-semibold text-white"
                          style={{ background: cellColor(v, max), opacity: v === 0 ? 0.35 : 1 }}
                          title={`${shortP(k)} · ${b}d · ${fmt(v)}`}
                        >
                          {v === 0 ? '—' : fmt(v)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
            <span>Low</span>
            <div className="flex gap-1">
              {['#16A34A', '#FACC15', '#D97706', '#9B1C1C'].map(c => (
                <div key={c} className="w-5 h-3 rounded-sm" style={{ background: c }} />
              ))}
            </div>
            <span>High</span>
          </div>
        </div>
      )}
    </div>
  );
}