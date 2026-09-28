import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, avg, shortP, R_PAL } from '@/lib/rcm-utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

export function PayerTab() {
  const { globalData, groupBy } = useDashboard();
  if (!globalData) return null;
  const { n, totalClaimed, tpaArr } = globalData;

  // Ranked by unique patients first, then billed value
  const byVol = [...tpaArr].sort((a, b) => ((b.uniquePatients || 0) - (a.uniquePatients || 0)) || (b.v.claimed - a.v.claimed));
  const byApprH = [...tpaArr].sort((a, b) => b.approvalRate - a.approvalRate);
  const byApprL = [...tpaArr].sort((a, b) => a.approvalRate - b.approvalRate);
  const byNetColl = [...tpaArr].filter(t => !t.lowVolume).sort((a, b) => b.collRate - a.collRate);
  const bySettled = [...tpaArr].sort((a, b) => b.v.settled - a.v.settled).slice(0, 8);

  const label = groupBy === 'insurer' ? 'Insurer' : 'TPA';

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Payer Performance" tag="TPA/Insurer Benchmarking" />
      <MetricGrid>
        <MetricCard label={`Active ${label}s`} value={Object.keys(globalData.tpaMap).length.toString()} subtitle="Unique payers in data" />
        <MetricCard label="Top Payer by Patients" value={byVol[0] ? shortP(byVol[0].k) : '—'} subtitle={byVol[0] ? (byVol[0].uniquePatients || 0) + ' unique patients · ' + byVol[0].v.cnt + ' claims' : ''} highlighted />
        <MetricCard label="Best Approval Rate" value={fN(byApprH[0]?.approvalRate || 0) + '%'} subtitle={byApprH[0] ? shortP(byApprH[0].k) : ''} />
        <MetricCard label="Worst Approval Rate" value={fN(byApprL[0]?.approvalRate || 0) + '%'} subtitle={byApprL[0] ? shortP(byApprL[0].k) : ''} />
        <MetricCard label="Payer Concentration" value={fN(pct(byVol[0]?.v.claimed || 0, totalClaimed)) + '%'} subtitle="Largest payer share of billed" />
        <MetricCard label="Payers with 15+ Claims" value={tpaArr.length.toString()} subtitle="Eligible for benchmarking" />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title={`${label}-wise Approval Rate (%)`} subtitle="Approved ÷ Claimed" height="360px" full>
          <ResponsiveContainer><BarChart data={byApprH.map(t => ({ name: shortP(t.k), value: +fN(t.approvalRate) }))} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => v + '%'} /><Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {byApprH.map((t, i) => <Cell key={i} fill={t.approvalRate > 75 ? '#059669' : t.approvalRate > 60 ? '#D97706' : '#DC2626'} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Revenue Concentration" subtitle="% of total settled amount by payer" height="300px">
          <ResponsiveContainer><PieChart><Pie data={bySettled.map(t => ({ name: shortP(t.k), value: t.v.settled }))} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80}>
            {bySettled.map((_, i) => <Cell key={i} fill={R_PAL[i % R_PAL.length]} />)}
          </Pie><Tooltip formatter={(v: number) => fmt(v)} /><Legend /></PieChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Net Collection Rate" subtitle="Settled ÷ Approved %" height="300px">
          <ResponsiveContainer><BarChart data={byNetColl.map(t => ({ name: shortP(t.k), value: +fN(t.collRate) }))} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => v + '%'} /><Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {byNetColl.map((t, i) => <Cell key={i} fill={t.collRate > 85 ? '#059669' : t.collRate > 70 ? '#D97706' : '#DC2626'} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable title="Full Payer Scorecard" subtitle="Ranked by unique patients, then billed value · Graded A–D · * fewer than 15 claims, rates less reliable"
        headers={[label, 'Unique Patients', 'Claims', 'Billed', 'Approval %', 'Net Coll %', 'Denial %', 'Avg TAT', 'Grade']}
        rows={byVol.slice(0, 15).map(t => {
          const score = (t.approvalRate * 0.4) + (t.collRate * 0.4) + ((100 - t.denialRate) * 0.2);
          const grade = score > 80 ? 'A' : score > 65 ? 'B' : score > 50 ? 'C' : 'D';
          const gc = grade === 'A' ? 'good' : grade === 'B' ? 'warning' : 'critical';
          return [shortP(t.k) + (t.lowVolume ? ' *' : ''), (t.uniquePatients || 0).toLocaleString(), t.v.cnt.toString(), fmt(t.v.claimed),
            <span style={{ color: t.approvalRate > 75 ? '#15803D' : t.approvalRate > 60 ? '#854D0E' : '#9B1C1C' }}>{fN(t.approvalRate)}%</span>,
            fN(t.collRate) + '%',
            <span style={{ color: t.denialRate > 20 ? '#9B1C1C' : t.denialRate > 10 ? '#854D0E' : '#15803D' }}>{fN(t.denialRate)}%</span>,
            t.v.tatVals?.length ? fN(t.avgTAT) + 'd' : '—',
            <span className={`badge-${gc} text-[10px] font-bold px-2 py-0.5 rounded-full`}>{grade}</span>];
        })}
      />
    </div>
  );
}
