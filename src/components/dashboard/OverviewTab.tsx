import { useState } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { SectionHeading } from './SectionHeading';
import { HealthScoreCard, LeakageBanner } from './HealthScoreCard';
import { computeHealthScore, getLeakageSummary } from '@/lib/insights-engine';
import { fmt, fN, pct, avg, ddiff, sm, shortP, MIX_PAL, getBadgeType, categorizeStatus, STATUS_CATEGORY_COLORS } from '@/lib/rcm-utils';
import { MonthDrillDownModal } from './MonthDrillDownModal';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

export function OverviewTab() {
  const { globalData, getGroupKey } = useDashboard();
  const [monthMode, setMonthMode] = useState<'volume' | 'amount'>('volume');
  const [drill, setDrill] = useState<{ key: string; label: string } | null>(null);
  if (!globalData) return null;
  const { data: d, n, totalClaimed, totalApproved, totalSettled, totalShortfall, totalCopay, totalDiscount, totalTDS } = globalData;

  const health = computeHealthScore(globalData);
  const leakage = getLeakageSummary(globalData);

  const settled = d.filter(x => x.status === 'Settled');
  const denied = d.filter(x => x.status.toLowerCase().includes('denied') || x.status === 'Cancelled');
  const pending = d.filter(x => ['Processing', 'Claim in Progress', 'Pre Auth Initiated', 'Pre Auth Submitted to Payer', 'Pre Auth Query', 'Settlement Initiated', 'Discharge Approved', 'Claim Approved'].includes(x.status));
  const approvalRate = pct(totalApproved, totalClaimed);
  const netCollRate = pct(totalSettled, totalApproved);
  const tatVals = d.map(x => ddiff(x.admission, x.paymentDate)).filter((v): v is number => v !== null && v < 365);
  const avgTAT = avg(tatVals);
  const denialRate = pct(denied.length, n);
  const sfP = pct(totalShortfall, totalClaimed);
  const dedP = pct(totalClaimed - totalApproved, totalClaimed);
  const ebitdaProxy = totalSettled - totalTDS;

  // Status distribution — use consistent category colors
  const statusMap: Record<string, number> = {};
  d.forEach(x => { const cat = categorizeStatus(x.status); statusMap[cat] = (statusMap[cat] || 0) + 1; });
  const statusData = Object.entries(statusMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  // Monthly — count + claimed amount (avg per claim available in tooltip only)
  const mc: Record<string, { count: number; amount: number; key: string }> = {};
  d.forEach(x => {
    if (!x.admission) return;
    const k = x.admission.getFullYear() + '-' + String(x.admission.getMonth() + 1).padStart(2, '0');
    if (!mc[k]) mc[k] = { count: 0, amount: 0, key: k };
    mc[k].count++;
    mc[k].amount += x.claimedAmt;
  });
  const monthlyKeys = Object.keys(mc).sort().slice(-18);
  const monthlyData = monthlyKeys.map(k => {
    const p = k.split('-');
    const m = mc[k];
    const label = new Date(+p[0], +p[1] - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    return {
      key: k,
      name: label,
      claims: m.count,
      amountLakhs: +(m.amount / 100000).toFixed(2),
      avgPerClaim: m.count ? +(m.amount / m.count / 100000).toFixed(2) : 0,
    };
  });

  const monthClaims = drill ? d.filter(x => {
    if (!x.admission) return false;
    const k = x.admission.getFullYear() + '-' + String(x.admission.getMonth() + 1).padStart(2, '0');
    return k === drill.key;
  }) : [];

  const MonthlyTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-md shadow-lg px-3 py-2 text-xs">
        <div className="font-semibold mb-1">{row.name}</div>
        <div>Volume: <strong>{row.claims.toLocaleString()}</strong> claims</div>
        <div>Amount: <strong>₹{row.amountLakhs.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</strong></div>
        <div>Avg / claim: <strong>₹{row.avgPerClaim.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</strong></div>
        <div className="text-[10px] text-muted-foreground mt-1">Click bar for drill-down</div>
      </div>
    );
  };

  // TPA volume
  const vc: Record<string, number> = {};
  d.forEach(x => { const k = getGroupKey(x); vc[k] = (vc[k] || 0) + 1; });
  const volData = Object.entries(vc).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name: shortP(name), value }));

  // Policy
  const pc: Record<string, number> = {};
  d.forEach(x => { const p = x.policyType || 'Unknown'; pc[p] = (pc[p] || 0) + 1; });
  const policyData = Object.entries(pc).map(([name, value]) => ({ name, value }));
  const policyColors = ['#1D4ED8', '#059669', '#D97706'];

  return (
    <div className="animate-fadeIn">
      {/* Executive command-center row: Health + Leakage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-6">
        <HealthScoreCard health={health} />
        <LeakageBanner total={leakage.total} breakdown={leakage.breakdown} />
      </div>

      <SectionHeading title="Hospital at a Glance" tag="Unified Operational + Financial KPIs" />
      <MetricGrid>
        <MetricCard label="Total Claims" value={n.toLocaleString()} subtitle="All admissions in period" highlighted weight="Highest Weight" />
        <MetricCard label="Gross Billed" value={fmt(totalClaimed)} subtitle="Top of revenue funnel" weight="Highest Weight" />
        <MetricCard label="Total Approved" value={fmt(totalApproved)} subtitle="Approved by payers" weight="High Weight" />
        <MetricCard label="Net Collected" value={fmt(totalSettled)} subtitle={fN(pct(totalSettled, totalClaimed)) + '% of gross'} />
        <MetricCard label="Patient Paid" value={fmt(globalData.totalPatientPaid + globalData.totalCopay)} subtitle={`Incl. copay ${fmt(globalData.totalCopay)}`} />
        <MetricCard label="EBITDA Impact (proxy)" value={fmt(ebitdaProxy)} subtitle="Net settled minus TDS" badge={{ type: getBadgeType(pct(ebitdaProxy, totalClaimed), 70, 55), text: fN(pct(ebitdaProxy, totalClaimed)) + '% yield' }} />
        <MetricCard label="Approval Rate" value={fN(approvalRate) + '%'} subtitle="Approved ÷ Billed" badge={{ type: getBadgeType(approvalRate, 75, 60), text: approvalRate > 75 ? 'Healthy' : approvalRate > 60 ? 'Watch' : 'Critical' }} weight="High Weight" />
        <MetricCard label="Net Collection Rate" value={fN(netCollRate) + '%'} subtitle="Settled ÷ Approved" badge={{ type: getBadgeType(netCollRate, 85, 70), text: netCollRate > 85 ? 'Strong' : netCollRate > 70 ? 'Average' : 'Weak' }} weight="High Weight" />
        <MetricCard label="Payer Deduction %" value={fN(dedP) + '%'} subtitle={fmt(totalClaimed - totalApproved) + ' deducted'} />
        <MetricCard label="Shortfall Rate" value={fN(sfP) + '%'} subtitle={fmt(totalShortfall) + ' total shortfall'} />
        <MetricCard label="End-to-End TAT" value={fN(avgTAT) + ' days'} subtitle="Avg admission to payment" badge={{ type: getBadgeType(avgTAT, 30, 60, false), text: avgTAT < 30 ? 'Fast' : avgTAT < 60 ? 'Average' : 'Slow' }} weight="Medium Weight" />
        <MetricCard label="Denial Rate" value={fN(denialRate) + '%'} subtitle={denied.length + ' denied/cancelled'} badge={{ type: getBadgeType(denialRate, 10, 20, false), text: denialRate < 10 ? 'Controlled' : 'High' }} weight="Medium Weight" />
        <MetricCard label="Pending AR" value={fmt(sm(pending.map(x => x.claimedAmt)))} subtitle={pending.length + ' open claims'} />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="Claim Status Distribution" subtitle="Volume across all claim stages">
          <ResponsiveContainer><PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
            {statusData.map((s, i) => <Cell key={i} fill={STATUS_CATEGORY_COLORS[s.name] || '#6B7280'} />)}
          </Pie><Tooltip formatter={(v: number) => v.toLocaleString()} /><Legend /></PieChart></ResponsiveContainer>
        </ChartCard>
        <div className="bg-card rounded-xl p-5 border border-border shadow-card">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-[13px] font-semibold text-foreground">Monthly Claims</div>
              <div className="text-[11px] text-muted-foreground">Click a bar to drill down · {monthMode === 'volume' ? 'Volume (count)' : 'Amount (₹L)'}</div>
            </div>
            <div className="inline-flex rounded-md border border-border overflow-hidden text-[11px]">
              <button onClick={() => setMonthMode('volume')} className={`px-2.5 py-1 ${monthMode === 'volume' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted'}`}>Volume</button>
              <button onClick={() => setMonthMode('amount')} className={`px-2.5 py-1 ${monthMode === 'amount' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted'}`}>Amount</button>
            </div>
          </div>
          <div style={{ height: 240, width: '100%' }}>
            <ResponsiveContainer>
              <BarChart data={monthlyData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => monthMode === 'amount' ? `₹${v}L` : String(v)} />
                <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar
                  dataKey={monthMode === 'volume' ? 'claims' : 'amountLakhs'}
                  name={monthMode === 'volume' ? 'Claims' : 'Amount (₹L)'}
                  fill={monthMode === 'volume' ? '#1D4ED8' : '#059669'}
                  radius={[4, 4, 0, 0]}
                  onClick={(p: any) => setDrill({ key: p.key, label: p.name })}
                  style={{ cursor: 'pointer' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <ChartCard title="Top TPAs by Volume" subtitle="Claims count" height="300px">
          <ResponsiveContainer><BarChart data={volData} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {volData.map((_, i) => <Cell key={i} fill={MIX_PAL[i % MIX_PAL.length]} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Policy Type Split" subtitle="Base vs Top-up">
          <ResponsiveContainer><PieChart><Pie data={policyData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
            {policyData.map((_, i) => <Cell key={i} fill={policyColors[i % policyColors.length]} />)}
          </Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      {drill && (
        <MonthDrillDownModal
          open={!!drill}
          onClose={() => setDrill(null)}
          monthLabel={drill.label}
          claims={monthClaims}
        />
      )}
    </div>
  );
}
