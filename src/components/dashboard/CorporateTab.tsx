import { useState, useMemo } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { useChartPrefs } from '@/contexts/ChartPrefsContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, sm, avg, ddiff, shortP, R_PAL, MIX_PAL, getBadgeType , payerTat } from '@/lib/rcm-utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line, CartesianGrid
} from 'recharts';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export function CorporateTab() {
  const { globalData } = useDashboard();
  const { chartType } = useChartPrefs();
  const [selectedInsurer, setSelectedInsurer] = useState('all');

  // Filter: corporate = policyHolder is non-blank
  const allCorpData = useMemo(() => {
    if (!globalData) return [];
    return globalData.allData.filter(x => x.policyHolder.trim().length > 0);
  }, [globalData]);

  // Unique insurers for filter
  const insurers = useMemo(() => {
    const set = new Set<string>();
    allCorpData.forEach(x => { if (x.insurer && x.insurer !== 'Unknown') set.add(x.insurer); });
    return Array.from(set).sort();
  }, [allCorpData]);

  // Apply insurer filter
  const corpData = useMemo(() => {
    if (selectedInsurer === 'all') return allCorpData;
    return allCorpData.filter(x => x.insurer === selectedInsurer);
  }, [allCorpData, selectedInsurer]);

  if (!globalData) return null;

  if (allCorpData.length === 0) {
    return (
      <div className="animate-fadeIn">
        <SectionHeading title="Corporate Module" tag="Group / Corporate Policies" />
        <p className="text-muted-foreground text-sm mt-4">No corporate policy claims found. Policy Holder Name column appears to be blank for all records.</p>
      </div>
    );
  }

  const n = corpData.length;
  const totalClaimed = sm(corpData.map(x => x.claimedAmt));
  const totalApproved = sm(corpData.map(x => x.approvedAmt));
  const totalSettled = sm(corpData.map(x => x.settledAmt));
  const denied = corpData.filter(x => x.status.toLowerCase().includes('denied') || x.status === 'Cancelled');
  const tatVals = corpData.map(x => payerTat(x)).filter((v): v is number => v !== null);

  const approvalRate = pct(totalApproved, totalClaimed);
  const collRate = pct(totalSettled, totalApproved);
  const denialRate = pct(denied.length, n);
  const avgTAT = avg(tatVals);
  const avgClaim = n > 0 ? totalClaimed / n : 0;
  const corpShare = pct(n, globalData.allData.length);

  // Group by Policy Holder Name (corporate name)
  const corpMap: Record<string, { cnt: number; claimed: number; approved: number; settled: number; denied: number; tatVals: number[]; insurer: string }> = {};
  corpData.forEach(x => {
    const k = x.policyHolder;
    if (!corpMap[k]) corpMap[k] = { cnt: 0, claimed: 0, approved: 0, settled: 0, denied: 0, tatVals: [], insurer: x.insurer };
    const p = corpMap[k];
    p.cnt++; p.claimed += x.claimedAmt; p.approved += x.approvedAmt; p.settled += x.settledAmt;
    if (x.status.toLowerCase().includes('denied') || x.status === 'Cancelled') p.denied++;
    const tat = payerTat(x);
    if (tat !== null && tat < 365) p.tatVals.push(tat);
  });

  const corpArr = Object.entries(corpMap).sort((a, b) => b[1].claimed - a[1].claimed);

  // Top corporates chart
  const topCorps = corpArr.slice(0, 10).map(([k, v]) => ({ name: k.length > 25 ? k.slice(0, 22) + '...' : k, value: v.cnt, claimed: v.claimed }));

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

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <SectionHeading title="Corporate Module" tag="By Policy Holder Name" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Insurer:</span>
          <Select value={selectedInsurer} onValueChange={setSelectedInsurer}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue placeholder="All Insurers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Insurers</SelectItem>
              {insurers.map(ins => (
                <SelectItem key={ins} value={ins}>{ins}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
        <ChartCard title="Top Corporates by Volume" subtitle="By Policy Holder Name" height="320px">
          <ResponsiveContainer>
            <BarChart data={topCorps} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="value" name="Claims" radius={[0, 4, 4, 0]}>
                {topCorps.map((_, i) => <Cell key={i} fill={R_PAL[i % R_PAL.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Corporate Monthly Trend" subtitle="Claims volume and revenue" height="320px">
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

      {corpArr.length > 0 && (
        <DataTable
          title="Top Corporate Scorecard"
          subtitle="Performance by Policy Holder Name"
          headers={['Corporate Name', 'Insurer', 'Claims', 'Billed', 'Approval %', 'Collection %', 'Denial %', 'Avg TAT']}
          rows={corpArr.slice(0, 20).map(([k, v]) => {
            const aR = pct(v.approved, v.claimed);
            const cR = pct(v.settled, v.approved);
            const dR = pct(v.denied, v.cnt);
            const t = avg(v.tatVals);
            return [
              k,
              v.insurer,
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
