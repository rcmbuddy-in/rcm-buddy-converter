import { isDeniedClaim } from '@/lib/rcm-data';
import { useDashboard } from '@/contexts/DashboardContext';
import { useChartPrefs } from '@/contexts/ChartPrefsContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, sm, avg, ddiff, getBadgeType , payerTat } from '@/lib/rcm-utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, CartesianGrid
} from 'recharts';

interface MonthBucket {
  key: string;
  label: string;
  cnt: number;
  closedApproved: number;
  closedRealised: number;
  claimed: number;
  approved: number;
  settled: number;
  denied: number;
  tatVals: number[];
}

export function MoMTab() {
  const { globalData } = useDashboard();
  const { chartType } = useChartPrefs();
  if (!globalData) return null;
  const { data: d } = globalData;

  // Build monthly buckets
  const map: Record<string, MonthBucket> = {};
  d.forEach(x => {
    if (!x.admission) return;
    const y = x.admission.getFullYear();
    const m = x.admission.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    if (!map[key]) {
      map[key] = {
        key,
        label: new Date(y, m).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        cnt: 0, claimed: 0, approved: 0, settled: 0, denied: 0, tatVals: [], closedApproved: 0, closedRealised: 0,
      };
    }
    const b = map[key];
    b.cnt++; if (x.status === 'Cancelled') (b as any).cancelled = ((b as any).cancelled || 0) + 1;
    b.claimed += x.claimedAmt;
    b.approved += x.approvedAmt;
    b.settled += x.settledAmt;
    if (isDeniedClaim(x)) b.denied++;
    if (x.status === 'Settled') { (b as any).closedClaimed += x.claimedAmt; (b as any).closedSettled += x.settledAmt; }
    const tat = payerTat(x);
    if (tat !== null && tat < 365) b.tatVals.push(tat);
  });

  const months = Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  if (months.length < 2) {
    return (
      <div className="animate-fadeIn">
        <SectionHeading title="Month-on-Month Performance" tag="Trends & Growth" />
        <p className="text-muted-foreground text-sm mt-4">Need at least 2 months of data for MoM analysis.</p>
      </div>
    );
  }

  // Compute MoM changes
  const momData = months.map((m, i) => {
    const prev = i > 0 ? months[i - 1] : null;
    const approvalRate = pct(m.approved, m.claimed);
    const collRate = pct((m as any).closedSettled, (m as any).closedClaimed);
    const denialRate = pct(m.denied, m.cnt - ((m as any).cancelled || 0));
    const avgTAT = avg(m.tatVals);
    return {
      label: m.label,
      cnt: m.cnt,
      claimed: m.claimed,
      approved: m.approved,
      settled: m.settled,
      approvalRate: +approvalRate.toFixed(1),
      collRate: +collRate.toFixed(1),
      denialRate: +denialRate.toFixed(1),
      avgTAT: +avgTAT.toFixed(1),
      cntChange: prev ? +(pct(m.cnt - prev.cnt, prev.cnt)).toFixed(1) : 0,
      claimedChange: prev ? +(pct(m.claimed - prev.claimed, prev.claimed)).toFixed(1) : 0,
      settledChange: prev ? +(pct(m.settled - prev.settled, prev.settled)).toFixed(1) : 0,
    };
  });

  const latest = momData[momData.length - 1];
  const prev = momData[momData.length - 2];

  // Chart data (last 18 months)
  const chartData = momData.slice(-18);

  const ChartComp = chartType === 'line' ? LineChart : BarChart;

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Month-on-Month Performance" tag="Trends & Growth Tracking" />

      <MetricGrid>
        <MetricCard
          label="Latest Month Volume"
          value={latest.cnt.toLocaleString()}
          subtitle={latest.label}
          badge={latest.cntChange !== 0 ? { type: latest.cntChange > 0 ? 'good' : 'warning', text: (latest.cntChange > 0 ? '+' : '') + fN(latest.cntChange) + '% MoM' } : undefined}
        />
        <MetricCard
          label="Latest Billed"
          value={fmt(latest.claimed)}
          subtitle={latest.label}
          badge={latest.claimedChange !== 0 ? { type: latest.claimedChange > 0 ? 'good' : 'warning', text: (latest.claimedChange > 0 ? '+' : '') + fN(latest.claimedChange) + '% MoM' } : undefined}
        />
        <MetricCard
          label="Latest Collected"
          value={fmt(latest.settled)}
          subtitle={latest.label}
          badge={latest.settledChange !== 0 ? { type: latest.settledChange > 0 ? 'good' : 'warning', text: (latest.settledChange > 0 ? '+' : '') + fN(latest.settledChange) + '% MoM' } : undefined}
        />
        <MetricCard
          label="Approval Rate Trend"
          value={fN(latest.approvalRate) + '%'}
          subtitle={`Prev: ${fN(prev.approvalRate)}%`}
          badge={{ type: getBadgeType(latest.approvalRate, 75, 60), text: latest.approvalRate >= prev.approvalRate ? '↑ Improving' : '↓ Declining' }}
        />
        <MetricCard
          label="Collection Rate Trend"
          value={fN(latest.collRate) + '%'}
          subtitle={`Prev: ${fN(prev.collRate)}%`}
          badge={{ type: getBadgeType(latest.collRate, 85, 70), text: latest.collRate >= prev.collRate ? '↑ Improving' : '↓ Declining' }}
        />
        <MetricCard
          label="Denial Rate Trend"
          value={fN(latest.denialRate) + '%'}
          subtitle={`Prev: ${fN(prev.denialRate)}%`}
          badge={{ type: getBadgeType(latest.denialRate, 10, 20, false), text: latest.denialRate <= prev.denialRate ? '↓ Improving' : '↑ Worsening' }}
        />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="Monthly Claims Volume" subtitle="Count of claims by month" height="300px" full>
          <ResponsiveContainer>
            {chartType === 'line' ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="cnt" name="Claims" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="cnt" name="Claims" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue Trend (Billed vs Settled)" subtitle="Monthly comparison" height="300px" full>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Line type="monotone" dataKey="claimed" name="Billed" stroke="#1D4ED8" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="settled" name="Settled" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Approval & Collection Rate Trend" subtitle="Month-over-month %" height="300px">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip formatter={(v: number) => v + '%'} />
              <Legend />
              <Line type="monotone" dataKey="approvalRate" name="Approval %" stroke="#1D4ED8" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="collRate" name="Collection %" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Denial Rate & Avg TAT Trend" subtitle="Monthly denial % and turnaround" height="300px">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="denialRate" name="Denial %" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="avgTAT" name="Avg TAT (days)" stroke="#D97706" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable
        title="Monthly Performance Table"
        subtitle="All key metrics by month"
        headers={['Month', 'Claims', 'Billed', 'Settled', 'Approval %', 'Collection %', 'Denial %', 'Avg TAT']}
        rows={momData.slice(-12).reverse().map(m => [
          <strong>{m.label}</strong>,
          m.cnt.toString(),
          fmt(m.claimed),
          fmt(m.settled),
          <span style={{ color: m.approvalRate > 75 ? '#15803D' : m.approvalRate > 60 ? '#854D0E' : '#9B1C1C' }}>{fN(m.approvalRate)}%</span>,
          <span style={{ color: m.collRate > 85 ? '#15803D' : m.collRate > 70 ? '#854D0E' : '#9B1C1C' }}>{fN(m.collRate)}%</span>,
          <span style={{ color: m.denialRate < 10 ? '#15803D' : m.denialRate < 20 ? '#854D0E' : '#9B1C1C' }}>{fN(m.denialRate)}%</span>,
          m.avgTAT > 0 ? fN(m.avgTAT) + 'd' : '—',
        ])}
      />
    </div>
  );
}
