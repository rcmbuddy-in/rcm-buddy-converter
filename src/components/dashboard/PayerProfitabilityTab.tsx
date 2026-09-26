import { isDeniedStatus } from '@/lib/rcm-data';
import { useState, useMemo } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { MetricCard, MetricGrid } from './MetricCard';
import { ChartCard, ChartGrid } from './ChartCard';
import { DataTable } from './DataTable';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, avg, ddiff, sm, scoreColor , payerTat } from '@/lib/rcm-utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';

/**
 * Payer Profitability Scorecard
 * Net Margin % per payer = (Settled - DenialCost - TATCarryingCost - Deductions) / Claimed
 * - DeductionCost = Claimed - Approved (gross payer deduction)
 * - DenialCost    = denied claim value (sum of claimed for denied)
 * - TATCarryingCost = (avgTAT/365) * costOfCapital * settledAmt
 */
const COST_OF_CAPITAL = 0.10; // 10% per annum default

export function PayerProfitabilityTab() {
  const { globalData, getGroupKey, groupBy } = useDashboard();
  const [coc, setCoc] = useState(COST_OF_CAPITAL);
  const d = globalData?.data ?? [];

  const groups = useMemo(() => {
    const m: Record<string, {
      cnt: number; claimed: number; approved: number; settled: number;
      denied: number; denVal: number; tats: number[];
    }> = {};
    d.forEach(x => {
      const k = getGroupKey(x) || 'Unknown';
      if (!m[k]) m[k] = { cnt: 0, claimed: 0, approved: 0, settled: 0, denied: 0, denVal: 0, tats: [] };
      const g = m[k];
      g.cnt++; g.claimed += x.claimedAmt; g.approved += x.approvedAmt; g.settled += x.settledAmt;
      if (isDeniedStatus(x.status)) {
        g.denied++; g.denVal += x.claimedAmt;
      }
      const t = payerTat(x);
      if (t !== null && t < 365) g.tats.push(t);
    });
    return Object.entries(m)
      .filter(([, v]) => v.cnt >= 10)
      .map(([k, v]) => {
        const deductionCost = Math.max(0, v.claimed - v.approved - v.denVal);
        const denialCost = v.denVal;
        const avgTAT = avg(v.tats);
        const tatCarryCost = (avgTAT / 365) * coc * v.settled;
        const netMarginAbs = v.settled - tatCarryCost; // approximate net cash retained
        const netMarginPct = pct(v.settled - tatCarryCost, v.claimed);
        const collectionEfficiency = pct(v.settled, v.claimed);
        return {
          k, ...v, deductionCost, denialCost, avgTAT, tatCarryCost,
          netMarginAbs, netMarginPct, collectionEfficiency,
        };
      })
      .sort((a, b) => b.claimed - a.claimed);
  }, [d, getGroupKey, coc]);

  if (!globalData) return null;

  const totalClaimed = sm(groups.map(g => g.claimed));
  const totalSettled = sm(groups.map(g => g.settled));
  const totalDeduction = sm(groups.map(g => g.deductionCost));
  const totalDenial = sm(groups.map(g => g.denialCost));
  const totalTatCost = sm(groups.map(g => g.tatCarryCost));
  const overallMargin = pct(totalSettled - totalTatCost, totalClaimed);

  const top = [...groups].sort((a, b) => b.netMarginPct - a.netMarginPct).slice(0, 8);
  const bottom = [...groups].sort((a, b) => a.netMarginPct - b.netMarginPct).slice(0, 8);

  const scatterData = groups.map(g => ({
    name: g.k, x: g.avgTAT, y: g.netMarginPct, z: g.claimed,
  }));

  const label = groupBy === 'insurer' ? 'Insurer' : 'TPA';

  return (
    <div className="animate-fadeIn">
      <SectionHeading title="Payer Profitability Scorecard" tag="Net Margin · TAT Cost · Denial Cost" />

      <div className="bg-card border border-border rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Cost of Capital (annual)</span>
        <input
          type="range" min={0} max={0.25} step={0.01}
          value={coc} onChange={e => setCoc(parseFloat(e.target.value))}
          className="w-40 accent-rcm-600"
        />
        <span className="text-sm font-bold text-rcm-700">{fN(coc * 100)}%</span>
        <span className="text-[10px] text-muted-foreground">Used to compute TAT carrying cost on settled amount</span>
      </div>

      <MetricGrid>
        <MetricCard label="Net Margin (Overall)" value={fN(overallMargin) + '%'} subtitle="After deductions, denial & TAT cost" highlighted />
        <MetricCard label="Total Deduction Cost" value={fmt(totalDeduction)} subtitle={fN(pct(totalDeduction, totalClaimed)) + '% of claimed'} />
        <MetricCard label="Total Denial Cost" value={fmt(totalDenial)} subtitle={fN(pct(totalDenial, totalClaimed)) + '% of claimed'} />
        <MetricCard label="TAT Carrying Cost" value={fmt(totalTatCost)} subtitle={'@ ' + fN(coc * 100) + '% cost of capital'} />
      </MetricGrid>

      <ChartGrid>
        <ChartCard title="Top Profitable Payers" subtitle="Net margin % after all costs" height="320px">
          <ResponsiveContainer>
            <BarChart data={top.map(g => ({ name: g.k.substring(0, 22), value: g.netMarginPct }))} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(0) + '%'} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => fN(v) + '%'} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {top.map((_, i) => <Cell key={i} fill="#15803D" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Lowest Margin Payers" subtitle="Renegotiation / exit candidates" height="320px">
          <ResponsiveContainer>
            <BarChart data={bottom.map(g => ({ name: g.k.substring(0, 22), value: g.netMarginPct }))} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(0) + '%'} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => fN(v) + '%'} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {bottom.map((_, i) => <Cell key={i} fill="#DC2626" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="TAT vs Margin" subtitle="Bubble size = claim volume" height="320px">
          <ResponsiveContainer>
            <ScatterChart>
              <XAxis type="number" dataKey="x" name="Avg TAT (days)" tick={{ fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name="Net Margin %" tickFormatter={v => v.toFixed(0) + '%'} tick={{ fontSize: 11 }} />
              <ZAxis type="number" dataKey="z" range={[40, 600]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(v: any, key: any) => key === 'y' ? fN(v) + '%' : key === 'x' ? fN(v) + 'd' : fmt(v)}
                labelFormatter={(_, p: any) => p?.[0]?.payload?.name || ''}
              />
              <Scatter data={scatterData} fill="hsl(var(--rcm-600))" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <DataTable
        title="Full Payer Scorecard"
        subtitle="Ranked by claimed volume · margin reflects all real costs"
        headers={[label, 'Claims', 'Claimed', 'Settled', 'Deduction', 'Denial', 'TAT Cost', 'Avg TAT', 'Net Margin %']}
        rows={groups.map(g => [
          g.k,
          g.cnt.toString(),
          fmt(g.claimed),
          fmt(g.settled),
          fmt(g.deductionCost),
          fmt(g.denialCost),
          fmt(g.tatCarryCost),
          fN(g.avgTAT) + 'd',
          <span className="font-bold" style={{ color: scoreColor(g.netMarginPct) }}>{fN(g.netMarginPct)}%</span>,
        ])}
      />
    </div>
  );
}