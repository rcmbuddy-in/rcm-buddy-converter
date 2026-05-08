import { GlobalData } from '@/lib/rcm-data';
import { fmt, fN, pct, shortP, ddiff, avg, SEVERITY } from '@/lib/rcm-utils';

function risk(approval: number, leakPct: number, tat: number) {
  let score = 0;
  if (approval < 70) score++;
  if (leakPct > 20) score++;
  if (tat > 35) score++;
  if (score >= 2) return { color: SEVERITY.critical, label: 'High' };
  if (score === 1) return { color: SEVERITY.warning, label: 'Medium' };
  return { color: SEVERITY.good, label: 'Low' };
}

export function InsurerScorecard({ g }: { g: GlobalData }) {
  const map: Record<string, { claimed: number; approved: number; settled: number; cnt: number; tat: number[] }> = {};
  g.data.forEach(x => {
    const k = x.insurer || 'Unknown';
    if (!map[k]) map[k] = { claimed: 0, approved: 0, settled: 0, cnt: 0, tat: [] };
    const m = map[k];
    m.claimed += x.claimedAmt;
    m.approved += x.approvedAmt;
    m.settled += x.settledAmt;
    m.cnt++;
    const t = ddiff(x.admission, x.paymentDate);
    if (t !== null && t < 365) m.tat.push(t);
  });

  const rows = Object.entries(map)
    .filter(([, v]) => v.cnt >= 5)
    .map(([k, v]) => {
      const approval = pct(v.approved, v.claimed);
      const leak = pct(v.claimed - v.settled, v.claimed);
      const tat = avg(v.tat);
      const r = risk(approval, leak, tat);
      return { k, ...v, approval, leak, tat, r };
    })
    .sort((a, b) => b.claimed - a.claimed)
    .slice(0, 12);

  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[13px] font-semibold text-foreground">Insurer Scorecard</div>
          <div className="text-[11px] text-muted-foreground">Approval · TAT · Leakage · Risk</div>
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Top 12 by volume</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left font-medium px-2 py-2">Insurer</th>
              <th className="text-right font-medium px-2 py-2">Claims</th>
              <th className="text-right font-medium px-2 py-2">Billed</th>
              <th className="text-right font-medium px-2 py-2">Approval %</th>
              <th className="text-right font-medium px-2 py-2">Avg TAT</th>
              <th className="text-right font-medium px-2 py-2">Leakage %</th>
              <th className="text-right font-medium px-2 py-2">Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.k} className="border-b border-border/50 hover:bg-muted/40">
                <td className="px-2 py-1.5 text-foreground font-medium">{shortP(r.k)}</td>
                <td className="px-2 py-1.5 text-right">{r.cnt}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.claimed)}</td>
                <td className="px-2 py-1.5 text-right">{fN(r.approval)}%</td>
                <td className="px-2 py-1.5 text-right">{fN(r.tat, 0)}d</td>
                <td className="px-2 py-1.5 text-right">{fN(r.leak)}%</td>
                <td className="px-2 py-1.5 text-right">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                    style={{ background: r.r.color }}
                  >
                    {r.r.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}