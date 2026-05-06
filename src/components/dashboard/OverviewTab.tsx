import { useDashboard } from '@/contexts/DashboardContext';
import { useChartPrefs } from '@/contexts/ChartPrefsContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { SectionHeading } from './SectionHeading';
import { HealthScoreCard, LeakageBanner } from './HealthScoreCard';
import { InsightList } from './InsightCard';
import { computeHealthScore, getUrgentIssues, getTodaysActions, getLeakageSummary } from '@/lib/insights-engine';
import { fmt, fN, pct, avg, ddiff, sm, shortP, R_PAL, getBadgeType } from '@/lib/rcm-utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

export function OverviewTab() {
  const { globalData, getGroupKey } = useDashboard();
  const { chartType } = useChartPrefs();
  if (!globalData) return null;
  const { data: d, n, totalClaimed, totalApproved, totalSettled } = globalData;

  const health = computeHealthScore(globalData);
  const urgent = getUrgentIssues(globalData, 5);
  const todaysActions = getTodaysActions(globalData);
  const leakage = getLeakageSummary(globalData);

  const settled = d.filter(x => x.status === 'Settled');
  const denied = d.filter(x => x.status.toLowerCase().includes('denied') || x.status === 'Cancelled');
  const pending = d.filter(x => ['Processing', 'Claim in Progress', 'Pre Auth Initiated', 'Pre Auth Submitted to Payer', 'Pre Auth Query', 'Settlement Initiated', 'Discharge Approved', 'Claim Approved'].includes(x.status));
  const approvalRate = pct(totalApproved, totalClaimed);
  const netCollRate = pct(totalSettled, totalApproved);
  const tatVals = d.map(x => ddiff(x.admission, x.paymentDate)).filter((v): v is number => v !== null && v < 365);
  const avgTAT = avg(tatVals);
  const denialRate = pct(denied.length, n);

  // Status distribution
  const statusMap: Record<string, number> = {};
  d.forEach(x => {
    const cat = x.status.toLowerCase().includes('settled') ? 'Settled' :
      x.status.toLowerCase().includes('denied') || x.status === 'Cancelled' ? 'Denied/Cancelled' :
      x.status.toLowerCase().includes('pre auth') ? 'Pre-Auth Stage' :
      x.status.toLowerCase().includes('processing') || x.status.includes('Progress') ? 'Processing' :
      x.status.toLowerCase().includes('approved') ? 'Approved' : 'Other';
    statusMap[cat] = (statusMap[cat] || 0) + 1;
  });
  const statusData = Object.entries(statusMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const statusColors = ['#059669', '#DC2626', '#D97706', '#1D4ED8', '#7C3AED', '#6B7280'];

  // Monthly
  const mc: Record<string, number> = {};
  d.forEach(x => {
    if (!x.admission) return;
    const k = x.admission.getFullYear() + '-' + String(x.admission.getMonth() + 1).padStart(2, '0');
    mc[k] = (mc[k] || 0) + 1;
  });
  const monthlyData = Object.keys(mc).sort().slice(-18).map(k => {
    const p = k.split('-');
    return { name: new Date(+p[0], +p[1] - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), value: mc[k] };
  });

  // TPA volume
  const vc: Record<string, number> = {};
  d.forEach(x => { const k = getGroupKey(x); vc[k] = (vc[k] || 0) + 1; });
  const volData = Object.entries(vc).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name: shortP(name), value }));

  // Policy
  const pc: Record<string, number> = {};
  d.forEach(x => { const p = x.policyType || 'Unknown'; pc[p] = (pc[p] || 0) + 1; });
  const policyData = Object.entries(pc).map(([name, value]) => ({ name, value }));
  const policyColors = ['#DC2626', '#1D4ED8', '#059669'];

  return (
    <div className="animate-fadeIn">
      {/* Executive command-center row: Health + Leakage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-6">
        <HealthScoreCard health={health} />
        <LeakageBanner total={leakage.total} breakdown={leakage.breakdown} />
      </div>

      <InsightList
        title="Top 5 Urgent Issues"
        subtitle="Ranked by financial impact and recovery urgency"
        insights={urgent}
        empty="No critical issues detected. RCM operations look healthy."
      />

      <InsightList
        title="Today's Action Queue"
        subtitle="Concrete follow-ups for your team to action now"
        insights={todaysActions}
        empty="No pending actions for today."
      />

      <SectionHeading title="Hospital at a Glance" tag="Overview · KPIs ranked by impact" />
      <MetricGrid>
        <MetricCard label="Total Claims" value={n.toLocaleString()} subtitle="All admissions in period" highlighted weight="Highest Weight" />
        <MetricCard label="Total Billed" value={fmt(totalClaimed)} subtitle="Gross claimed from payers" weight="Highest Weight" />
        <MetricCard label="Total Collected" value={fmt(totalSettled)} subtitle="Net settled by payers" />
        <MetricCard label="Claim Approval Rate" value={fN(approvalRate) + '%'} subtitle="Approved ÷ Billed" badge={{ type: getBadgeType(approvalRate, 75, 60), text: approvalRate > 75 ? 'Healthy' : approvalRate > 60 ? 'Watch' : 'Critical' }} weight="High Weight" />
        <MetricCard label="Net Collection Rate" value={fN(netCollRate) + '%'} subtitle="Settled ÷ Approved" badge={{ type: getBadgeType(netCollRate, 85, 70), text: netCollRate > 85 ? 'Strong' : netCollRate > 70 ? 'Average' : 'Weak' }} weight="High Weight" />
        <MetricCard label="End-to-End TAT" value={fN(avgTAT) + ' days'} subtitle="Avg admission to payment" badge={{ type: getBadgeType(avgTAT, 30, 60, false), text: avgTAT < 30 ? 'Fast' : avgTAT < 60 ? 'Average' : 'Slow' }} weight="Medium Weight" />
        <MetricCard label="Denial Rate" value={fN(denialRate) + '%'} subtitle={denied.length + ' denied/cancelled'} badge={{ type: getBadgeType(denialRate, 10, 20, false), text: denialRate < 10 ? 'Controlled' : 'High' }} weight="Medium Weight" />
        <MetricCard label="Pending AR" value={fmt(sm(pending.map(x => x.claimedAmt)))} subtitle={pending.length + ' open claims'} />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="Claim Status Distribution" subtitle="Volume across all claim stages">
          <ResponsiveContainer><PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
            {statusData.map((_, i) => <Cell key={i} fill={statusColors[i % statusColors.length]} />)}
          </Pie><Tooltip formatter={(v: number) => v.toLocaleString()} /><Legend /></PieChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Monthly Claims Volume" subtitle="Admissions by month">
          <ResponsiveContainer>
            {chartType === 'line' ? (
              <LineChart data={monthlyData}><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="value" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} /></LineChart>
            ) : (
              <BarChart data={monthlyData}><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" fill="#EF4444" radius={[4, 4, 0, 0]} /></BarChart>
            )}
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Top TPAs by Volume" subtitle="Claims count" height="300px">
          <ResponsiveContainer><BarChart data={volData} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {volData.map((_, i) => <Cell key={i} fill={R_PAL[i % R_PAL.length]} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Policy Type Split" subtitle="Base vs Top-up">
          <ResponsiveContainer><PieChart><Pie data={policyData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
            {policyData.map((_, i) => <Cell key={i} fill={policyColors[i % policyColors.length]} />)}
          </Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>
    </div>
  );
}
