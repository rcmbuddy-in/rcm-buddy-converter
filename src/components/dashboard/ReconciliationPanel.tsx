import type { ReconCheck } from '@/lib/rcm-data';

export function ReconciliationPanel({ checks }: { checks: ReconCheck[] }) {
  const passed = checks.filter(c => c.pass).length;
  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-base text-foreground">Numbers Reconciliation</h3>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${passed === checks.length ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
          {passed}/{checks.length} checks passed
        </span>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {checks.map(c => (
          <li key={c.name} className="flex gap-2 text-xs">
            <span className={c.pass ? 'text-primary' : 'text-destructive'}>{c.pass ? '✔' : '⚠'}</span>
            <span><span className="font-semibold text-foreground">{c.name}</span> <span className="text-muted-foreground">— {c.detail}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
