import { useMemo, useState } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, avg, sm, ddiff, payerTat, arAnchor, R_PAL } from '@/lib/rcm-utils';
import { isDeniedClaim, isPendingClaim, arOutstanding, settledCollRate, uniquePatients, ClaimRecord } from '@/lib/rcm-data';
import { computeGapBuckets } from '@/lib/gap-buckets';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const fDate = (d: Date | null) => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function PayerAuditTab() {
  const { globalData, groupBy } = useDashboard();
  const [selected, setSelected] = useState<string>('');

  const names = useMemo(() => {
    if (!globalData) return [];
    const s = new Set<string>();
    globalData.data.forEach((x: ClaimRecord) => s.add(groupBy === 'insurer' ? x.insurer : x.tpa));
    return [...s].sort();
  }, [globalData, groupBy]);

  if (!globalData) return null;

  const label = groupBy === 'insurer' ? 'Insurer' : 'TPA';
  const key = selected || names[0] || '';
  const rows = globalData.data.filter((x: ClaimRecord) => (groupBy === 'insurer' ? x.insurer : x.tpa) === key);

  if (!key || rows.length === 0) {
    return (
      <div className="animate-fadeIn">
        <SectionHeading title="Payer Audit" tag="Deep-dive on one payer" />
        <p className="text-sm text-muted-foreground">No {label.toLowerCase()} data available.</p>
      </div>
    );
  }

  // Core numbers
  const n = rows.length;
  const claimed = sm(rows.map(x => x.claimedAmt));
  const approved = sm(rows.map(x => x.approvedAmt));
  const settled = sm(rows.map(x => x.settledAmt));
  const tds = sm(rows.map(x => x.tdsAmt));
  const copay = sm(rows.map(x => x.copay));
  const patientPaid = sm(rows.map(x => x.patientPaid));
  const cancelled = rows.filter(x => x.status === 'Cancelled');
  const denied = rows.filter(x => isDeniedClaim(x));
  const pending = rows.filter(x => isPendingClaim(x));
  const settledRows = rows.filter(x => x.status === 'Settled');
  const pendVal = sm(pending.map(arOutstanding));
  const approvalRate = pct(approved, claimed);
  const collRate = settledCollRate(rows);
  const denialRate = pct(denied.length, n - cancelled.length);
  const tatVals = rows.map(payerTat).filter((v): v is number => v !== null);
  const patients = uniquePatients(rows);

  // Hospital comparison (whole dataset, same period)
  const all = globalData.data;
  const hospApproval = pct(sm(all.map((x: ClaimRecord) => x.approvedAmt)), sm(all.map((x: ClaimRecord) => x.claimedAmt)));
  const hospColl = settledCollRate(all);
  const hospDenial = pct(all.filter((x: ClaimRecord) => isDeniedClaim(x)).length, all.filter((x: ClaimRecord) => x.status !== 'Cancelled').length);
  const hospTatVals = all.map(payerTat).filter((v): v is number => v !== null);

  const vsHosp = (mine: number, hosp: number, goodHigh = true) => {
    const d = mine - hosp;
    const good = goodHigh ? d >= 0 : d <= 0;
    return <span style={{ color: good ? '#15803D' : '#9B1C1C', fontWeight: 600 }}>{d >= 0 ? '+' : ''}{fN(d)} pts vs hospital</span>;
  };

  // Status breakdown
  const statusMap: Record<string, { cnt: number; claimed: number }> = {};
  rows.forEach(x => {
    if (!statusMap[x.status]) statusMap[x.status] = { cnt: 0, claimed: 0 };
    statusMap[x.status].cnt++; statusMap[x.status].claimed += x.claimedAmt;
  });
  const statusRows = Object.entries(statusMap).sort((a, b) => b[1].claimed - a[1].claimed);

  // AR aging of pending claims
  const now = new Date();
  const buckets: Record<string, { cnt: number; val: number }> = { '0-30': { cnt: 0, val: 0 }, '31-60': { cnt: 0, val: 0 }, '61-90': { cnt: 0, val: 0 }, '91-180': { cnt: 0, val: 0 }, '180+': { cnt: 0, val: 0 } };
  pending.forEach(x => {
    const a = arAnchor(x);
    const age = a ? (ddiff(a, now) ?? 0) : 0;
    const k = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : age <= 180 ? '91-180' : '180+';
    buckets[k].cnt++; buckets[k].val += arOutstanding(x);
  });

  // Money chase (recoverable vs written-off) for this payer
  const gap = computeGapBuckets(rows);

  // Monthly trend
  const mMap: Record<string, { claimed: number; settled: number; denied: number }> = {};
  rows.forEach(x => {
    const d = x.admission || x.claimCreated;
    if (!d) return;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!mMap[k]) mMap[k] = { claimed: 0, settled: 0, denied: 0 };
    mMap[k].claimed += x.claimedAmt; mMap[k].settled += x.settledAmt;
    if (isDeniedClaim(x)) mMap[k].denied++;
  });
  const monthly = Object.entries(mMap).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ name: k, ...v }));

  // Red flags
  const flags: { text: string; sev: 'critical' | 'warning' }[] = [];
  if (denialRate > hospDenial + 5) flags.push({ text: `Denial rate ${fN(denialRate)}% is well above the hospital average of ${fN(hospDenial)}%.`, sev: 'critical' });
  if (collRate < hospColl - 5) flags.push({ text: `Net collection ${fN(collRate)}% trails the hospital average of ${fN(hospColl)}%.`, sev: 'critical' });
  const oldAR = buckets['91-180'].val + buckets['180+'].val;
  if (pendVal > 0 && oldAR / pendVal > 0.3) flags.push({ text: `${fN(pct(oldAR, pendVal))}% of this payer's outstanding is over 90 days old — escalation needed.`, sev: 'critical' });
  const zeroAppr = rows.filter(x => x.status !== 'Cancelled' && x.approvedAmt <= 0 && x.settledAmt <= 0).length;
  if (zeroAppr > 0) flags.push({ text: `${zeroAppr} claims have zero approved amount (counted as denials).`, sev: 'warning' });
  if (avg(tatVals) > avg(hospTatVals) + 5) flags.push({ text: `Average TAT of ${fN(avg(tatVals))} days is slower than the hospital average of ${fN(avg(hospTatVals))} days.`, sev: 'warning' });
  if (gap.rows.find(r => r.id === 'shortSettle')!.value > 0) flags.push({ text: `${fmt(gap.rows.find(r => r.id === 'shortSettle')!.value)} was settled short of the approved amount — raise disputes.`, sev: 'warning' });

  // Claim-level detail (largest outstanding first)
  const detail = [...rows].sort((a, b) => arOutstanding(b) - arOutstanding(a)).slice(0, 100);

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Payer Audit" tag={`Deep-dive on a single ${label}`} />

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">Audit {label}</span>
        <select
          value={key}
          onChange={e => setSelected(e.target.value)}
          className="px-3 py-1.5 border border-border rounded-md text-sm font-medium text-foreground bg-card cursor-pointer focus:border-rcm-400 outline-none min-w-[260px]"
        >
          {names.map(nm => <option key={nm} value={nm}>{nm}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">Switch TPA / Insurer grouping in the filter bar above</span>
      </div>

      <MetricGrid>
        <MetricCard label="Claims" value={n.toLocaleString()} subtitle={`${patients.toLocaleString()} unique patients`} />
        <MetricCard label="Billed" value={fmt(claimed)} subtitle={`${fN(pct(claimed, globalData.totalClaimed))}% of hospital billed`} />
        <MetricCard label="Approved" value={fmt(approved)} subtitle={fN(approvalRate) + '% of billed'} />
        <MetricCard label="Settled" value={fmt(settled)} subtitle={`TDS ${fmt(tds)} · Copay ${fmt(copay)}`} />
        <MetricCard label="Outstanding AR" value={fmt(pendVal)} subtitle={`${pending.length} open claims`} highlighted />
        <MetricCard label="Patient Paid" value={fmt(patientPaid)} subtitle="Incl. copay collected" />
      </MetricGrid>

      <MetricGrid>
        <MetricCard label="Approval Rate" value={fN(approvalRate) + '%'} subtitle="" />
        <MetricCard label="Net Collection (settled claims)" value={fN(collRate) + '%'} subtitle="" />
        <MetricCard label="Denial Rate" value={fN(denialRate) + '%'} subtitle={`${denied.length} of ${n - cancelled.length} non-cancelled`} />
        <MetricCard label="Avg TAT" value={tatVals.length ? fN(avg(tatVals)) + ' days' : '—'} subtitle="Submission → payment, settled claims" />
      </MetricGrid>

      <div className="bg-card border border-border rounded-xl p-4 mb-5">
        <div className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2">Vs hospital average (same period)</div>
        <div className="flex gap-6 flex-wrap text-sm">
          <span>Approval: {vsHosp(approvalRate, hospApproval)}</span>
          <span>Net collection: {vsHosp(collRate, hospColl)}</span>
          <span>Denial: {vsHosp(denialRate, hospDenial, false)}</span>
          <span>TAT: {vsHosp(avg(tatVals), avg(hospTatVals), false)}</span>
        </div>
      </div>

      {flags.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-5">
          <div className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2">Audit Flags</div>
          <ul className="space-y-1.5">
            {flags.map((f, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className={`badge-${f.sev} text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5`}>{f.sev === 'critical' ? 'ACT' : 'WATCH'}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ChartGrid>
        <ChartCard title="Monthly Billed vs Settled" subtitle="By admission month" height="300px" full>
          <ResponsiveContainer><BarChart data={monthly}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmt(v)} />
            <Tooltip formatter={(v: number) => fmt(v)} /><Legend />
            <Bar dataKey="claimed" name="Billed" fill={R_PAL[0]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="settled" name="Settled" fill={R_PAL[2]} radius={[4, 4, 0, 0]} />
          </BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="AR Aging (open claims)" subtitle="Approved balance still due" height="300px">
          <ResponsiveContainer><BarChart data={Object.entries(buckets).map(([k, v]) => ({ name: k, value: v.val, cnt: v.cnt }))}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmt(v)} />
            <Tooltip formatter={(v: number, name: string) => name === 'value' ? fmt(v) : v} />
            <Bar dataKey="value" name="Outstanding" radius={[4, 4, 0, 0]}>
              {Object.keys(buckets).map((_, i) => <Cell key={i} fill={['#059669', '#D97706', '#EA580C', '#DC2626', '#7F1D1D'][i]} />)}
            </Bar>
          </BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Billed − Settled Split" subtitle="Recoverable vs written-off" height="300px">
          <ResponsiveContainer><PieChart>
            <Pie data={gap.rows.filter(r => r.value > 0).map(r => ({ name: r.label, value: r.value }))} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80}>
              {gap.rows.filter(r => r.value > 0).map((r, i) => <Cell key={i} fill={r.kind === 'recoverable' ? '#059669' : '#9B1C1C'} />)}
            </Pie>
            <Tooltip formatter={(v: number) => fmt(v)} /><Legend />
          </PieChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable
        title="Money Chase by Bucket"
        subtitle={`Recoverable ${fmt(gap.recoverable)} · Written-off ${fmt(gap.writtenOff)}`}
        headers={['Bucket', 'Type', 'Owner', 'Amount', 'Claims', 'Next step']}
        rows={gap.rows.filter(r => r.value > 0).map(r => [
          r.label,
          <span className={`badge-${r.kind === 'recoverable' ? 'good' : 'critical'} text-[10px] font-bold px-2 py-0.5 rounded-full`}>{r.kind === 'recoverable' ? 'RECOVERABLE' : 'WRITTEN-OFF'}</span>,
          r.owner,
          fmt(r.value),
          r.claims.toString(),
          r.action,
        ])}
      />

      <DataTable
        title="Status Breakdown"
        subtitle="All claims for this payer"
        headers={['Status', 'Claims', 'Billed Value', '% of Claims']}
        rows={statusRows.map(([s, v]) => [s || '(blank)', v.cnt.toString(), fmt(v.claimed), fN(pct(v.cnt, n)) + '%'])}
      />

      <DataTable
        title="Claim-Level Detail"
        subtitle="Top 100 by outstanding amount"
        headers={['Patient / IP', 'Admission', 'Status', 'Billed', 'Approved', 'Settled', 'TDS', 'Copay', 'Outstanding']}
        rows={detail.map(x => [
          (x.patientName || '—') + (x.patientId ? ` (${x.patientId})` : ''),
          fDate(x.admission),
          x.status || '—',
          fmt(x.claimedAmt),
          fmt(x.approvedAmt),
          fmt(x.settledAmt),
          fmt(x.tdsAmt),
          fmt(x.copay),
          fmt(arOutstanding(x)),
        ])}
      />
    </div>
  );
}
