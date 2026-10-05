import { isPendingClaim, arOutstanding } from '@/lib/rcm-data';
import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, sm, ddiff, arAnchor, shortP, MIX_PAL, R_PAL } from '@/lib/rcm-utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const BUCKET_KEYS = ['0-30', '31-60', '61-90', '91-180', '180+'] as const;
type BucketKey = typeof BUCKET_KEYS[number];
const bucketOf = (age: number): BucketKey => age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : age <= 180 ? '91-180' : '180+';

export function ARTab() {
  const { globalData, groupBy } = useDashboard();
  if (!globalData) return null;
  const { data: d, n, ageBuckets, totalClaimed } = globalData;

  const pending = d.filter(x => isPendingClaim(x));
  const pendVal = globalData.pendingAR.val;
  const arToRev = pct(pendVal, totalClaimed);

  // Payer-wise aging: counts + amounts per bucket
  const now = new Date();
  const payerKey = (x: (typeof d)[number]) => groupBy === 'insurer' ? (x.insurer || 'Unknown') : (x.tpa || 'Unknown');
  const payerAge: Record<string, { cnt: Record<BucketKey, number>; val: Record<BucketKey, number>; totalCnt: number; totalVal: number }> = {};
  pending.forEach(x => {
    const k = payerKey(x);
    if (!payerAge[k]) payerAge[k] = { cnt: { '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 }, val: { '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 }, totalCnt: 0, totalVal: 0 };
    const a = arAnchor(x);
    const age = a ? (ddiff(a, now) ?? 0) : 0;
    const b = bucketOf(age);
    const v = arOutstanding(x);
    payerAge[k].cnt[b]++; payerAge[k].val[b] += v;
    payerAge[k].totalCnt++; payerAge[k].totalVal += v;
  });
  const payerAgeRows = Object.entries(payerAge).sort((a, b) => b[1].totalVal - a[1].totalVal);

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
        <MetricCard label="Total Pending AR" value={fmt(pendVal)} subtitle={pending.length + ' open claims · approved balance due'} highlighted />
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

      <DataTable
        title={`Payer-wise AR Aging (${groupBy === 'insurer' ? 'Insurer' : 'TPA'})`}
        subtitle="Open claims · approved balance due · each cell shows claims, amount and % of total AR"
        headers={[groupBy === 'insurer' ? 'Insurer' : 'TPA', 'Claims', 'Outstanding', '% of AR', '0-30 d', '31-60 d', '61-90 d', '91-180 d', '180+ d']}
        rows={payerAgeRows.map(([name, v]) => [
          <strong>{shortP(name)}</strong>,
          v.totalCnt.toLocaleString(),
          fmt(v.totalVal),
          fN(pct(v.totalVal, pendVal)) + '%',
          ...BUCKET_KEYS.map(b => (
            <span className="text-xs">
              {v.cnt[b] > 0 ? <>{v.cnt[b]} · <strong>{fmt(v.val[b])}</strong> <span className="text-muted-foreground">({fN(pct(v.val[b], pendVal))}%)</span></> : '—'}
            </span>
          )),
        ])}
      />
    </div>
  );
}
