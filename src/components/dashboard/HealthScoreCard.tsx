import { HealthScore } from '@/lib/insights-engine';
import { fN } from '@/lib/rcm-utils';

const BAND_COLOR: Record<HealthScore['band'], string> = {
  Excellent: 'text-emerald-600',
  Healthy:   'text-emerald-600',
  Watch:     'text-amber-600',
  'At Risk': 'text-orange-600',
  Critical:  'text-red-600',
};

function arc(score: number) {
  const r = 52, c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return { c, off, r };
}

export function HealthScoreCard({ health }: { health: HealthScore }) {
  const { c, off, r } = arc(health.score);
  const stroke = health.score >= 72 ? '#059669' : health.score >= 58 ? '#D97706' : health.score >= 42 ? '#EA580C' : '#DC2626';
  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-card">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[13px] font-semibold text-foreground">RCM Health Score</div>
          <div className="text-[11px] text-muted-foreground">Composite of 5 weighted KPIs</div>
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase text-rcm-500">Executive</span>
      </div>
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r={r} stroke="hsl(var(--muted))" strokeWidth="10" fill="none" />
            <circle cx="65" cy="65" r={r} stroke={stroke} strokeWidth="10" fill="none"
              strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
              transform="rotate(-90 65 65)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-display text-3xl font-bold text-foreground">{health.score}</div>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${BAND_COLOR[health.band]}`}>{health.band}</div>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          {health.drivers.map(d => (
            <div key={d.label} className="flex items-center gap-2">
              <div className="text-[11px] text-muted-foreground w-24 flex-shrink-0">{d.label}</div>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-rcm-700" style={{ width: `${Math.min(100, d.value)}%` }} />
              </div>
              <div className="text-[11px] font-semibold text-foreground w-10 text-right">{fN(d.value, 0)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeakageBanner({ total, breakdown }: { total: number; breakdown: { label: string; value: number }[] }) {
  const fmt = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e7) return '₹' + (a / 1e7).toFixed(2) + 'Cr';
    if (a >= 1e5) return '₹' + (a / 1e5).toFixed(2) + 'L';
    return '₹' + Math.round(a).toLocaleString('en-IN');
  };
  const totalSafe = breakdown.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div className="bg-gradient-to-r from-rcm-50 to-card rounded-xl p-5 border border-border shadow-card mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-rcm-700 mb-1">Revenue Leakage Summary</div>
          <div className="font-display text-2xl font-bold text-foreground">{fmt(total)}</div>
          <div className="text-[11px] text-muted-foreground">Gross billed minus net collected</div>
        </div>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden mb-2">
        {breakdown.map((b, i) => (
          <div key={b.label} style={{ width: `${(b.value / totalSafe) * 100}%`, background: ['#DC2626', '#D97706', '#7C3AED', '#0891B2'][i % 4] }} />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {breakdown.map((b, i) => (
          <div key={b.label} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: ['#DC2626', '#D97706', '#7C3AED', '#0891B2'][i % 4] }} />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{b.label}</div>
              <div className="text-[12px] font-semibold text-foreground">{fmt(b.value)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}