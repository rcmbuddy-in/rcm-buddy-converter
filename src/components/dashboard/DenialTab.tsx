import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { InsightList } from './InsightCard';
import { getDenialBreakdown } from '@/lib/insights-engine';
import { fmt, fN, pct, sm, shortP, R_PAL, MIX_PAL, getBadgeType } from '@/lib/rcm-utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

export function DenialTab() {
  const { globalData, getGroupKey } = useDashboard();
  if (!globalData) return null;
  const { data: d, n } = globalData;

  const paDenied = d.filter(x => x.status === 'Pre Auth Denied');
  const paApproved = d.filter(x => ['Pre Auth Approved', 'Discharge Approved', 'Discharge Initiated', 'Pre Auth Query', 'Pre Auth Query Replied'].includes(x.status));
  const paTotal = d.filter(x => x.status.startsWith('Pre Auth') || x.status.startsWith('Discharge') || x.status.startsWith('Enhancement'));
  const claimDenied = d.filter(x => x.status === 'Claim Denied');
  const cancelled = d.filter(x => x.status === 'Cancelled');
  const allDenied = d.filter(x => x.status.toLowerCase().includes('denied') || x.status === 'Cancelled');

  const paDenRate = pct(paDenied.length, paTotal.length);
  const overallDR = pct(allDenied.length, n);
  const deniedVal = sm(allDenied.map(x => x.claimedAmt));

  const breakdown = getDenialBreakdown(globalData);
  const preventableShare = pct(breakdown.preventable.count, allDenied.length || 1);

  // Pre-auth bar
  const preAuthData = [
    { name: 'Approved', value: paApproved.length },
    { name: 'Denied', value: paDenied.length },
  ];

  // Denial by TPA
  const tpaMap: Record<string, { total: number; denied: number; denVal: number }> = {};
  d.forEach(x => {
    const k = getGroupKey(x);
    if (!tpaMap[k]) tpaMap[k] = { total: 0, denied: 0, denVal: 0 };
    tpaMap[k].total++;
    if (x.status.toLowerCase().includes('denied') || x.status === 'Cancelled') { tpaMap[k].denied++; tpaMap[k].denVal += x.claimedAmt; }
  });
  const denByTPA = Object.entries(tpaMap).filter(e => e[1].total >= 10)
    .map(([k, v]) => ({ name: shortP(k), rate: pct(v.denied, v.total), denied: v.denied }))
    .sort((a, b) => b.rate - a.rate).slice(0, 12);

  // Denial reasons (by status)
  const reasons: Record<string, number> = {};
  allDenied.forEach(x => { reasons[x.status] = (reasons[x.status] || 0) + 1; });
  const reasonData = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Denial & Rejection Analysis" tag="Loss Recovery Opportunities" />

      <InsightList title="Denial Intelligence" subtitle="Preventable patterns and recovery opportunities" insights={breakdown.insights} />

      <MetricGrid>
        <MetricCard label="Pre-Auth Approved" value={paApproved.length.toString()} subtitle={paTotal.length + ' pre-auths total'} />
        <MetricCard label="Pre-Auth Denied" value={paDenied.length.toString()} subtitle={fN(paDenRate) + '% of total pre-auths'} badge={{ type: getBadgeType(paDenRate, 15, 30, false), text: paDenRate < 15 ? 'Low' : 'High' }} />
        <MetricCard label="Overall Denial Rate" value={fN(overallDR) + '%'} subtitle={allDenied.length + ' of ' + n + ' claims'} badge={{ type: getBadgeType(overallDR, 10, 20, false), text: overallDR < 10 ? 'Controlled' : 'High' }} />
        <MetricCard label="Denied Claim Value" value={fmt(deniedVal)} subtitle="Revenue at risk from denials" />
        <MetricCard label="Preventable Denials" value={breakdown.preventable.count.toString()} subtitle={fN(preventableShare) + '% of denials avoidable'} badge={{ type: preventableShare > 50 ? 'critical' : preventableShare > 25 ? 'warning' : 'good', text: fmt(breakdown.preventable.value) }} />
        <MetricCard label="Recovery Probability" value={breakdown.recoveryProbability + '%'} subtitle="Denials still within appeal window" badge={{ type: breakdown.recoveryProbability >= 30 ? 'good' : 'warning', text: breakdown.recoveryProbability >= 30 ? 'Recoverable' : 'Limited' }} />
      </MetricGrid>

      {/* Preventable vs Non-Preventable split */}
      <ChartGrid>
        <ChartCard title="Preventable vs Non-Preventable Denials" subtitle="Identify avoidable revenue loss" height="260px">
          <ResponsiveContainer><BarChart data={[
            { name: 'Preventable', count: breakdown.preventable.count, value: breakdown.preventable.value },
            { name: 'Non-Preventable', count: breakdown.nonPreventable.count, value: breakdown.nonPreventable.value },
          ]}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number, name) => name === 'value' ? fmt(v) : v.toString()} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              <Cell fill="#DC2626" /><Cell fill="#6B7280" />
            </Bar>
          </BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Top Preventable Reasons" subtitle="Where to focus prevention effort" height="260px">
          <ResponsiveContainer><BarChart data={breakdown.preventable.reasons.slice(0, 6)} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#D97706" />
          </BarChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <ChartGrid>
        <ChartCard title="Pre-Auth: Approved vs Denied" subtitle="Counts of approved and denied pre-authorisations">
          <ResponsiveContainer><BarChart data={preAuthData}><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" radius={[4, 4, 0, 0]}>
            <Cell fill="#059669" /><Cell fill="#DC2626" />
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="TPA-wise Denial Rate (%)" subtitle="Percentage of denied/cancelled claims">
          <ResponsiveContainer><BarChart data={denByTPA} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => fN(v) + '%'} /><Bar dataKey="rate" radius={[0, 4, 4, 0]}>
            {denByTPA.map((d, i) => <Cell key={i} fill={d.rate > 20 ? '#DC2626' : d.rate > 10 ? '#D97706' : '#059669'} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Denial Reasons" subtitle="By claim status category">
          <ResponsiveContainer><PieChart><Pie data={reasonData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75}>
            {reasonData.map((_, i) => <Cell key={i} fill={MIX_PAL[i % MIX_PAL.length]} />)}
          </Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable title="Denial Detail by TPA/Insurer" subtitle="Claims denied vs total"
        headers={['TPA/Insurer', 'Total', 'Denied', 'Denial %', 'Denied Value']}
        rows={Object.entries(tpaMap).filter(e => e[1].total >= 10).sort((a, b) => b[1].denied - a[1].denied).slice(0, 14).map(([k, v]) => {
          const dr = pct(v.denied, v.total);
          return [shortP(k), v.total.toString(), v.denied.toString(),
            <span style={{ color: dr > 20 ? '#9B1C1C' : dr > 10 ? '#854D0E' : '#15803D' }}>{fN(dr)}%</span>,
            fmt(v.denVal)];
        })}
      />
    </div>
  );
}
