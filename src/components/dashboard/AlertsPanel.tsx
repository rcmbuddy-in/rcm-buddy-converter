import { GlobalData } from '@/lib/rcm-data';
import { fmt, fN, pct, shortP, ddiff, avg, SEVERITY } from '@/lib/rcm-utils';

type Alert = { sev: 'critical' | 'warning' | 'info'; title: string; detail: string };

function buildAlerts(g: GlobalData): Alert[] {
  const out: Alert[] = [];

  // Largest insurer leakage
  const insMap: Record<string, { claimed: number; settled: number; cnt: number }> = {};
  g.data.forEach(x => {
    const k = x.insurer || 'Unknown';
    if (!insMap[k]) insMap[k] = { claimed: 0, settled: 0, cnt: 0 };
    insMap[k].claimed += x.claimedAmt;
    insMap[k].settled += x.settledAmt;
    insMap[k].cnt++;
  });
  const insRanked = Object.entries(insMap)
    .filter(([, v]) => v.cnt >= 5)
    .map(([k, v]) => ({ k, gap: v.claimed - v.settled, ...v }))
    .sort((a, b) => b.gap - a.gap);
  if (insRanked[0] && insRanked[0].gap > 0) {
    out.push({
      sev: 'critical',
      title: 'High Leakage',
      detail: `${shortP(insRanked[0].k)} – ${fmt(insRanked[0].gap)} unrealised across ${insRanked[0].cnt} claims`,
    });
  }

  // TAT outlier
  const tatByIns: Record<string, number[]> = {};
  g.data.forEach(x => {
    const t = ddiff(x.admission, x.paymentDate);
    if (t !== null && t < 365) (tatByIns[x.insurer || 'Unknown'] ||= []).push(t);
  });
  const tats = Object.entries(tatByIns)
    .filter(([, v]) => v.length >= 5)
    .map(([k, v]) => ({ k, avg: avg(v) }))
    .sort((a, b) => b.avg - a.avg);
  if (tats[0] && tats[0].avg > 30) {
    out.push({
      sev: 'warning',
      title: 'TAT Alert',
      detail: `${shortP(tats[0].k)} avg TAT ${fN(tats[0].avg, 0)} days — above 30-day target`,
    });
  }

  // Top denial bucket
  const denied = g.data.filter(x => x.status.toLowerCase().includes('denied') || x.status === 'Cancelled');
  if (denied.length > 0) {
    const reasons: Record<string, number> = {};
    denied.forEach(x => { reasons[x.status] = (reasons[x.status] || 0) + 1; });
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    if (top) out.push({
      sev: 'critical',
      title: 'High Denials',
      detail: `${top[0]} – ${fN(pct(top[1], denied.length), 0)}% of all denials (${top[1]} claims)`,
    });
  }

  // Aging risk
  const aging45 = (g.ageBuckets['61-90']?.cnt || 0) + (g.ageBuckets['91-180']?.cnt || 0) + (g.ageBuckets['180+']?.cnt || 0);
  const aging45Val = (g.ageBuckets['61-90']?.val || 0) + (g.ageBuckets['91-180']?.val || 0) + (g.ageBuckets['180+']?.val || 0);
  if (aging45 > 0) out.push({
    sev: 'warning',
    title: 'Aging Risk',
    detail: `${aging45} claims aged >60 days · ${fmt(aging45Val)} blocked AR`,
  });

  return out;
}

const DOT: Record<Alert['sev'], string> = {
  critical: SEVERITY.critical,
  warning: SEVERITY.warning,
  info: '#1D4ED8',
};

export function AlertsPanel({ g }: { g: GlobalData }) {
  const alerts = buildAlerts(g);
  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-[13px] font-semibold text-foreground">Alerts &amp; Bottlenecks</div>
          <div className="text-[11px] text-muted-foreground">Auto-generated from current claim mix</div>
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Live</span>
      </div>
      {alerts.length === 0 ? (
        <div className="text-[12px] text-muted-foreground italic py-4 text-center">No critical alerts.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3 bg-background/40">
              <span className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DOT[a.sev] }} />
              <div>
                <div className="text-[12px] font-semibold text-foreground">{a.title}</div>
                <div className="text-[11.5px] text-muted-foreground leading-snug">{a.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}