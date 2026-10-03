import { useEffect, useState } from 'react';

export interface Manager { role: string; name: string; email: string; phone: string; }
export interface HospitalProfile {
  name: string; group: string; address: string; city: string; state: string;
  registration: string; gstin: string; beds: string; phone: string; email: string;
  logo: string; // data URL
  preparedBy: string;
  managers: Manager[];
}

const KEY = 'rcm-hospital-profile-v1';
const EVT = 'rcm-hospital-profile-change';

export const DEFAULT_MANAGERS: Manager[] = [
  { role: 'Chief Executive Officer (CEO)', name: '', email: '', phone: '' },
  { role: 'Chief Financial Officer (CFO)', name: '', email: '', phone: '' },
  { role: 'Head — Revenue Cycle / TPA Desk', name: '', email: '', phone: '' },
];

export const emptyProfile = (): HospitalProfile => ({
  name: '', group: '', address: '', city: '', state: '', registration: '', gstin: '', beds: '',
  phone: '', email: '', logo: '', preparedBy: '', managers: DEFAULT_MANAGERS.map(m => ({ ...m })),
});

export function loadProfile(): HospitalProfile {
  try { return { ...emptyProfile(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return emptyProfile(); }
}
export function saveProfile(p: HospitalProfile) {
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(EVT));
}

export function useHospitalProfile(): HospitalProfile {
  const [p, setP] = useState(loadProfile);
  useEffect(() => {
    const h = () => setP(loadProfile());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return p;
}

/** Name shown on reports: user-entered name wins over the name found in the file. */
export const displayName = (p: HospitalProfile, fallback: string) => p.name.trim() || fallback;
