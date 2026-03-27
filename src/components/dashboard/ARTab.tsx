import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, sm, MIX_PAL, R_PAL } from '@/lib/rcm-utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

export function ARTab() {
  const { globalData } = useDashboard();
  if (!globalData) return null;
  const { data: d, n, ageBuckets, totalClaimed } = globalData;

  const pending = d.filter(x => !['Settled', 'Claim Denied', 'Pre Auth Denied', 'Cancelled', 'Enhancement Denied', 'Discharge Denied'].includes(x.status));
  const pendVal = sm(pending.map(x => x.claimedAmt));
  const arToRev = pct(pendVal, totalClaimed);

  const ab = ageBuckets;
  const aged90 = (ab['91-180']?.cnt || 0) + (ab['180+']?.cnt || 0);
  const aged90Val = (ab['91-180']?.val || 0) + (ab['180+']?.val || 0);

  const agingData = Object.entries(ab).map(([name, v]) => ({ name: name + ' days', value: v.val, count: v.cnt }));

  // Pipeline
  const ps: Record<string, number> = {};
  pending.forEach(x => { ps[x.status] = (ps[x.status] || 0) + 1; });
  const pipelineData = Object.entries(ps).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Accounts Receivable Management" tag="Cash Flow & Aging" />
      <MetricGrid>
        <MetricCard label="Total Pending AR" value={fmt(pendVal)} subtitle={pending.length + ' open claims'} highlighted />
        <MetricCard label="AR-to-Revenue Ratio" value={fN(arToRev) + '%'} subtitle="Pending ÷ Total billed" />
        <MetricCard label="90+ Day Aged Claims" value={aged90.toString()} subtitle={fmt(aged90Val) + ' at risk'} badge={aged90 > 0 ? { type: 'critical', text: 'Action Required' } : { type: 'good', text: 'Clear' }} />
        <MetricCard label="180+ Day Claims" value={(ab['180+']?.cnt || 0).toString()} subtitle={fmt(ab['180+']?.val || 0) + ' critical age'} badge={(ab['180+']?.cnt || 0) > 0 ? { type: 'critical', text: 'Urgent' } : { type: 'good', text: 'None' }} />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="AR Aging Distribution" subtitle="Outstanding value by age bucket" height="280px">
          <ResponsiveContainer><BarChart data={agingData}><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} /><Tooltip formatter={(v: number) => fmt(v)} /><Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {agingData.map((_, i) => <Cell key={i} fill={['#059669', '#65A30D', '#D97706', '#DC2626', '#7B1212'][i]} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Claims Pipeline" subtitle="Current status of open claims" height="280px">
          <ResponsiveContainer><PieChart><Pie data={pipelineData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80}>
            {pipelineData.map((_, i) => <Cell key={i} fill={MIX_PAL[i % MIX_PAL.length]} />)}
          </Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable title="AR Aging Detail" subtitle="Claims by age bucket"
        headers={['Bucket', 'Claims', 'Value', '% of AR']}
        rows={Object.entries(ab).map(([name, v]) => [name + ' days', v.cnt.toString(), fmt(v.val), fN(pct(v.val, pendVal)) + '%'])}
      />
    </div>
  );
}
