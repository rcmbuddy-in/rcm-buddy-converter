import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { InsightList } from './InsightCard';
import { getFinancialInsights } from '@/lib/insights-engine';
import { fmt, fN, pct, median, getBadgeType, shortP } from '@/lib/rcm-utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

export function FinancialTab() {
  const { globalData } = useDashboard();
  if (!globalData) return null;
  const { data: d, n, totalClaimed, totalApproved, totalSettled, totalShortfall, totalCopay, totalDiscount, totalTDS } = globalData;

  const apR = pct(totalApproved, totalClaimed);
  const dedP = pct(totalClaimed - totalApproved, totalClaimed);
  const ncR = pct(totalSettled, totalApproved);
  const sfP = pct(totalShortfall, totalClaimed);
  const discP = pct(totalDiscount, totalClaimed);
  const tdsP = pct(totalTDS, totalSettled);
  const copP = pct(totalCopay, totalClaimed);
  const avgClaim = totalClaimed / n;

  // EBITDA-impact proxy: net realised after deductions, copay, TDS
  const ebitdaProxy = totalSettled - totalTDS;
  const grossLeak = totalClaimed - totalApproved;
  const netLeak = totalClaimed - totalSettled;
  const insights = getFinancialInsights(globalData);

  // Waterfall
  const avgAppr = totalApproved / n;
  const avgSF = totalShortfall / n;
  const avgCopay = totalCopay / n;
  const avgDisc = totalDiscount / n;
  const avgSettled = totalSettled / n;
  const avgTDS = totalTDS / n;
  const waterfallData = [
    { name: 'Billed', value: Math.round(avgClaim) },
    { name: 'Approved', value: Math.round(avgAppr) },
    { name: 'After Shortfall', value: Math.round(avgAppr - avgSF) },
    { name: 'After Copay', value: Math.round(avgAppr - avgSF - avgCopay) },
    { name: 'After Discount', value: Math.round(avgAppr - avgSF - avgCopay - avgDisc) },
    { name: 'Settled', value: Math.round(avgSettled) },
    { name: 'After TDS', value: Math.round(avgSettled - avgTDS) },
  ];
  const wfColors = ['#1D4ED8', '#2563EB', '#D97706', '#DC2626', '#B91C1C', '#059669', '#15803D'];

  // Deduction pie
  const dedAmt = Math.max(0, totalClaimed - totalApproved - totalShortfall - totalCopay - totalDiscount);
  const dedData = [
    { name: 'Net Settled', value: totalSettled },
    { name: 'Payer Deductions', value: dedAmt },
    { name: 'Shortfall', value: totalShortfall },
    { name: 'Copay', value: totalCopay },
    { name: 'Discount', value: totalDiscount },
    { name: 'TDS', value: totalTDS },
  ];
  const dedColors = ['#059669', '#DC2626', '#F97316', '#D97706', '#7C3AED', '#6B7280'];

  // Quarterly table
  const quarters: Record<string, { cnt: number; claimed: number; approved: number; settled: number }> = {};
  d.forEach(x => {
    if (!x.admission) return;
    const y = x.admission.getFullYear(), q = Math.ceil((x.admission.getMonth() + 1) / 3);
    const k = `Q${q} ${y}`;
    if (!quarters[k]) quarters[k] = { cnt: 0, claimed: 0, approved: 0, settled: 0 };
    quarters[k].cnt++; quarters[k].claimed += x.claimedAmt; quarters[k].approved += x.approvedAmt; quarters[k].settled += x.settledAmt;
  });
  const qKeys = Object.keys(quarters).sort().slice(-8);

  // Insurer profitability ranking
  const insurerMap: Record<string, { claimed: number; approved: number; settled: number; cnt: number }> = {};
  d.forEach(x => {
    const k = x.insurer || 'Unknown';
    if (!insurerMap[k]) insurerMap[k] = { claimed: 0, approved: 0, settled: 0, cnt: 0 };
    insurerMap[k].claimed += x.claimedAmt;
    insurerMap[k].approved += x.approvedAmt;
    insurerMap[k].settled += x.settledAmt;
    insurerMap[k].cnt++;
  });
  const insurerRanked = Object.entries(insurerMap)
    .filter(([, v]) => v.cnt >= 5)
    .map(([k, v]) => ({ k, ...v, yield: pct(v.settled, v.claimed) }))
    .sort((a, b) => b.settled - a.settled)
    .slice(0, 10);

  // Deduction trend by quarter
  const dedTrend = qKeys.map(k => {
    const q = quarters[k];
    return { name: k, deductionPct: pct(q.claimed - q.settled, q.claimed) };
  });

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Financial Performance KPIs" tag="Revenue & Collections" />

      <InsightList title="Financial Insights" subtitle="Auto-detected leakage drivers and recommendations" insights={insights} />

      <MetricGrid>
        <MetricCard label="Gross Billed" value={fmt(totalClaimed)} subtitle="Top of revenue funnel" highlighted />
        <MetricCard label="Net Collected" value={fmt(totalSettled)} subtitle={fN(pct(totalSettled, totalClaimed)) + '% of gross'} />
        <MetricCard label="EBITDA Impact (proxy)" value={fmt(ebitdaProxy)} subtitle="Net settled minus TDS" badge={{ type: getBadgeType(pct(ebitdaProxy, totalClaimed), 70, 55), text: fN(pct(ebitdaProxy, totalClaimed)) + '% yield' }} />
        <MetricCard label="Gross→Net Leakage" value={fmt(netLeak)} subtitle={fN(pct(netLeak, totalClaimed)) + '% of billed lost'} badge={{ type: 'warning', text: 'Track' }} />
        <MetricCard label="Approval Rate" value={fN(apR) + '%'} subtitle="Approved ÷ Billed" badge={{ type: getBadgeType(apR, 75, 60), text: fN(apR) + '%' }} />
        <MetricCard label="Payer Deduction %" value={fN(dedP) + '%'} subtitle={fmt(grossLeak) + ' deducted by payers'} />
        <MetricCard label="Net Collection Rate" value={fN(ncR) + '%'} subtitle="Settled ÷ Approved" badge={{ type: getBadgeType(ncR, 85, 70), text: ncR > 85 ? 'Strong' : 'Needs Attention' }} />
        <MetricCard label="Shortfall Rate" value={fN(sfP) + '%'} subtitle={fmt(totalShortfall) + ' total shortfall'} />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="Average Claim Value Waterfall" subtitle="From billed to net collected per claim" height="300px">
          <ResponsiveContainer><BarChart data={waterfallData}><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} /><Tooltip formatter={(v: number) => fmt(v)} /><Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {waterfallData.map((_, i) => <Cell key={i} fill={wfColors[i]} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Deduction Breakdown" subtitle="Where the billed amount goes" height="300px">
          <ResponsiveContainer><PieChart><Pie data={dedData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80}>
            {dedData.map((_, i) => <Cell key={i} fill={dedColors[i]} />)}
          </Pie><Tooltip formatter={(v: number) => fmt(v)} /><Legend /></PieChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      {dedTrend.length > 1 && (
        <ChartGrid>
          <ChartCard title="Deduction % Trend" subtitle="Quarterly leakage trajectory (lower is better)" height="260px">
            <ResponsiveContainer><BarChart data={dedTrend}><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={v => fN(v) + '%'} /><Tooltip formatter={(v: number) => fN(v) + '%'} /><Bar dataKey="deductionPct" radius={[4, 4, 0, 0]}>
              {dedTrend.map((q, i) => <Cell key={i} fill={q.deductionPct > 30 ? '#DC2626' : q.deductionPct > 20 ? '#D97706' : '#059669'} />)}
            </Bar></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Insurer Profitability" subtitle="Net realisation % by insurer (top 10 by volume)" height="260px">
            <ResponsiveContainer><BarChart data={insurerRanked.map(r => ({ name: shortP(r.k), yield: r.yield }))} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fN(v) + '%'} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => fN(v) + '%'} />
              <Bar dataKey="yield" radius={[0, 4, 4, 0]}>
                {insurerRanked.map((r, i) => <Cell key={i} fill={r.yield >= 80 ? '#059669' : r.yield >= 65 ? '#D97706' : '#DC2626'} />)}
              </Bar>
            </BarChart></ResponsiveContainer>
          </ChartCard>
        </ChartGrid>
      )}

      <DataTable title="Insurer Profitability Ranking" subtitle="Net yield = Settled ÷ Billed (higher is better)"
        headers={['Insurer', 'Claims', 'Billed', 'Settled', 'Net Yield', 'Status']}
        rows={insurerRanked.map(r => [
          shortP(r.k), r.cnt.toString(), fmt(r.claimed), fmt(r.settled),
          <span style={{ color: r.yield >= 80 ? '#15803D' : r.yield >= 65 ? '#854D0E' : '#9B1C1C', fontWeight: 600 }}>{fN(r.yield)}%</span>,
          r.yield >= 80 ? 'Profitable' : r.yield >= 65 ? 'Acceptable' : 'Renegotiate',
        ])}
      />

      <DataTable title="Financial Summary by Quarter" subtitle="Claimed · Approved · Settled"
        headers={['Quarter', 'Claims', 'Billed', 'Approved', 'Approved %', 'Settled', 'Collection %']}
        rows={qKeys.map(k => {
          const q = quarters[k];
          return [<strong>{k}</strong>, q.cnt.toString(), fmt(q.claimed), fmt(q.approved), fN(pct(q.approved, q.claimed)) + '%', fmt(q.settled), fN(pct(q.settled, q.approved)) + '%'];
        })}
      />
    </div>
  );
}
