import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ClaimRecord } from '@/lib/rcm-data';
import { fmt, fN, pct, statusColor, categorizeStatus, STATUS_CATEGORY_COLORS } from '@/lib/rcm-utils';

interface Props {
  open: boolean;
  onClose: () => void;
  monthLabel: string;
  claims: ClaimRecord[];
}

export function MonthDrillDownModal({ open, onClose, monthLabel, claims }: Props) {
  const total = claims.length;
  const claimedSum = claims.reduce((a, x) => a + (x.claimedAmt || 0), 0);
  const settledSum = claims.reduce((a, x) => a + (x.settledAmt || 0), 0);

  // Status breakdown (by category)
  const catMap: Record<string, { cnt: number; amt: number }> = {};
  claims.forEach(c => {
    const cat = categorizeStatus(c.status);
    if (!catMap[cat]) catMap[cat] = { cnt: 0, amt: 0 };
    catMap[cat].cnt++;
    catMap[cat].amt += c.claimedAmt || 0;
  });
  const cats = Object.entries(catMap).sort((a, b) => b[1].cnt - a[1].cnt);

  // Detailed status list
  const statusMap: Record<string, { cnt: number; amt: number }> = {};
  claims.forEach(c => {
    const k = c.status || 'Unknown';
    if (!statusMap[k]) statusMap[k] = { cnt: 0, amt: 0 };
    statusMap[k].cnt++;
    statusMap[k].amt += c.claimedAmt || 0;
  });
  const statusList = Object.entries(statusMap).sort((a, b) => b[1].cnt - a[1].cnt);

  // Top claims by value
  const topClaims = [...claims]
    .sort((a, b) => (b.claimedAmt || 0) - (a.claimedAmt || 0))
    .slice(0, 25);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{monthLabel} — Claim Drill-down</DialogTitle>
          <DialogDescription>
            {total.toLocaleString()} claims · Billed {fmt(claimedSum)} · Settled {fmt(settledSum)} ({fN(pct(settledSum, claimedSum))}%)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status Breakdown</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {cats.map(([cat, v]) => (
                <div key={cat} className="bg-muted/40 rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_CATEGORY_COLORS[cat] || '#6B7280' }} />
                    <span className="text-xs font-semibold text-foreground">{cat}</span>
                  </div>
                  <div className="text-lg font-bold text-foreground">{v.cnt}</div>
                  <div className="text-[11px] text-muted-foreground">{fmt(v.amt)} · {fN(pct(v.cnt, total))}%</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Detailed Statuses</h4>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                    <th className="text-right px-3 py-2 font-semibold">Claims</th>
                    <th className="text-right px-3 py-2 font-semibold">Billed</th>
                    <th className="text-right px-3 py-2 font-semibold">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {statusList.map(([s, v]) => (
                    <tr key={s} className="border-t border-border">
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: statusColor(s) }} />
                          {s}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">{v.cnt}</td>
                      <td className="px-3 py-1.5 text-right">{fmt(v.amt)}</td>
                      <td className="px-3 py-1.5 text-right">{fN(pct(v.cnt, total))}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Top Claims by Value (showing {topClaims.length} of {total})
            </h4>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Admission</th>
                    <th className="text-left px-3 py-2 font-semibold">TPA / Insurer</th>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                    <th className="text-right px-3 py-2 font-semibold">Billed</th>
                    <th className="text-right px-3 py-2 font-semibold">Approved</th>
                    <th className="text-right px-3 py-2 font-semibold">Settled</th>
                  </tr>
                </thead>
                <tbody>
                  {topClaims.map((c, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-1.5">{c.admission ? c.admission.toLocaleDateString('en-IN') : '—'}</td>
                      <td className="px-3 py-1.5">{c.tpa || c.insurer}</td>
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: statusColor(c.status) }} />
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">{fmt(c.claimedAmt)}</td>
                      <td className="px-3 py-1.5 text-right">{fmt(c.approvedAmt)}</td>
                      <td className="px-3 py-1.5 text-right">{fmt(c.settledAmt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}