interface ChartCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  full?: boolean;
  height?: string;
}

export function ChartCard({ title, subtitle, children, full, height = '220px' }: ChartCardProps) {
  return (
    <div className={`bg-card rounded-xl p-5 border border-border shadow-card ${full ? 'col-span-full' : ''}`}>
      <div className="text-[13px] font-semibold text-foreground mb-0.5">{title}</div>
      <div className="text-[11px] text-muted-foreground mb-3">{subtitle}</div>
      <div style={{ height, width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

export function ChartGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-6">
      {children}
    </div>
  );
}
