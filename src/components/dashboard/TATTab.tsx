import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fN, avg, ddiff, shortP, R_PAL, getBadgeType } from '@/lib/rcm-utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export function TATTab() {
  const { globalData, getGroupKey } = useDashboard();
  if (!globalData) return null;
  const { data: d, n } = globalData;

  const tS = d.map(x => ddiff(x.admission, x.docSubmit)).filter((v): v is number => v !== null && v < 365);
  const tP = d.map(x => ddiff(x.docSubmit, x.paymentDate)).filter((v): v is number => v !== null && v < 365);
  const tE = d.map(x => ddiff(x.admission, x.paymentDate)).filter((v): v is number => v !== null && v < 365);
  const los = d.map(x => ddiff(x.admission, x.discharge)).filter((v): v is number => v !== null && v < 120);
  const aS = avg(tS), aP = avg(tP), aE = avg(tE), aL = avg(los);
  const dToS = d.map(x => ddiff(x.discharge, x.paymentDate)).filter((v): v is number => v !== null && v < 365);

  // TPA TAT
  const tatMap: Record<string, number[]> = {};
  d.forEach(x => {
    const k = getGroupKey(x);
    if (!tatMap[k]) tatMap[k] = [];
    const t = ddiff(x.admission, x.paymentDate);
    if (t !== null && t < 365) tatMap[k].push(t);
  });
  const tatData = Object.entries(tatMap).filter(e => e[1].length >= 10)
    .map(([name, vals]) => ({ name: shortP(name), value: Math.round(avg(vals)), avg: avg(vals) }))
    .sort((a, b) => b.value - a.value).slice(0, 12);

  // LOS distribution
  const losB: Record<string, number> = { '1-3 days': 0, '4-7 days': 0, '8-14 days': 0, '15-30 days': 0, '31+ days': 0 };
  los.forEach(l => {
    if (l <= 3) losB['1-3 days']++; else if (l <= 7) losB['4-7 days']++; else if (l <= 14) losB['8-14 days']++; else if (l <= 30) losB['15-30 days']++; else losB['31+ days']++;
  });
  const losData = Object.entries(losB).map(([name, value]) => ({ name, value }));

  const stages = [
    { s: 'Admission → Doc Submission', avg: aS, arr: tS, thr: [7, 14] },
    { s: 'Doc Submission → Payment', avg: aP, arr: tP, thr: [30, 60] },
    { s: 'End-to-End (Admission → Payment)', avg: aE, arr: tE, thr: [30, 60] },
    { s: 'Length of Stay', avg: aL, arr: los, thr: [999, 999] },
  ];

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Turnaround Time Analysis" tag="Processing Speed" />
      <MetricGrid>
        <MetricCard label="Submission TAT" value={fN(aS) + ' days'} subtitle="Admission → Doc submission" />
        <MetricCard label="Payment TAT" value={fN(aP) + ' days'} subtitle="Submission → Payment" />
        <MetricCard label="End-to-End TAT" value={fN(aE) + ' days'} subtitle="Admission → Settlement" badge={{ type: getBadgeType(aE, 30, 60, false), text: aE < 30 ? 'Excellent' : aE < 60 ? 'Average' : 'Slow' }} />
        <MetricCard label="Length of Stay" value={fN(aL) + ' days'} subtitle="Admission → Discharge" />
        <MetricCard label="TAT Data Coverage" value={fN(tE.length / n * 100) + '%'} subtitle={tE.length + ' claims with full dates'} />
        <MetricCard label="Discharge-to-Settle" value={fN(avg(dToS)) + ' days'} subtitle="Post-discharge clearance" />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="TPA-wise Average Payment TAT (Days)" subtitle="Admission to payment settled" height="360px">
          <ResponsiveContainer><BarChart data={tatData} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => v + ' days'} /><Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {tatData.map((d, i) => <Cell key={i} fill={d.avg > 60 ? '#DC2626' : d.avg > 30 ? '#D97706' : '#059669'} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Length of Stay Distribution" subtitle="Days from admission to discharge" height="360px">
          <ResponsiveContainer><BarChart data={losData}><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {losData.map((_, i) => <Cell key={i} fill={R_PAL[i % R_PAL.length]} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable title="TAT Breakdown by Stage" subtitle="Average days per processing stage"
        headers={['Stage', 'Avg Days', 'Min', 'Max', 'Samples', 'Rating']}
        rows={stages.map(r => {
          const cls = r.avg < r.thr[0] ? 'good' : r.avg < r.thr[1] ? 'warning' : 'critical';
          const lbl = r.avg < r.thr[0] ? 'Good' : r.avg < r.thr[1] ? 'Average' : 'Slow';
          return [r.s, fN(r.avg), r.arr.length ? Math.min(...r.arr).toString() : '—', r.arr.length ? Math.min(Math.max(...r.arr), 365).toString() : '—', r.arr.length.toString(), <span className={`badge-${cls} text-[10px] font-bold px-2 py-0.5 rounded-full`}>{lbl}</span>];
        })}
      />
    </div>
  );
}
