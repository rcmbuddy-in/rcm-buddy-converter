import { useDashboard } from '@/contexts/DashboardContext';
import { useChartPrefs } from '@/contexts/ChartPrefsContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, sm, avg, ddiff, shortP, R_PAL, MIX_PAL, getBadgeType } from '@/lib/rcm-utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line, CartesianGrid
} from 'recharts';

export function CorporateTab() {
  const { globalData, getGroupKey } = useDashboard();
  const { chartType } = useChartPrefs();
  if (!globalData) return null;

  // Filter: keep only corporate/group policies, remove Unknown & Individual
  const corpData = globalData.allData.filter(x => {
    const pt = (x.policyType || '').toLowerCase().trim();
    if (!pt || pt === 'unknown' || pt === 'individual' || pt === 'retail') return false;
    return true;
  });

  if (corpData.length === 0) {
    return (
      <div className="animate-fadeIn">
        <SectionHeading title="Corporate Module" tag="Group / Corporate Policies" />
        <p className="text-muted-foreground text-sm mt-4">No corporate/group policy claims found in the data. Only Individual/Unknown policies exist.</p>
      </div>
    );
  }

  const n = corpData.length;
  const totalClaimed = sm(corpData.map(x => x.claimedAmt));
  const totalApproved = sm(corpData.map(x => x.approvedAmt));
  const totalSettled = sm(corpData.map(x => x.settledAmt));
  const totalShortfall = sm(corpData.map(x => x.shortfall));
  const denied = corpData.filter(x => x.status.toLowerCase().includes('denied') || x.status === 'Cancelled');
  const tatVals = corpData.map(x => ddiff(x.admission, x.paymentDate)).filter((v): v is number => v !== null && v < 365);

  const approvalRate = pct(totalApproved, totalClaimed);
  const collRate = pct(totalSettled, totalApproved);
  const denialRate = pct(denied.length, n);
  const avgTAT = avg(tatVals);
  const avgClaim = totalClaimed / n;
  const corpShare = pct(n, globalData.allData.length);

  // By TPA/Insurer
  const payerMap: Record<string, { cnt: number; claimed: number; approved: number; settled: number; denied: number; tatVals: number[] }> = {};
  corpData.forEach(x => {
    const k = getGroupKey(x);
    if (!payerMap[k]) payerMap[k] = { cnt: 0, claimed: 0, approved: 0, settled: 0, denied: 0, tatVals: [] };
    const p = payerMap[k];
    p.cnt++; p.claimed += x.claimedAmt; p.approved += x.approvedAmt; p.settled += x.settledAmt;
    if (x.status.toLowerCase().includes('denied') || x.status === 'Cancelled') p.denied++;
    const tat = ddiff(x.admission, x.paymentDate);
    if (tat !== null && tat < 365) p.tatVals.push(tat);
  });

  const payerArr = Object.entries(payerMap)
    .filter(([_, v]) => v.cnt >= 5)
    .sort((a, b) => b[1].claimed - a[1].claimed);

  // By policy type (corporate subtypes)
  const ptMap: Record<string, number> = {};
  corpData.forEach(x => {
    const pt = x.policyType || 'Other';
    ptMap[pt] = (ptMap[pt] || 0) + 1;
  });
  const ptData = Object.entries(ptMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  // Monthly trend
  const monthMap: Record<string, { cnt: number; claimed: number; settled: number }> = {};
  corpData.forEach(x => {
    if (!x.admission) return;
    const key = `${x.admission.getFullYear()}-${String(x.admission.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap[key]) monthMap[key] = { cnt: 0, claimed: 0, settled: 0 };
    monthMap[key].cnt++;
    monthMap[key].claimed += x.claimedAmt;
    monthMap[key].settled += x.settledAmt;
  });
  const monthlyData = Object.keys(monthMap).sort().slice(-18).map(k => {
    const p = k.split('-');
    return {
      label: new Date(+p[0], +p[1] - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      ...monthMap[k],
    };
  });

  // Top payer volume chart
  const topPayers = payerArr.slice(0, 10).map(([k, v]) => ({ name: shortP(k), value: v.cnt, claimed: v.claimed }));

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Corporate Module" tag="Group / Corporate Policy Analytics" />

      <MetricGrid>
        <MetricCard label="Corporate Claims" value={n.toLocaleString()} subtitle={`${fN(corpShare)}% of all claims`} highlighted />
        <MetricCard label="Corporate Billed" value={fmt(totalClaimed)} subtitle="Total claimed amount" />
        <MetricCard label="Corporate Collected" value={fmt(totalSettled)} subtitle="Total settled amount" />
        <MetricCard label="Approval Rate" value={fN(approvalRate) + '%'} subtitle="Approved ÷ Billed" badge={{ type: getBadgeType(approvalRate, 75, 60), text: approvalRate > 75 ? 'Healthy' : 'Watch' }} />
        <MetricCard label="Net Collection Rate" value={fN(collRate) + '%'} subtitle="Settled ÷ Approved" badge={{ type: getBadgeType(collRate, 85, 70), text: collRate > 85 ? 'Strong' : 'Needs Attention' }} />
        <MetricCard label="Denial Rate" value={fN(denialRate) + '%'} subtitle={denied.length + ' denied claims'} badge={{ type: getBadgeType(denialRate, 10, 20, false), text: denialRate < 10 ? 'Controlled' : 'High' }} />
        <MetricCard label="Avg Claim Value" value={fmt(avgClaim)} subtitle="Per corporate claim" />
        <MetricCard label="Avg TAT" value={fN(avgTAT) + ' days'} subtitle="Admission to payment" badge={{ type: getBadgeType(avgTAT, 30, 60, false), text: avgTAT < 30 ? 'Fast' : 'Slow' }} />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="Corporate Claims by Payer" subtitle="Top payers by volume" height="320px">
          <ResponsiveContainer>
            <BarChart data={topPayers} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="value" name="Claims" radius={[0, 4, 4, 0]}>
                {topPayers.map((_, i) => <Cell key={i} fill={R_PAL[i % R_PAL.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Corporate Policy Type Split" subtitle="Distribution across corporate subtypes">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={ptData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                {ptData.map((_, i) => <Cell key={i} fill={MIX_PAL[i % MIX_PAL.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Corporate Monthly Trend" subtitle="Claims volume and revenue" height="300px" full>
          <ResponsiveContainer>
            {chartType === 'line' ? (
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip formatter={(v: number, name: string) => name === 'Claims' ? v : fmt(v)} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="cnt" name="Claims" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="settled" name="Settled" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            ) : (
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="cnt" name="Claims" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      {payerArr.length > 0 && (
        <DataTable
          title="Corporate Payer Scorecard"
          subtitle="Performance by TPA/Insurer for corporate claims"
          headers={['Payer', 'Claims', 'Billed', 'Approval %', 'Collection %', 'Denial %', 'Avg TAT']}
          rows={payerArr.slice(0, 15).map(([k, v]) => {
            const aR = pct(v.approved, v.claimed);
            const cR = pct(v.settled, v.approved);
            const dR = pct(v.denied, v.cnt);
            const t = avg(v.tatVals);
            return [
              shortP(k),
              v.cnt.toString(),
              fmt(v.claimed),
              <span style={{ color: aR > 75 ? '#15803D' : aR > 60 ? '#854D0E' : '#9B1C1C' }}>{fN(aR)}%</span>,
              fN(cR) + '%',
              <span style={{ color: dR < 10 ? '#15803D' : dR < 20 ? '#854D0E' : '#9B1C1C' }}>{fN(dR)}%</span>,
              v.tatVals.length ? fN(t) + 'd' : '—',
            ];
          })}
        />
      )}
    </div>
  );
}
