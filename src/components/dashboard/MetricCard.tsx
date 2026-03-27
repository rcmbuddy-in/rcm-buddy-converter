import { BadgeType } from '@/lib/rcm-utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle: string;
  badge?: { type: BadgeType; text: string };
  weight?: string;
  highlighted?: boolean;
}

export function MetricCard({ label, value, subtitle, badge, weight, highlighted }: MetricCardProps) {
  if (highlighted) {
    return (
      <div className="hero-gradient rounded-xl p-5 text-primary-foreground shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5">
        {weight && <div className="absolute top-2.5 right-3 text-[9px] font-bold tracking-wider uppercase opacity-50">{weight}</div>}
        <div className="text-[10px] font-bold tracking-wider uppercase opacity-60 mb-1">{label}</div>
        <div className="font-display text-2xl font-bold leading-tight">{value}</div>
        <div className="text-[11px] opacity-50 mt-1">{subtitle}</div>
      </div>
    );
  }

  return (
    <div className="metric-accent relative bg-card rounded-xl p-5 border border-border shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 overflow-hidden">
      {weight && <div className="absolute top-2.5 right-3 text-[9px] font-bold tracking-wider uppercase text-rcm-400">{weight}</div>}
      <div className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-1">{label}</div>
      <div className="font-display text-2xl font-bold text-foreground leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{subtitle}</div>
      {badge && (
        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1.5 badge-${badge.type}`}>
          {badge.text}
        </span>
      )}
    </div>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
      {children}
    </div>
  );
}
