import { isPendingClaim, arOutstanding } from '@/lib/rcm-data';
import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, ddiff, sm, median, getBadgeType , payerTat } from '@/lib/rcm-utils';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';

/**
 * DSO & Collection Velocity
 *  DSO  = (Total AR / Total Billed) * Period in days
 *  Velocity = % of approved that gets collected within X days
 *  Benchmarks (industry):
 *    DSO    < 45  Excellent · 45-60 Avg · > 60 Poor
 *    NetCol > 95  Excellent · 85-95 Avg · < 85 Poor
 */
const BENCH_DSO = 45;
const BENCH_DSO_BAD = 60;

export function DSOTab() {
  const { globalData } = useDashboard();
  if (!globalData) return null;
  const { data: d, totalClaimed, totalSettled } = globalData;

  // Period span (days)
  const dates = d.map(x => x.admission).filter(Boolean) as Date[];
  if (dates.length === 0) return null;
  const minD = new Date(Math.min(...dates.map(x => x.getTime())));
  const maxD = new Date(Math.max(...dates.map(x => x.getTime())));
  const periodDays = Math.max(1, Math.round((maxD.getTime() - minD.getTime()) / 86400000));

  // AR = pending value
  const arVal = sm(d.filter(x => isPendingClaim(x)).map(arOutstanding));
  const dso = totalClaimed ? (arVal / totalClaimed) * periodDays : 0;

  // Settled-only TAT for velocity
  const settled = d.filter(x => x.status === 'Settled');
  const tats = settled.map(x => payerTat(x)).filter((v): v is number => v !== null);
  const avgTAT = tats.length ? tats.reduce((a, b) => a + b, 0) / tats.length : 0;
  const medTAT = median(tats);

  // Collection velocity buckets
  const within = (n: number) => tats.filter(t => t <= n).length;
  const total = Math.max(1, tats.length);
  const v30 = (within(30) / total) * 100;
  const v60 = (within(60) / total) * 100;
  const v90 = (within(90) / total) * 100;

  // Monthly trend: DSO per month + collected
  type Bucket = { key: string; billed: number; collected: number; ar: number };
  const months: Record<string, Bucket> = {};
  d.forEach(x => {
    if (!x.admission) return;
    const k = x.admission.getFullYear() + '-' + String(x.admission.getMonth() + 1).padStart(2, '0');
    if (!months[k]) months[k] = { key: k, billed: 0, collected: 0, ar: 0 };
    months[k].billed += x.claimedAmt;
    months[k].collected += x.settledAmt;
    if (isPendingClaim(x)) months[k].ar += arOutstanding(x);
  });
  const monthly = Object.values(months).sort((a, b) => a.key.localeCompare(b.key)).slice(-12).map(m => {
    const dsoVal = m.billed ? (m.ar / m.billed) * 30 : 0; // monthly DSO approximation
    return {
      name: new Date(+m.key.split('-')[0], +m.key.split('-')[1] - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      DSO: Math.round(dsoVal),
      Collected: m.collected,
    };
  });

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="DSO & Collection Velocity" tag="Cash Conversion Speed · Industry Benchmarks" />
      <MetricGrid>
        <MetricCard
          label="DSO (Days Sales Outstanding)"
          value={fN(dso) + ' days'}
          subtitle={`Bench: <${BENCH_DSO}d Excellent`}
          badge={{ type: getBadgeType(dso, BENCH_DSO, BENCH_DSO_BAD, false), text: dso < BENCH_DSO ? 'Excellent' : dso < BENCH_DSO_BAD ? 'Average' : 'Poor' }}
          highlighted
        />
        <MetricCard label="Avg Collection TAT" value={fN(avgTAT) + ' days'} subtitle={'Median: ' + fN(medTAT) + ' days'} badge={{ type: getBadgeType(avgTAT, 30, 60, false), text: avgTAT < 30 ? 'Fast' : avgTAT < 60 ? 'Avg' : 'Slow' }} />
        <MetricCard label="Pending AR" value={fmt(arVal)} subtitle={fN(periodDays) + ' day period analyzed'} />
        <MetricCard label="Net Collection Rate" value={fN((totalSettled / Math.max(1, totalClaimed)) * 100) + '%'} subtitle="Settled ÷ Billed" badge={{ type: getBadgeType((totalSettled / Math.max(1, totalClaimed)) * 100, 85, 70), text: 'Industry: 85-95%' }} />
        <MetricCard label="Velocity @ 30 days" value={fN(v30) + '%'} subtitle="Claims paid within 30d" badge={{ type: getBadgeType(v30, 50, 25), text: v30 > 50 ? 'Strong' : 'Slow' }} />
        <MetricCard label="Velocity @ 60 days" value={fN(v60) + '%'} subtitle="Claims paid within 60d" badge={{ type: getBadgeType(v60, 75, 50), text: v60 > 75 ? 'Strong' : 'Slow' }} />
        <MetricCard label="Velocity @ 90 days" value={fN(v90) + '%'} subtitle="Claims paid within 90d" badge={{ type: getBadgeType(v90, 90, 70), text: v90 > 90 ? 'Strong' : 'Slow' }} />
        <MetricCard label="Period Analyzed" value={fN(periodDays) + 'd'} subtitle={`${minD.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} → ${maxD.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`} />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="DSO Trend (Monthly)" subtitle="Lower is better · benchmark line at 45 days" height="320px">
          <ResponsiveContainer>
            <ComposedChart data={monthly}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: 'DSO', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip formatter={(v: number, n: any) => n === 'Collected' ? fmt(v) : v + ' days'} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine yAxisId="left" y={BENCH_DSO} stroke="#15803D" strokeDasharray="4 4" label={{ value: 'Benchmark 45d', fontSize: 10, fill: '#15803D' }} />
              <Bar yAxisId="right" dataKey="Collected" fill="hsl(var(--rcm-300, var(--rcm-400)))" radius={[4, 4, 0, 0]} />
              <Line yAxisId="left" type="monotone" dataKey="DSO" stroke="hsl(var(--rcm-800))" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Collection Velocity Curve" subtitle="% of settled claims collected within N days" height="320px">
          <ResponsiveContainer>
            <ComposedChart data={[15, 30, 45, 60, 75, 90, 120, 180].map(n => ({
              name: n + 'd', value: (within(n) / total) * 100,
            }))}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(0) + '%'} domain={[0, 100]} />
              <Tooltip formatter={(v: number) => fN(v) + '%'} />
              <Bar dataKey="value" fill="hsl(var(--rcm-600))" radius={[4, 4, 0, 0]} />
              <ReferenceLine y={75} stroke="#15803D" strokeDasharray="4 4" label={{ value: 'Target 75%', fontSize: 10, fill: '#15803D' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable
        title="Industry Benchmark Comparison"
        subtitle="Your hospital vs Indian RCM industry standards"
        headers={['Metric', 'Your Value', 'Excellent', 'Average', 'Poor', 'Status']}
        rows={[
          ['DSO', fN(dso) + 'd', '<45 d', '45-60 d', '>60 d',
            <span style={{ color: dso < BENCH_DSO ? '#15803D' : dso < BENCH_DSO_BAD ? '#854D0E' : '#DC2626', fontWeight: 700 }}>
              {dso < BENCH_DSO ? 'Excellent' : dso < BENCH_DSO_BAD ? 'Average' : 'Poor'}
            </span>],
          ['Avg Collection TAT', fN(avgTAT) + 'd', '<30 d', '30-60 d', '>60 d',
            <span style={{ color: avgTAT < 30 ? '#15803D' : avgTAT < 60 ? '#854D0E' : '#DC2626', fontWeight: 700 }}>
              {avgTAT < 30 ? 'Excellent' : avgTAT < 60 ? 'Average' : 'Poor'}
            </span>],
          ['Net Collection Rate', fN((totalSettled / Math.max(1, totalClaimed)) * 100) + '%', '>95%', '85-95%', '<85%',
            <span style={{ color: (totalSettled / Math.max(1, totalClaimed)) * 100 > 95 ? '#15803D' : (totalSettled / Math.max(1, totalClaimed)) * 100 > 85 ? '#854D0E' : '#DC2626', fontWeight: 700 }}>
              {(totalSettled / Math.max(1, totalClaimed)) * 100 > 95 ? 'Excellent' : (totalSettled / Math.max(1, totalClaimed)) * 100 > 85 ? 'Average' : 'Poor'}
            </span>],
          ['Velocity @ 60 days', fN(v60) + '%', '>75%', '50-75%', '<50%',
            <span style={{ color: v60 > 75 ? '#15803D' : v60 > 50 ? '#854D0E' : '#DC2626', fontWeight: 700 }}>
              {v60 > 75 ? 'Excellent' : v60 > 50 ? 'Average' : 'Poor'}
            </span>],
        ]}
      />
    </div>
  );
}