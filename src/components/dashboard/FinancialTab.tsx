import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, median, getBadgeType } from '@/lib/rcm-utils';
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

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Financial Performance KPIs" tag="Revenue & Collections" />
      <MetricGrid>
        <MetricCard label="Approval Rate" value={fN(apR) + '%'} subtitle="Approved ÷ Billed" badge={{ type: getBadgeType(apR, 75, 60), text: fN(apR) + '%' }} />
        <MetricCard label="Avg Deduction %" value={fN(dedP) + '%'} subtitle={fmt(totalClaimed - totalApproved) + ' deducted total'} />
        <MetricCard label="Net Collection Rate" value={fN(ncR) + '%'} subtitle="Settled ÷ Approved" badge={{ type: getBadgeType(ncR, 85, 70), text: ncR > 85 ? 'Strong' : 'Needs Attention' }} />
        <MetricCard label="Shortfall Rate" value={fN(sfP) + '%'} subtitle={fmt(totalShortfall) + ' total shortfall'} />
        <MetricCard label="Copay Burden" value={fN(copP) + '%'} subtitle={fmt(totalCopay) + ' patient copay'} />
        <MetricCard label="Discount Rate" value={fN(discP) + '%'} subtitle={fmt(totalDiscount) + ' (contractual)'} />
        <MetricCard label="TDS Rate" value={fN(tdsP) + '%'} subtitle={fmt(totalTDS) + ' (regulatory)'} />
        <MetricCard label="Avg Claim Value" value={fmt(avgClaim)} subtitle={'Median: ' + fmt(median(d.map(x => x.claimedAmt)))} />
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
