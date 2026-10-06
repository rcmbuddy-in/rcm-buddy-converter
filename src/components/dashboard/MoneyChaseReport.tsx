import { useMemo } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { computeGapBuckets, allocateGap, GAP_BUCKETS } from '@/lib/gap-buckets';
import { fmt } from '@/lib/rcm-utils';

/** Printable version of the Money Chase sheet: bucket summary + top claims to chase. */
export function MoneyChaseReport() {
  const { globalData } = useDashboard();
  const data = globalData?.data ?? [];
  const { summary, lines } = useMemo(() => {
    const now = new Date();
    const summary = computeGapBuckets(data, now);
    const lines: { name: string; id: string; payer: string; status: string; bucket: string; kind: string; owner: string; amt: number }[] = [];
    data.forEach(x => Object.entries(allocateGap(x, now)).forEach(([id, v]) => {
      const b = GAP_BUCKETS.find(g => g.id === id);
      if (b?.kind === 'recoverable') lines.push({ name: x.patientName, id: x.patientId, payer: x.tpa || x.insurer, status: x.status, bucket: b.label, kind: b.kind, owner: b.owner, amt: v || 0 });
    }));
    lines.sort((a, b) => b.amt - a.amt);
    return { summary, lines: lines.slice(0, 50) };
  }, [data]);

  if (!globalData) return null;
  const th = 'text-left px-2 py-1.5 font-semibold border-b border-border';
  const td = 'px-2 py-1 border-b border-border';

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-bold text-foreground">Money Chase — Billed − Collected Gap</h2>
      <div className="grid grid-cols-3 gap-3">
        {[['Total Gap', summary.total], ['Recoverable', summary.recoverable], ['Written-off', summary.writtenOff]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-2xl font-bold text-foreground">{fmt(v as number)}</div>
          </div>
        ))}
      </div>
      <table className="w-full text-xs bg-card rounded-xl border border-border">
        <thead><tr><th className={th}>Bucket</th><th className={th}>Type</th><th className={th}>Owner</th><th className={th}>Claims</th><th className={th}>Amount</th><th className={th}>Next Action</th></tr></thead>
        <tbody>
          {summary.rows.map(r => (
            <tr key={r.id}><td className={td}>{r.label}</td><td className={td}>{r.kind === 'recoverable' ? 'Recoverable' : 'Written-off'}</td><td className={td}>{r.owner}</td><td className={td}>{r.claims}</td><td className={td + ' font-semibold'}>{fmt(r.value)}</td><td className={td}>{r.action}</td></tr>
          ))}
        </tbody>
      </table>
      <h3 className="font-display text-lg font-bold text-foreground">Top 50 recoverable claims to chase</h3>
      <table className="w-full text-[11px] bg-card rounded-xl border border-border">
        <thead><tr><th className={th}>#</th><th className={th}>Patient</th><th className={th}>IP / UHID</th><th className={th}>Payer</th><th className={th}>Status</th><th className={th}>Bucket</th><th className={th}>Owner</th><th className={th}>Amount</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}><td className={td}>{i + 1}</td><td className={td}>{l.name}</td><td className={td}>{l.id}</td><td className={td}>{l.payer}</td><td className={td}>{l.status}</td><td className={td}>{l.bucket}</td><td className={td}>{l.owner}</td><td className={td + ' font-semibold'}>{fmt(l.amt)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted-foreground">Each claim's gap is allocated to exactly one set of buckets. Full claim list is in the Claims Excel download (Money Chase sheet).</p>
    </div>
  );
}
