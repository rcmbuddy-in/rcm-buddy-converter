import { useDashboard } from '@/contexts/DashboardContext';
import { SectionHeading } from './SectionHeading';
import { AUDIT, KPIS, fmtKpi } from '@/lib/kpi-variance';

export function AuditTab() {
  const { globalData } = useDashboard();
  if (!globalData) return null;
  const d = globalData.data;
  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Formula Audit Trail" tag="How every CEO-facing number is calculated" />
      <div className="grid gap-4">
        {AUDIT.map(a => {
          const k = KPIS.find(x => x.id === a.id)!;
          const samples = d.map(x => ({ x, s: a.sample(x) })).filter(r => r.s).slice(0, 3);
          return (
            <div key={a.id} className="bg-card border border-border rounded-xl p-5 shadow-card">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h4 className="font-display text-base font-bold text-foreground">{k.label}</h4>
                <span className="font-display text-lg font-bold text-primary">{fmtKpi(k.kind, k.calc(globalData))}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{a.definition}</p>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div><dt className="font-bold uppercase tracking-wider text-muted-foreground">Formula</dt><dd className="font-mono text-foreground">{a.formula}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-muted-foreground">Date basis</dt><dd className="text-foreground">{a.dateBasis}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-muted-foreground">Included statuses</dt><dd className="text-foreground">{a.included}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-muted-foreground">Exclusions</dt><dd className="text-foreground">{a.exclusions}</dd></div>
              </dl>
              {samples.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Sample claims from your data</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {samples.map(({ x, s }, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="py-1 pr-2 text-muted-foreground">{x.admission?.toLocaleDateString('en-IN') ?? '—'}</td>
                          <td className="py-1 pr-2">{x.status}</td>
                          <td className="py-1 pr-2 text-muted-foreground">{x.tpa}</td>
                          <td className="py-1 font-mono">{s}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
