import { useDashboard } from '@/contexts/DashboardContext';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, shortP, R_PAL } from '@/lib/rcm-utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

export function LeakageTab() {
  const { globalData, groupBy } = useDashboard();
  if (!globalData) return null;
  const { n, totalClaimed, totalSettled, totalDiscount, totalTDS, leakageData, tpaLeak } = globalData;

  const { payerDed, shortfall, uncollected, deniedVal } = leakageData;
  const totalLeak = payerDed + shortfall + uncollected;

  const items = [
    { type: 'Payer Deductions', amt: payerDed, note: 'Approved vs claimed gap — negotiation opportunity', rec: true },
    { type: 'Policy Shortfall', amt: shortfall, note: 'Sum insured exhausted — patient liability', rec: false },
    { type: 'Uncollected Approved', amt: uncollected, note: 'Approved but not yet settled by payer', rec: true },
    { type: 'Denied Claims Value', amt: deniedVal, note: 'Appeal & reconsideration potential', rec: true },
  ];
  const maxAmt = Math.max(...items.map(i => i.amt));

  // Leakage pie
  const leakPieData = [
    { name: 'Payer Deductions', value: payerDed },
    { name: 'Policy Shortfall', value: shortfall },
    { name: 'Uncollected Approved', value: uncollected },
    { name: 'Denied Claims', value: deniedVal },
  ];
  const leakColors = ['#9B1C1C', '#DC2626', '#EF4444', '#D97706'];

  // TPA leakage
  const tlArr = Object.entries(tpaLeak)
    .map(([k, v]: [string, any]) => ({ name: shortP(k), leak: Math.max(0, v.claimed - v.approved) + v.shortfall }))
    .sort((a, b) => b.leak - a.leak).slice(0, 10);

  const label = groupBy === 'insurer' ? 'Insurer' : 'TPA';

  return (
    <div className="animate-fadeIn">
      {/* Hero */}
      <div className="hero-gradient rounded-2xl p-7 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 text-primary-foreground">
        <div>
          <h2 className="font-display text-2xl font-black mb-1">Revenue Leakage Report</h2>
          <p className="text-xs text-primary-foreground/60 leading-relaxed">
            Based on {n.toLocaleString()} claims · Billed: {fmt(totalClaimed)} · Collected: {fmt(totalSettled)} · Gap: {fmt(totalClaimed - totalSettled)}<br />
            <span className="opacity-70 text-[11px]">Hospital Discounts ({fmt(totalDiscount)}) and TDS ({fmt(totalTDS)}) excluded — contractual/regulatory obligations</span>
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl font-black">{fmt(totalLeak)}</div>
          <div className="text-[10px] tracking-wider uppercase text-primary-foreground/45 mt-1">Total Recoverable Leakage</div>
        </div>
      </div>

      {/* Leak cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {items.map(item => (
          <div key={item.type} className="bg-card rounded-xl p-4 border border-border shadow-card border-t-4 border-t-rcm-600">
            <div className="text-[10px] font-bold tracking-wider uppercase text-rcm-500 mb-2">{item.type}</div>
            <div className="font-display text-xl font-bold text-rcm-700">{fmt(item.amt)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{fN(pct(item.amt, totalClaimed))}% of billed</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{item.note}</div>
            <div className="h-1 bg-muted rounded-full mt-2.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-rcm-600 to-rcm-400 rounded-full" style={{ width: `${pct(item.amt, maxAmt)}%` }} />
            </div>
            <span className={`inline-block mt-2 text-[9px] font-bold px-2 py-0.5 rounded-full ${item.rec ? 'badge-good' : 'bg-muted text-muted-foreground'}`}>
              {item.rec ? 'Recoverable' : 'Structural'}
            </span>
          </div>
        ))}
      </div>

      <ChartGrid>
        <ChartCard title="Leakage Composition" subtitle="Breakdown by category (excl. contractual items)" height="300px">
          <ResponsiveContainer><PieChart><Pie data={leakPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80}>
            {leakPieData.map((_, i) => <Cell key={i} fill={leakColors[i]} />)}
          </Pie><Tooltip formatter={(v: number) => fmt(v)} /><Legend /></PieChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title={`${label}-wise Revenue Leakage`} subtitle="Payer deductions + shortfall" height="300px">
          <ResponsiveContainer><BarChart data={tlArr} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => fmt(v)} /><Bar dataKey="leak" radius={[0, 4, 4, 0]}>
            {tlArr.map((_, i) => <Cell key={i} fill={R_PAL[i % R_PAL.length]} />)}
          </Bar></BarChart></ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable title="Leakage Recovery by Payer" subtitle="Top opportunities for appeals and AR follow-up"
        headers={[label, 'Claims', 'Billed', 'Payer Deduction', 'Shortfall', 'Denied Value', 'Total Leakage', 'Leakage %']}
        rows={Object.entries(tpaLeak).map(([k, v]: [string, any]) => {
          const ded = Math.max(0, v.claimed - v.approved);
          const tl = ded + v.shortfall;
          const lp = pct(tl, v.claimed);
          return { k, v, ded, tl, lp };
        }).sort((a, b) => b.tl - a.tl).slice(0, 14).map(r => [
          shortP(r.k), r.v.cnt.toString(), fmt(r.v.claimed), fmt(r.ded), fmt(r.v.shortfall), fmt(r.v.denVal),
          <span className="font-semibold text-rcm-700">{fmt(r.tl)}</span>,
          <span style={{ color: r.lp > 40 ? '#9B1C1C' : r.lp > 25 ? '#854D0E' : '#15803D' }}>{fN(r.lp)}%</span>,
        ])}
      />
    </div>
  );
}
