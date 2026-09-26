import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useDashboard } from '@/contexts/DashboardContext';
import { computeGlobals } from '@/lib/rcm-data';
import { KPIS, fmtKpi, priorPeriod, drivers, loadTargets, saveTargets, TargetMap } from '@/lib/kpi-variance';
import { SectionHeading } from './SectionHeading';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const fd = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function VarianceTab() {
  const { globalData, allRecords, dateFrom, dateTo, period, getGroupKey } = useDashboard();
  const [targets, setTargets] = useState<TargetMap>(loadTargets);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState('approvalRate');
  const [ai, setAi] = useState<{ loading: boolean; text?: string; error?: string }>({ loading: false });

  const pp = useMemo(() => globalData ? priorPeriod(globalData.data, allRecords, dateFrom, dateTo, period) : null, [globalData, allRecords, dateFrom, dateTo, period]);
  const prevG = useMemo(() => pp && pp.prev.length ? computeGlobals(pp.prev) : null, [pp]);

  const rows = useMemo(() => {
    if (!globalData) return [];
    return KPIS.map(k => {
      const cur = k.calc(globalData);
      const prev = prevG ? k.calc(prevG) : null;
      const delta = prev !== null ? cur - prev : null;
      const good = delta === null || delta === 0 ? null : (delta > 0) === k.higherIsBetter;
      const t = targets[k.id];
      const drv = pp && prevG ? drivers(k, globalData.data, pp.prev, getGroupKey) : [];
      return { k, cur, prev, delta, good, target: t?.target || null, benchmark: t?.benchmark || null, drv };
    });
  }, [globalData, prevG, pp, targets, getGroupKey]);

  if (!globalData) return null;
  const sel = rows.find(r => r.k.id === selected)!;

  const explain = async () => {
    setAi({ loading: true });
    const { data, error } = await supabase.functions.invoke('kpi-explain', {
      body: {
        focusKpi: sel.k.label,
        currentPeriod: pp ? `${fd(pp.curStart)} to ${fd(pp.curEnd)}` : globalData.dateRange,
        priorPeriod: pp ? `${fd(pp.prevStart)} to ${fd(pp.prevEnd)}` : 'not available',
        kpis: rows.map(r => ({ kpi: r.k.label, current: fmtKpi(r.k.kind, r.cur), prior: fmtKpi(r.k.kind, r.prev), target: r.target ? fmtKpi(r.k.kind, r.target) : null, benchmark: r.benchmark ? fmtKpi(r.k.kind, r.benchmark) : null, higherIsBetter: r.k.higherIsBetter })),
        topDriversOfFocusKpi: sel.drv.map(d => ({ payer: d.name, contribution: fmtKpi(sel.k.kind === 'pct' ? 'pct' : sel.k.kind, d.contribution) })),
        reconciliation: globalData.reconciliation,
        claimCounts: { current: globalData.n, prior: pp?.prev.length ?? 0 },
      },
    });
    const msg = (data as any)?.error || (error ? ((await (error as any).context?.json?.().catch(() => null))?.error || error.message) : null);
    if (msg) setAi({ loading: false, error: msg });
    else setAi({ loading: false, text: (data as any).text });
  };

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Period-over-Period Variance" tag={pp ? `${fd(pp.curStart)}–${fd(pp.curEnd)} vs ${fd(pp.prevStart)}–${fd(pp.prevEnd)}` : 'No prior period'} />
      {!prevG && <p className="text-sm text-muted-foreground mb-4">No claims found in the prior period of the same length. Pick a narrower date range to see comparisons.</p>}

      <div className="flex justify-end mb-2">
        <Button variant="outline" size="sm" onClick={() => { if (editing) saveTargets(targets); setEditing(!editing); }}>{editing ? 'Save targets' : 'Edit targets & benchmarks'}</Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-x-auto shadow-card mb-6">
        <table className="w-full text-sm">
          <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            {['KPI', 'Current', 'Prior', 'Change', 'Target', 'Benchmark', 'Top driver'].map(h => <th key={h} className="text-left p-3">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => {
              const pctChg = r.prev ? (r.delta! / Math.abs(r.prev)) * 100 : null;
              const vsT = r.target ? ((r.cur >= r.target) === r.k.higherIsBetter) : null;
              return (
                <tr key={r.k.id} onClick={() => setSelected(r.k.id)} className={`border-b border-border/50 cursor-pointer hover:bg-muted/40 ${selected === r.k.id ? 'bg-muted/60' : ''}`}>
                  <td className="p-3 font-semibold">{r.k.label}</td>
                  <td className="p-3 font-display font-bold">{fmtKpi(r.k.kind, r.cur)}</td>
                  <td className="p-3 text-muted-foreground">{fmtKpi(r.k.kind, r.prev)}</td>
                  <td className="p-3">{r.delta === null ? '—' : (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.good === null ? 'badge-info' : r.good ? 'badge-good' : 'badge-critical'}`}>
                      {r.delta > 0 ? '▲' : r.delta < 0 ? '▼' : '■'} {r.k.kind === 'pct' ? fN2(r.delta) + ' pts' : fmtKpi(r.k.kind, Math.abs(r.delta))}{pctChg !== null && r.k.kind !== 'pct' ? ` (${pctChg.toFixed(1)}%)` : ''}
                    </span>)}</td>
                  {(['target', 'benchmark'] as const).map(f => (
                    <td key={f} className="p-3" onClick={e => editing && e.stopPropagation()}>
                      {editing ? <Input type="number" className="h-8 w-24" value={targets[r.k.id]?.[f] ?? 0}
                        onChange={e => setTargets(t => ({ ...t, [r.k.id]: { ...t[r.k.id], [f]: +e.target.value } }))} />
                        : r[f] ? <span className={f === 'target' && vsT !== null ? (vsT ? 'text-primary font-semibold' : 'text-destructive') : 'text-muted-foreground'}>{fmtKpi(r.k.kind, r[f])}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                  <td className="p-3 text-xs text-muted-foreground">{r.drv[0] ? r.drv[0].name : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <h4 className="font-display font-bold mb-1">Largest drivers — {sel.k.label}</h4>
          <p className="text-xs text-muted-foreground mb-3">Payers that moved this number the most versus the prior period.</p>
          {sel.drv.length === 0 ? <p className="text-sm text-muted-foreground">No comparison available.</p> : (
            <ul className="space-y-2">{sel.drv.map(d => {
              const good = (d.contribution > 0) === sel.k.higherIsBetter;
              return <li key={d.name} className="flex justify-between text-sm border-b border-border/50 pb-1">
                <span>{d.name}</span>
                <span className={good ? 'text-primary font-semibold' : 'text-destructive font-semibold'}>
                  {d.contribution > 0 ? '+' : '−'}{sel.k.kind === 'pct' ? fN2(Math.abs(d.contribution)) + ' pts' : fmtKpi(sel.k.kind, Math.abs(d.contribution))}
                </span></li>;
            })}</ul>)}
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <h4 className="font-display font-bold mb-1">AI explanation — {sel.k.label}</h4>
          <p className="text-xs text-muted-foreground mb-3">Uses Lovable AI. Only summary numbers and reconciliation results are sent — no patient or claim rows. Click a row in the table to change the KPI.</p>
          <Button onClick={explain} disabled={ai.loading}>{ai.loading ? 'Analysing…' : 'Explain this movement'}</Button>
          {ai.error && <p className="text-sm text-destructive mt-3">{ai.error}</p>}
          {ai.text && <div className="prose prose-sm max-w-none mt-4 text-foreground"><ReactMarkdown>{ai.text}</ReactMarkdown></div>}
        </div>
      </div>
    </div>
  );
}

function fN2(n: number) { return n.toFixed(1); }
