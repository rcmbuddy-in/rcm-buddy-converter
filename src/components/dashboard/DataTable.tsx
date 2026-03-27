interface DataTableProps {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | React.ReactNode)[][];
}

export function DataTable({ title, subtitle, headers, rows }: DataTableProps) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="topbar-gradient">
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-2.5 text-left text-primary-foreground font-semibold text-[11px] tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-rcm-50 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 text-foreground">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
