import { useDashboard } from '@/contexts/DashboardContext';
import { useHospitalProfile, displayName } from '@/lib/hospital-profile';

/** Hospital + management block shown on the dashboard and at the top of every exported report section. */
export function ReportHeader({ compact = false }: { compact?: boolean }) {
  const { globalData } = useDashboard();
  const p = useHospitalProfile();
  if (!globalData) return null;
  const managers = p.managers.filter(m => m.name.trim());
  const addr = [p.address, p.city, p.state].filter(Boolean).join(', ');
  const meta = [p.beds && `${p.beds} beds`, p.registration && `Reg. ${p.registration}`, p.gstin && `GSTIN ${p.gstin}`, p.phone, p.email].filter(Boolean).join(' · ');

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-5 flex flex-wrap gap-4 items-start justify-between">
      <div className="flex gap-3 items-start">
        {p.logo && <img src={p.logo} alt="Hospital logo" className="w-14 h-14 object-contain rounded-md" />}
        <div>
          <div className="font-display text-xl font-bold text-foreground">{displayName(p, globalData.hospitalName)}</div>
          {p.group && <div className="text-sm text-muted-foreground">{p.group}</div>}
          {addr && <div className="text-xs text-muted-foreground">{addr}</div>}
          {meta && <div className="text-[11px] text-muted-foreground mt-0.5">{meta}</div>}
          <div className="text-[11px] text-muted-foreground mt-1">
            Period: <span className="font-semibold text-foreground">{globalData.dateRange || '—'}</span> · {globalData.n.toLocaleString('en-IN')} claims
            {p.preparedBy && <> · Prepared by <span className="font-semibold text-foreground">{p.preparedBy}</span></>}
            {' '}· Generated {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>
      {!compact && managers.length > 0 && (
        <div className="grid gap-x-6 gap-y-1 text-xs" style={{ gridTemplateColumns: `repeat(${Math.min(managers.length, 3)}, minmax(0, auto))` }}>
          {managers.map((m, i) => (
            <div key={i}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{m.role || 'Management'}</div>
              <div className="font-semibold text-foreground">{m.name}</div>
              {(m.email || m.phone) && <div className="text-muted-foreground">{[m.email, m.phone].filter(Boolean).join(' · ')}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
