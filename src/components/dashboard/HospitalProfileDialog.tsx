import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HospitalProfile, loadProfile, saveProfile, emptyProfile } from '@/lib/hospital-profile';

const inp = 'w-full px-2.5 py-1.5 border border-border rounded-md text-sm bg-background outline-none focus:border-primary';

export function HospitalProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [p, setP] = useState<HospitalProfile>(loadProfile);
  const set = (k: keyof HospitalProfile, v: string) => setP(s => ({ ...s, [k]: v }));
  const setM = (i: number, k: 'role' | 'name' | 'email' | 'phone', v: string) =>
    setP(s => ({ ...s, managers: s.managers.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));

  const onLogo = (f?: File) => {
    if (!f) return;
    if (f.size > 500_000) { alert('Please use a logo under 500 KB.'); return; }
    const r = new FileReader();
    r.onload = () => set('logo', String(r.result));
    r.readAsDataURL(f);
  };

  const field = (k: keyof HospitalProfile, label: string, ph = '') => (
    <label className="text-xs font-semibold text-muted-foreground space-y-1">
      <span>{label}</span>
      <input className={inp} value={p[k] as string} placeholder={ph} onChange={e => set(k, e.target.value)} />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (o) setP(loadProfile()); else onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Hospital & Management Details</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Shown on the dashboard and at the top of every PDF / printed report. Saved only in this browser.</p>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden">
            {p.logo ? <img src={p.logo} alt="Hospital logo" className="w-full h-full object-contain" /> : <span className="text-[10px] text-muted-foreground">Logo</span>}
          </div>
          <div className="space-x-2">
            <label className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border cursor-pointer hover:bg-muted">
              Upload logo<input type="file" accept="image/*" className="hidden" onChange={e => onLogo(e.target.files?.[0])} />
            </label>
            {p.logo && <button className="text-xs text-destructive" onClick={() => set('logo', '')}>Remove</button>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('name', 'Hospital name', 'e.g. City Care Hospital')}
          {field('group', 'Group / Unit', 'e.g. City Care Group — Banjara Hills')}
          {field('address', 'Address')}
          {field('city', 'City')}
          {field('state', 'State')}
          {field('beds', 'Bed count')}
          {field('registration', 'Registration / NABH no.')}
          {field('gstin', 'GSTIN')}
          {field('phone', 'Phone')}
          {field('email', 'Email')}
          {field('preparedBy', 'Report prepared by', 'Name & designation')}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-foreground">Management team</h4>
            <button className="text-xs font-semibold text-primary" onClick={() => setP(s => ({ ...s, managers: [...s.managers, { role: '', name: '', email: '', phone: '' }] }))}>+ Add person</button>
          </div>
          <div className="space-y-2">
            {p.managers.map((m, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr_0.8fr_auto] gap-2 items-center">
                <input className={inp} placeholder="Designation" value={m.role} onChange={e => setM(i, 'role', e.target.value)} />
                <input className={inp} placeholder="Name" value={m.name} onChange={e => setM(i, 'name', e.target.value)} />
                <input className={inp} placeholder="Email" value={m.email} onChange={e => setM(i, 'email', e.target.value)} />
                <input className={inp} placeholder="Phone" value={m.phone} onChange={e => setM(i, 'phone', e.target.value)} />
                <button className="text-xs text-destructive" onClick={() => setP(s => ({ ...s, managers: s.managers.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setP(emptyProfile())}>Clear all</button>
          <div className="flex gap-2">
            <button className="text-sm px-4 py-2 rounded-lg border border-border" onClick={onClose}>Cancel</button>
            <button className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold" onClick={() => { saveProfile(p); onClose(); }}>Save details</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
