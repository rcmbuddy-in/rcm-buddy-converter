import { GlobalData } from '@/lib/rcm-data';
import { generateRootCauses } from '@/lib/insights-engine';
import { fmt } from '@/lib/rcm-utils';

export function RootCauseTable({ g }: { g: GlobalData }) {
  const rows = generateRootCauses(g);
  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[13px] font-semibold text-foreground">Root-Cause Engine</div>
          <div className="text-[11px] text-muted-foreground">Bottleneck → cause → owner → action</div>
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Consulting view</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left font-medium px-2 py-2 w-64">Bottleneck</th>
              <th className="text-right font-medium px-2 py-2">Impact</th>
              <th className="text-left font-medium px-2 py-2">Root Cause</th>
              <th className="text-left font-medium px-2 py-2">Owner</th>
              <th className="text-left font-medium px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/50 align-top">
                <td className="px-2 py-2 text-foreground font-medium">{r.bottleneck}</td>
                <td className="px-2 py-2 text-right font-semibold text-foreground">{fmt(r.impact)}</td>
                <td className="px-2 py-2 text-muted-foreground">{r.rootCause}</td>
                <td className="px-2 py-2"><span className="px-2 py-0.5 rounded-full bg-muted text-foreground text-[11px]">{r.owner}</span></td>
                <td className="px-2 py-2 text-foreground">{r.action}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground italic">No bottlenecks detected.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}