import { ClaimRecord, GlobalData, computeGlobals, isDeniedClaim, isPendingClaim, arOutstanding, DENIED_STATUSES, VALID_CLOSED_STATUSES } from './rcm-data';
import { pct, avg, payerTat, fmt, fN } from './rcm-utils';

export type KpiKind = 'count' | 'money' | 'pct' | 'days';
export interface KpiDef {
  id: string; label: string; kind: KpiKind; higherIsBetter: boolean;
  target: number; benchmark: number;
  calc: (g: GlobalData) => number;
}

const nonCancelled = (g: GlobalData) => g.data.filter(x => x.status !== 'Cancelled').length;
const deniedCnt = (g: GlobalData) => g.data.filter(x => isDeniedClaim(x)).length;
const tat = (g: GlobalData) => avg(g.data.map(payerTat).filter((v): v is number => v !== null));

export const KPIS: KpiDef[] = [
  { id: 'claims', label: 'Total Claims', kind: 'count', higherIsBetter: true, target: 0, benchmark: 0, calc: g => g.n },
  { id: 'billed', label: 'Total Billed', kind: 'money', higherIsBetter: true, target: 0, benchmark: 0, calc: g => g.totalClaimed },
  { id: 'approved', label: 'Total Approved', kind: 'money', higherIsBetter: true, target: 0, benchmark: 0, calc: g => g.totalApproved },
  { id: 'collected', label: 'Total Collected', kind: 'money', higherIsBetter: true, target: 0, benchmark: 0, calc: g => g.totalSettled },
  { id: 'approvalRate', label: 'Claim Approval Rate', kind: 'pct', higherIsBetter: true, target: 80, benchmark: 75, calc: g => pct(g.totalApproved, g.totalClaimed) },
  { id: 'netColl', label: 'Net Collection Rate', kind: 'pct', higherIsBetter: true, target: 90, benchmark: 85, calc: g => { const c = g.data.filter((x: any) => x.status === 'Settled'); return pct(c.reduce((a: number, x: any) => a + x.settledAmt + x.tdsAmt + x.copay, 0), c.reduce((a: number, x: any) => a + x.approvedAmt, 0)); } },
  { id: 'tat', label: 'Payer TAT', kind: 'days', higherIsBetter: false, target: 30, benchmark: 45, calc: tat },
  { id: 'denialRate', label: 'Denial Rate', kind: 'pct', higherIsBetter: false, target: 8, benchmark: 10, calc: g => pct(deniedCnt(g), nonCancelled(g)) },
  { id: 'pendingAR', label: 'Pending AR', kind: 'money', higherIsBetter: false, target: 0, benchmark: 0, calc: g => g.pendingAR.val },
  { id: 'leakage', label: 'Revenue Leakage', kind: 'money', higherIsBetter: false, target: 0, benchmark: 0, calc: g => g.leakageData.total },
];

export function fmtKpi(kind: KpiKind, v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (kind === 'money') return fmt(v);
  if (kind === 'pct') return fN(v) + '%';
  if (kind === 'days') return fN(v) + ' d';
  return Math.round(v).toLocaleString('en-IN');
}

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export interface Periods { curStart: Date; curEnd: Date; prevStart: Date; prevEnd: Date; prev: ClaimRecord[]; }

/** Prior period = same number of days immediately before the current range (admission-date basis). */
export function priorPeriod(current: ClaimRecord[], all: ClaimRecord[], from?: Date, to?: Date, year?: string): Periods | null {
  let s: Date | undefined = from, e: Date | undefined = to;
  if (year && year !== 'all' && !s && !e) { s = new Date(+year, 0, 1); e = new Date(+year, 11, 31); }
  const adm = current.map(x => x.admission).filter(Boolean) as Date[];
  if (!adm.length) return null;
  if (!s) s = new Date(Math.min(...adm.map(day)));
  if (!e) e = new Date(Math.max(...adm.map(day)));
  const len = Math.round((day(e) - day(s)) / 86400000) + 1;
  const prevEnd = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 1);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - len + 1);
  const prev = all.filter(x => x.admission && day(x.admission) >= day(prevStart) && day(x.admission) <= day(prevEnd));
  return { curStart: s, curEnd: e, prevStart, prevEnd, prev };
}

export interface Driver { name: string; contribution: number; }

/** Largest payer-level contributors to the change in a KPI. For rates: share-weighted rate change. */
export function drivers(k: KpiDef, cur: ClaimRecord[], prev: ClaimRecord[], key: (x: ClaimRecord) => string): Driver[] {
  const groups = new Set([...cur.map(key), ...prev.map(key)]);
  const kc = k.calc(computeGlobals(cur)), kp = k.calc(computeGlobals(prev));
  const out: Driver[] = [];
  groups.forEach(gname => {
    const c = cur.filter(x => key(x) === gname), p = prev.filter(x => key(x) === gname);
    let contribution: number;
    if (k.kind === 'money' || k.kind === 'count') {
      contribution = (c.length ? k.calc(computeGlobals(c)) : 0) - (p.length ? k.calc(computeGlobals(p)) : 0);
    } else {
      // leave-one-out: how much the overall KPI change shrinks if this payer is excluded
      const cRest = cur.filter(x => key(x) !== gname), pRest = prev.filter(x => key(x) !== gname);
      const restDelta = (cRest.length ? k.calc(computeGlobals(cRest)) : kc) - (pRest.length ? k.calc(computeGlobals(pRest)) : kp);
      contribution = (kc - kp) - restDelta;
    }
    if (isFinite(contribution) && contribution !== 0) out.push({ name: gname, contribution });
  });
  return out.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 5);
}

// ---------- Targets (editable, saved in browser) ----------
const TKEY = 'rcm-kpi-targets-v1';
export type TargetMap = Record<string, { target: number; benchmark: number }>;
export function loadTargets(): TargetMap {
  const base: TargetMap = Object.fromEntries(KPIS.map(k => [k.id, { target: k.target, benchmark: k.benchmark }]));
  try { return { ...base, ...JSON.parse(localStorage.getItem(TKEY) || '{}') }; } catch { return base; }
}
export function saveTargets(t: TargetMap) { localStorage.setItem(TKEY, JSON.stringify(t)); }

// ---------- Formula audit trail ----------
export interface AuditEntry { id: string; definition: string; formula: string; dateBasis: string; included: string; exclusions: string; sample: (x: ClaimRecord) => string | null; }

const ALL_BUT_NONE = 'All statuses in the loaded data';
export const AUDIT: AuditEntry[] = [
  { id: 'claims', definition: 'Number of claim rows in the selected period.', formula: 'COUNT(claims)', dateBasis: 'Date of Admission', included: ALL_BUT_NONE, exclusions: 'Rows removed by the Data Quality check (unless bypassed)', sample: () => 'Counts as 1 claim' },
  { id: 'billed', definition: 'Gross amount claimed from payers.', formula: 'SUM(Claimed Amount)', dateBasis: 'Date of Admission', included: ALL_BUT_NONE, exclusions: 'Quarantined rows', sample: x => `Adds ${fmt(x.claimedAmt)}` },
  { id: 'approved', definition: 'Amount approved by payers.', formula: 'SUM(Approved Amount)', dateBasis: 'Date of Admission', included: ALL_BUT_NONE, exclusions: 'Quarantined rows', sample: x => `Adds ${fmt(x.approvedAmt)}` },
  { id: 'collected', definition: 'Net amount settled by payers.', formula: 'SUM(Settled Amount)', dateBasis: 'Date of Admission', included: ALL_BUT_NONE, exclusions: 'Quarantined rows', sample: x => `Adds ${fmt(x.settledAmt)}` },
  { id: 'approvalRate', definition: 'Share of billed value that payers approved.', formula: 'SUM(Approved) ÷ SUM(Claimed) × 100', dateBasis: 'Date of Admission', included: ALL_BUT_NONE, exclusions: 'Quarantined rows', sample: x => x.claimedAmt ? `${fmt(x.approvedAmt)} ÷ ${fmt(x.claimedAmt)} = ${fN(pct(x.approvedAmt, x.claimedAmt))}%` : null },
  { id: 'netColl', definition: 'Share of approved value actually realised on closed (Settled) claims.', formula: 'SUM(Settled + TDS + Copay) ÷ SUM(Approved) × 100, Settled claims only', dateBasis: 'Date of Admission', included: 'Settled', exclusions: 'Open, denied and cancelled claims (open balances are shown as Pending AR)', sample: x => x.status === 'Settled' && x.approvedAmt ? `(${fmt(x.settledAmt)} + ${fmt(x.tdsAmt)} + ${fmt(x.copay)}) ÷ ${fmt(x.approvedAmt)} = ${fN(pct(x.settledAmt + x.tdsAmt + x.copay, x.approvedAmt))}%` : null },
  { id: 'tat', definition: 'Average days payers take to pay after documents are submitted.', formula: 'AVG(Payment Date − Document Submission Date); falls back to Discharge Date', dateBasis: 'Document Submission → Payment Update Date', included: 'Claims with a payment date', exclusions: 'Claims with no payment date, negative gaps, or gaps of 365+ days', sample: x => { const t = payerTat(x); return t === null ? null : `${t} days`; } },
  { id: 'denialRate', definition: 'Share of non-cancelled claims that were denied.', formula: 'COUNT(denied) ÷ COUNT(status ≠ Cancelled) × 100', dateBasis: 'Date of Admission', included: 'Denied: ' + DENIED_STATUSES.join(', ') + '; plus any non-cancelled claim with zero approved amount (except open claims ≤30 days old still awaiting payer decision)', exclusions: 'Cancelled claims are removed from both sides', sample: x => x.status === 'Cancelled' ? null : (isDeniedClaim(x) ? 'Counts as denied (1 ÷ 1)' : 'Counts as not denied (0 ÷ 1)') },
  { id: 'pendingAR', definition: 'Approved amount still to be collected on open claims.', formula: 'SUM(Approved − Settled − TDS − Copay) where the claim is open and approved > 0', dateBasis: 'Aged from Document Submission → Discharge → Admission', included: 'Any status not in: ' + [...VALID_CLOSED_STATUSES, ...DENIED_STATUSES, 'Cancelled'].join(', ') + ', with an approved amount above zero', exclusions: 'Settled/valid, denied, cancelled, and zero-approval claims (counted as denials)', sample: x => isPendingClaim(x) ? `Adds ${fmt(arOutstanding(x))}` : null },
  { id: 'leakage', definition: 'Money lost, split into separate buckets so no rupee is counted twice.', formula: 'Denied value + Payer deduction (Claimed − Approved − Shortfall) + Shortfall + Short-settlement (Approved − Settled − Copay − TDS, settled only)', dateBasis: 'Date of Admission', included: 'All non-cancelled claims', exclusions: 'Cancelled; open claims are counted as AR, not short-settlement', sample: x => {
    if (x.status === 'Cancelled') return null;
    if (isDeniedClaim(x)) return `Denied: ${fmt(x.claimedAmt)}`;
    const sf = Math.max(0, x.shortfall), ded = Math.max(0, x.claimedAmt - x.approvedAmt - sf);
    const gap = x.status === 'Settled' ? Math.max(0, x.approvedAmt - x.settledAmt - x.copay - x.tdsAmt) : 0;
    return `Deduction ${fmt(ded)} + Shortfall ${fmt(sf)} + Short-settle ${fmt(gap)} = ${fmt(ded + sf + gap)}`;
  } },
];
