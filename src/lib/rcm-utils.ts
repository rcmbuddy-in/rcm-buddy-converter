// ======= UTILITY FUNCTIONS =======

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr';
  if (a >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function fN(n: number | null | undefined, d: number = 1): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toFixed(d);
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
  const d = (b.getTime() - a.getTime()) / 86400000;
  return d >= 0 ? Math.round(d) : null;
}

export function tDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
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
