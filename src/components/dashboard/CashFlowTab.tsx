import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, sm, ddiff } from '@/lib/rcm-utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line, Legend
} from 'recharts';

/**
 * 90-day cash flow forecast.
 * Method:
 *  - For each open (pending) claim, classify by AR aging bucket of admission age.
 *  - Look up payer-specific historical realization rate (settled / claimed) and
 *    average TAT (admission → payment) from settled claims.
 *  - Projected collection = open_claim_value * realization_rate
 *  - Bucket projection into Week 1-2, Week 3-4, Month 2, Month 3 based on
 *    days_until_collection = max(0, payerAvgTAT - currentAge).
 *  - Aged > 180 days assumed at-risk (50% probability).
 */
export function CashFlowTab() {
  const { globalData } = useDashboard();
  if (!globalData) return null;
  const { data: d } = globalData;

  const PENDING_STATUSES = (s: string) =>
    !['Settled'].includes(s) &&
    !s.toLowerCase().includes('denied') &&
    s !== 'Cancelled';

  // Build per-payer historical realization & avg TAT from settled claims
  const settled = d.filter(x => x.status === 'Settled' && x.paymentDate);
  const payerHist: Record<string, { claimed: number; settled: number; tats: number[] }> = {};
  settled.forEach(x => {
    const k = x.tpa || 'Unknown';
    if (!payerHist[k]) payerHist[k] = { claimed: 0, settled: 0, tats: [] };
    payerHist[k].claimed += x.claimedAmt;
    payerHist[k].settled += x.settledAmt;
    const t = ddiff(x.admission, x.paymentDate);
    if (t !== null && t < 365) payerHist[k].tats.push(t);
  });
  const overallRate = settled.length
    ? sm(settled.map(x => x.settledAmt)) / Math.max(1, sm(settled.map(x => x.claimedAmt)))
    : 0.85;
  const overallTAT = settled.length
    ? settled.map(x => ddiff(x.admission, x.paymentDate)).filter((v): v is number => v !== null && v < 365)
        .reduce((a, b, _, arr) => a + b / arr.length, 0)
    : 45;

  const lookup = (k: string) => {
    const h = payerHist[k];
    if (!h || h.claimed === 0) return { rate: overallRate, tat: overallTAT };
    const rate = h.settled / h.claimed;
    const tat = h.tats.length ? h.tats.reduce((a, b) => a + b, 0) / h.tats.length : overallTAT;
    return { rate, tat };
  };

  const now = new Date();
  const open = d.filter(x => PENDING_STATUSES(x.status) && x.admission);

  // Build forecast buckets
  const buckets = [
    { name: 'Week 1-2 (0-14d)', min: 0, max: 14, expected: 0, atRisk: 0, count: 0 },
    { name: 'Week 3-4 (15-30d)', min: 15, max: 30, expected: 0, atRisk: 0, count: 0 },
    { name: 'Month 2 (31-60d)', min: 31, max: 60, expected: 0, atRisk: 0, count: 0 },
    { name: 'Month 3 (61-90d)', min: 61, max: 90, expected: 0, atRisk: 0, count: 0 },
    { name: 'Beyond 90d', min: 91, max: 9999, expected: 0, atRisk: 0, count: 0 },
  ];

  let totalOpen = 0;
  let totalAtRisk = 0;
  open.forEach(x => {
    const ageDays = Math.max(0, Math.round((now.getTime() - x.admission!.getTime()) / 86400000));
    const { rate, tat } = lookup(x.tpa);
    const daysToCollect = Math.max(0, Math.round(tat - ageDays));
    const expected = x.claimedAmt * Math.max(0.05, Math.min(1, rate));
    const atRisk = ageDays > 180 ? expected * 0.5 : 0;
    totalOpen += x.claimedAmt;
    totalAtRisk += atRisk;
    const b = buckets.find(b => daysToCollect >= b.min && daysToCollect <= b.max)!;
    b.expected += expected - atRisk;
    b.atRisk += atRisk;
    b.count++;
  });

  const total90 = buckets.slice(0, 4).reduce((a, b) => a + b.expected, 0);
  const totalBeyond = buckets[4].expected + buckets[4].atRisk;

  // Cumulative chart data (weekly buckets within 90 days)
  const weekly: { name: string; expected: number; cumulative: number }[] = [];
  for (let w = 1; w <= 13; w++) {
    const lo = (w - 1) * 7;
    const hi = w * 7 - 1;
    let exp = 0;
    open.forEach(x => {
      const ageDays = Math.max(0, Math.round((now.getTime() - x.admission!.getTime()) / 86400000));
      const { rate, tat } = lookup(x.tpa);
      const dtc = Math.max(0, Math.round(tat - ageDays));
      if (dtc >= lo && dtc <= hi) {
        const expected = x.claimedAmt * Math.max(0.05, Math.min(1, rate));
        const atRisk = ageDays > 180 ? expected * 0.5 : 0;
        exp += expected - atRisk;
      }
    });
    weekly.push({ name: `W${w}`, expected: exp, cumulative: 0 });
  }
  weekly.reduce((acc, row) => { row.cumulative = acc + row.expected; return row.cumulative; }, 0);

  // Top payer forecast table
  const payerForecast: Record<string, { count: number; pending: number; expected: number; rate: number; tat: number }> = {};
  open.forEach(x => {
    const k = x.tpa || 'Unknown';
    const { rate, tat } = lookup(x.tpa);
    if (!payerForecast[k]) payerForecast[k] = { count: 0, pending: 0, expected: 0, rate, tat };
    payerForecast[k].count++;
    payerForecast[k].pending += x.claimedAmt;
    payerForecast[k].expected += x.claimedAmt * Math.max(0.05, Math.min(1, rate));
  });
  const payerRows = Object.entries(payerForecast)
    .sort((a, b) => b[1].expected - a[1].expected)
    .slice(0, 12);

  const colors = ['#15803D', '#65A30D', '#D97706', '#DC2626', '#7B1212'];

  return (
    <div className="animate-fadeIn">
      <div className="hero-gradient rounded-2xl p-7 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 text-primary-foreground">
        <div>
          <h2 className="font-display text-2xl font-black mb-1">90-Day Cash Flow Forecast</h2>
          <p className="text-xs text-primary-foreground/70 leading-relaxed max-w-xl">
            Projected collections from {open.length.toLocaleString()} open claims using payer-specific
            historical realization rates and average TAT.
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl font-black">{fmt(total90)}</div>
          <div className="text-[10px] tracking-wider uppercase text-primary-foreground/50 mt-1">Expected next 90 days</div>
        </div>
      </div>

      <SectionHeading title="Forecast Snapshot" tag="Cash Flow Projection" />
      <MetricGrid>
        <MetricCard label="Total Open AR" value={fmt(totalOpen)} subtitle={open.length + ' open claims'} highlighted />
        <MetricCard label="Expected (90 days)" value={fmt(total90)} subtitle={fN(pct(total90, totalOpen)) + '% of open AR'} badge={{ type: 'good', text: 'Projected' }} />
        <MetricCard label="Beyond 90 Days" value={fmt(totalBeyond)} subtitle="Long-tail collections" badge={{ type: 'warning', text: 'Slow' }} />
        <MetricCard label="At-Risk Receivables" value={fmt(totalAtRisk)} subtitle="180+ day claims (50% provision)" badge={{ type: totalAtRisk > 0 ? 'critical' : 'good', text: totalAtRisk > 0 ? 'Watch' : 'Clear' }} />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="Cash Flow by Period" subtitle="Expected collections by time bucket" height="300px">
          <ResponsiveContainer>
            <BarChart data={buckets.map(b => ({ name: b.name, value: b.expected }))}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {buckets.map((_, i) => <Cell key={i} fill={colors[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Cumulative 90-Day Forecast" subtitle="Weekly expected + running total" height="300px">
          <ResponsiveContainer>
            <ComposedChart data={weekly}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="expected" name="Weekly Expected" fill="hsl(var(--rcm-500))" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke="hsl(var(--rcm-800))" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable
        title="Top Payer Forecast"
        subtitle="Expected collections by payer · ranked by 90-day cash impact"
        headers={['Payer', 'Open Claims', 'Pending Value', 'Realization %', 'Avg TAT', 'Expected Collection']}
        rows={payerRows.map(([k, v]) => [
          k,
          v.count.toString(),
          fmt(v.pending),
          fN(v.rate * 100) + '%',
          fN(v.tat) + ' days',
          <span className="font-semibold text-rcm-700">{fmt(v.expected)}</span>,
        ])}
      />

      <DataTable
        title="Forecast Detail by Period"
        subtitle="Expected vs at-risk amounts per bucket"
        headers={['Period', 'Open Claims', 'Expected Collection', 'At-Risk', 'Total Forecast']}
        rows={buckets.map(b => [
          b.name,
          b.count.toString(),
          fmt(b.expected),
          <span style={{ color: b.atRisk > 0 ? '#DC2626' : '#6B7280' }}>{fmt(b.atRisk)}</span>,
          <strong>{fmt(b.expected + b.atRisk)}</strong>,
        ])}
      />
    </div>
  );
}