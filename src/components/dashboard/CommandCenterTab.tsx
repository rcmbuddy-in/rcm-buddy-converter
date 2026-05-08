import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard } from './ChartCard';
import { ClaimFunnel } from './ClaimFunnel';
import { AlertsPanel } from './AlertsPanel';
import { fmt, fN, pct, avg, ddiff, sm, getBadgeType, SEVERITY } from '@/lib/rcm-utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function CommandCenterTab() {
  const { globalData } = useDashboard();
  if (!globalData) return null;
  const g = globalData;
  const { data: d, totalClaimed, totalApproved, totalSettled } = g;

  const approvalRate = pct(totalApproved, totalClaimed);
  const collRate = pct(totalSettled, totalApproved);
  const tatVals = d.map(x => ddiff(x.admission, x.paymentDate)).filter((v): v is number => v !== null && v < 365);
  const avgTAT = avg(tatVals);
  const denied = d.filter(x => x.status.toLowerCase().includes('denied') || x.status === 'Cancelled');
  const denialRate = pct(denied.length, d.length);
  const aging30 = (g.ageBuckets['31-60']?.cnt || 0) + (g.ageBuckets['61-90']?.cnt || 0) + (g.ageBuckets['91-180']?.cnt || 0) + (g.ageBuckets['180+']?.cnt || 0);
  const aging30Val = (g.ageBuckets['31-60']?.val || 0) + (g.ageBuckets['61-90']?.val || 0) + (g.ageBuckets['91-180']?.val || 0) + (g.ageBuckets['180+']?.val || 0);
  const pendingActive = d.filter(x => ['Processing', 'Claim in Progress', 'Pre Auth Initiated', 'Pre Auth Submitted to Payer', 'Pre Auth Query', 'Settlement Initiated', 'Discharge Approved', 'Claim Approved'].includes(x.status));
  const leakage = totalClaimed - totalSettled;

  // Monthly leakage trend
  const m: Record<string, { billed: number; settled: number }> = {};
  d.forEach(x => {
    if (!x.admission) return;
    const k = x.admission.getFullYear() + '-' + String(x.admission.getMonth() + 1).padStart(2, '0');
    if (!m[k]) m[k] = { billed: 0, settled: 0 };
    m[k].billed += x.claimedAmt;
    m[k].settled += x.settledAmt;
  });
  const trend = Object.keys(m).sort().slice(-12).map(k => {
    const p = k.split('-');
    return {
      name: new Date(+p[0], +p[1] - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      leakageL: +((m[k].billed - m[k].settled) / 100000).toFixed(2),
    };
  });

  return (
    <div className="animate-fadeIn">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-bold text-foreground">Leakage Command Center</h2>
        <p className="text-[12px] text-muted-foreground">Where are we losing money — and what to do today.</p>
      </div>

      <MetricGrid>
        <MetricCard label="Gross Claim Value" value={fmt(totalClaimed)} subtitle="Top of revenue funnel" />
        <MetricCard label="Approved Amount"   value={fmt(totalApproved)} subtitle={`${fN(approvalRate)}% of billed`} />
        <MetricCard label="Settled Amount"    value={fmt(totalSettled)}  subtitle={`${fN(pct(totalSettled, totalClaimed))}% of billed`} />
        <MetricCard
          label="Revenue Leakage"
          value={fmt(leakage)}
          subtitle={`${fN(pct(leakage, totalClaimed))}% lost gross-to-net`}
          highlighted
          weight="Critical"
        />
        <MetricCard
          label="Approval %"
          value={fN(approvalRate) + '%'}
          subtitle="Approved ÷ Billed"
          badge={{ type: getBadgeType(approvalRate, 75, 60), text: approvalRate >= 75 ? 'Healthy' : approvalRate >= 60 ? 'Watch' : 'Critical' }}
        />
        <MetricCard
          label="Settlement TAT"
          value={fN(avgTAT, 0) + ' d'}
          subtitle="Admission → payment"
          badge={{ type: getBadgeType(avgTAT, 30, 60, false), text: avgTAT < 30 ? 'Fast' : avgTAT < 60 ? 'Average' : 'Slow' }}
        />
        <MetricCard
          label="Net Collection %"
          value={fN(collRate) + '%'}
          subtitle="Settled ÷ Approved"
          badge={{ type: getBadgeType(collRate, 85, 70), text: collRate >= 85 ? 'Strong' : collRate >= 70 ? 'Average' : 'Weak' }}
        />
        <MetricCard
          label="Denial Rate"
          value={fN(denialRate) + '%'}
          subtitle={`${denied.length} denied/cancelled`}
          badge={{ type: getBadgeType(denialRate, 10, 20, false), text: denialRate < 10 ? 'Controlled' : 'High' }}
        />
        <MetricCard label="Aging > 30 Days" value={`${aging30}`} subtitle={`${fmt(aging30Val)} blocked AR`} />
        <MetricCard label="Pending AR (active)" value={fmt(sm(pendingActive.map(x => x.claimedAmt)))} subtitle={`${pendingActive.length} open claims`} />
      </MetricGrid>

      <ClaimFunnel g={g} />
      <AlertsPanel g={g} />

      <ChartCard title="Leakage Trend" subtitle="Monthly gross-billed minus net-collected (₹ Lakhs)" height="240px">
        <ResponsiveContainer>
          <LineChart data={trend}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}L`} />
            <Tooltip formatter={(v: number) => `₹${v} L`} />
            <Line type="monotone" dataKey="leakageL" stroke={SEVERITY.critical} strokeWidth={2.5} dot={{ r: 3 }} name="Leakage (₹L)" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}