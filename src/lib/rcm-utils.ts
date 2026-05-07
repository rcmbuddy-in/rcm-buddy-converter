// ======= UTILITY FUNCTIONS =======

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 10000000) {
    const crVal = a / 10000000;
    // For values >= 1000 Cr, show as "X,XXX.XX Cr"
    if (crVal >= 1000) return sign + '₹' + crVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'Cr';
    // For values >= 100 Cr, show 1 decimal
    if (crVal >= 100) return sign + '₹' + crVal.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'Cr';
    return sign + '₹' + crVal.toFixed(2) + 'Cr';
  }
  if (a >= 100000) {
    const lVal = a / 100000;
    return sign + '₹' + lVal.toFixed(2) + 'L';
  }
  if (a >= 1000) return sign + '₹' + Math.round(a).toLocaleString('en-IN');
  return sign + '₹' + Math.round(a).toString();
}

export function fN(n: number | null | undefined, d: number = 1): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const val = Number(n);
  // Avoid showing things like "0.0" when value is truly 0
  return val.toFixed(d);
}

export function pct(a: number, b: number): number {
  return b ? (a / b) * 100 : 0;
}

export function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function sm(arr: number[]): number {
  return arr.reduce((a, b) => a + (b || 0), 0);
}

export function ddiff(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  // Normalize to date-only (strip time) to avoid timezone issues
  const aDay = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bDay = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  const d = (bDay - aDay) / 86400000;
  return d >= 0 ? Math.round(d) : null;
}

export function tDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  // Handle string dates
  if (typeof v === 'string') {
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmy) {
      let [, dd, mm, yy] = dmy;
      let year = parseInt(yy);
      if (year < 100) year += 2000;
      const month = parseInt(mm);
      const day = parseInt(dd);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return new Date(year, month - 1, day);
    }
    // ISO YYYY-MM-DD
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    }
  }
  // Number (Excel serial date)
  if (typeof v === 'number' && v > 10000 && v < 100000) {
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + v);
    return epoch;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function shortP(s: string): string {
  return s
    .replace('Insurance TPA', 'TPA')
    .replace('Insurance', 'Ins.')
    .replace(' Private Limited', '')
    .replace(' Pvt Ltd', '')
    .replace(' Limited', '')
    .replace('Health Insurance', 'HI')
    .replace(' Co. Ltd.', '')
    .replace(' Co. Ltd', '')
    .replace(' General Insurance', '')
    .replace('The ', '')
    .trim()
    .substring(0, 24);
}

export function median(arr: number[]): number {
  const s = arr.filter(v => v != null).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Color palettes
export const R_PAL = ['#9B1C1C', '#B91C1C', '#DC2626', '#EF4444', '#F87171', '#FCA5A5', '#FECACA', '#E5E7EB'];
export const MIX_PAL = ['#DC2626', '#1D4ED8', '#059669', '#D97706', '#7C3AED', '#0891B2', '#BE185D', '#65A30D', '#9D174D', '#1E40AF', '#047857', '#B45309'];

// Consistent claim-status colors across the dashboard
// Settled = green, denied/cancelled = red, pre-auth = amber, processing/approved = blue, other = gray
export const STATUS_COLORS: Record<string, string> = {
  'Settled': '#059669',
  'Settlement Initiated': '#10B981',
  'Enhancement Approved': '#15803D',
  'Claim Approved': '#0EA5E9',
  'Discharge Approved': '#0284C7',
  'Processing': '#1D4ED8',
  'Claim in Progress': '#1E40AF',
  'Pre Auth Initiated': '#D97706',
  'Pre Auth Submitted to Payer': '#B45309',
  'Pre Auth Approved': '#F59E0B',
  'Pre Auth Query': '#F97316',
  'Pre Auth Query Replied': '#FB923C',
  'Pre Auth Denied': '#DC2626',
  'Discharge Denied': '#B91C1C',
  'Claim Denied': '#9B1C1C',
  'Reconsideration Submitted': '#7C3AED',
  'Enhancement Denied': '#BE185D',
  'Cancelled': '#6B7280',
};

// Group statuses to a high-level category with a stable color
export const STATUS_CATEGORY_COLORS: Record<string, string> = {
  'Settled': '#059669',
  'Approved': '#0EA5E9',
  'Processing': '#1D4ED8',
  'Pre-Auth Stage': '#D97706',
  'Denied/Cancelled': '#DC2626',
  'Other': '#6B7280',
};

export function categorizeStatus(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('settled') || s.includes('settlement')) return 'Settled';
  if (s.includes('denied') || status === 'Cancelled' || s.includes('reconsideration')) return 'Denied/Cancelled';
  if (s.includes('pre auth')) return 'Pre-Auth Stage';
  if (s.includes('processing') || s.includes('progress')) return 'Processing';
  if (s.includes('approved')) return 'Approved';
  return 'Other';
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] || STATUS_CATEGORY_COLORS[categorizeStatus(status)] || '#6B7280';
}

// Badge helpers
export type BadgeType = 'good' | 'warning' | 'critical' | 'info';

export function getBadgeType(value: number, goodThresh: number, badThresh: number, higherIsBetter = true): BadgeType {
  if (higherIsBetter) {
    if (value >= goodThresh) return 'good';
    if (value >= badThresh) return 'warning';
    return 'critical';
  } else {
    if (value <= goodThresh) return 'good';
    if (value <= badThresh) return 'warning';
    return 'critical';
  }
}

export function score(val: number, goodThresh: number, badThresh: number, higherIsBetter = true): number {
  if (!higherIsBetter) {
    if (val <= goodThresh) return 90;
    if (val <= badThresh) return 60;
    return 30;
  }
  if (val >= goodThresh) return 90;
  if (val >= badThresh) return 60;
  return 30;
}

export function scoreColor(n: number): string {
  return n >= 75 ? '#15803D' : n >= 55 ? '#854D0E' : '#DC2626';
}
