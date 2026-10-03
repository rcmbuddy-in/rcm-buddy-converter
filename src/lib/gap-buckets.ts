import { ClaimRecord, isDeniedClaim, isPendingClaim, arOutstanding } from './rcm-data';

export type GapBucketId = 'openAR' | 'tds' | 'patient' | 'shortSettle' | 'appeal' | 'timeBarred' | 'discount' | 'deduction' | 'cancelled';

export interface GapBucketDef {
  id: GapBucketId;
  label: string;
  kind: 'recoverable' | 'written-off';
  owner: string;
  action: string;
  rule: string;
}

export const APPEAL_WINDOW_DAYS = 90;

export const GAP_BUCKETS: GapBucketDef[] = [
  { id: 'openAR', label: 'Open AR with payer', kind: 'recoverable', owner: 'TPA Follow-up Desk', action: 'Chase payer for payment; escalate claims over 45 days', rule: 'Open, approved claims: Approved − Settled − TDS' },
  { id: 'shortSettle', label: 'Short-settlement dispute', kind: 'recoverable', owner: 'Reconciliation Team', action: 'Raise dispute with payer using settlement letter', rule: 'Settled claims: Approved − Settled − TDS (if > 0)' },
  { id: 'appeal', label: `Denials within ${APPEAL_WINDOW_DAYS} days`, kind: 'recoverable', owner: 'Denial Management', action: 'File reconsideration / appeal with documents', rule: `Denied or zero-approved claims, ≤ ${APPEAL_WINDOW_DAYS} days since submission/discharge` },
  { id: 'patient', label: 'Patient share (copay + shortfall)', kind: 'recoverable', owner: 'Billing Counter', action: 'Collect from patient before or at discharge', rule: 'Copay + Shortfall on non-denied claims' },
  { id: 'tds', label: 'TDS credit', kind: 'recoverable', owner: 'Finance & Accounts', action: 'Match against Form 26AS / 16A and claim credit', rule: 'TDS on non-denied claims' },
  { id: 'deduction', label: 'Payer deductions (disallowed)', kind: 'written-off', owner: 'Coding & Documentation', action: 'Stop at source: fix tariff, coding and documentation gaps', rule: 'Remaining gap after all recoverable parts and discount' },
  { id: 'timeBarred', label: `Denials older than ${APPEAL_WINDOW_DAYS} days`, kind: 'written-off', owner: 'RCM Head', action: 'Review root cause; write off after sign-off', rule: `Denied or zero-approved claims, > ${APPEAL_WINDOW_DAYS} days old` },
  { id: 'discount', label: 'Hospital discount', kind: 'written-off', owner: 'Management', action: 'Approve / cap discounts by policy', rule: 'Discount given on non-denied claims' },
  { id: 'cancelled', label: 'Cancelled claims', kind: 'written-off', owner: 'Admissions / TPA Desk', action: 'Check if any should be re-filed', rule: 'Billed value of Cancelled claims' },
];

const DAY = 86400000;
const ageDays = (x: ClaimRecord, now: Date) => {
  const a = x.docSubmit || x.discharge || x.admission;
  return a ? Math.floor((now.getTime() - a.getTime()) / DAY) : Infinity;
};

/** Split each claim's (Billed − Settled) into exactly one set of buckets. Parts are capped so a claim never allocates more than its gap. */
export function allocateGap(x: ClaimRecord, now = new Date()): Partial<Record<GapBucketId, number>> {
  const out: Partial<Record<GapBucketId, number>> = {};
  let rem = Math.max(0, x.claimedAmt - x.settledAmt);
  if (rem <= 0) return out;
  const take = (id: GapBucketId, v: number) => { const t = Math.min(rem, Math.max(0, v)); if (t > 0) { out[id] = (out[id] || 0) + t; rem -= t; } };
  if (x.status === 'Cancelled') { take('cancelled', rem); return out; }
  if (isDeniedClaim(x)) { take(ageDays(x, now) <= APPEAL_WINDOW_DAYS ? 'appeal' : 'timeBarred', rem); return out; }
  if (isPendingClaim(x)) take('openAR', arOutstanding(x));
  if (x.status === 'Settled') take('shortSettle', x.approvedAmt - x.settledAmt - x.tdsAmt);
  take('patient', x.copay + Math.max(0, x.shortfall));
  take('tds', x.tdsAmt);
  take('discount', x.discount);
  take('deduction', rem);
  return out;
}

export interface GapSummary {
  rows: (GapBucketDef & { value: number; claims: number })[];
  recoverable: number;
  writtenOff: number;
  total: number;
  headlineGap: number;
  overpaidRows: number;
  overpaidValue: number;
}

export function computeGapBuckets(data: ClaimRecord[], now = new Date()): GapSummary {
  const val: Record<string, number> = {}, cnt: Record<string, number> = {};
  let overpaidRows = 0, overpaidValue = 0, headlineGap = 0;
  data.forEach(x => {
    const g = x.claimedAmt - x.settledAmt;
    headlineGap += g;
    if (g < 0) { overpaidRows++; overpaidValue += -g; }
    Object.entries(allocateGap(x, now)).forEach(([k, v]) => { val[k] = (val[k] || 0) + (v || 0); cnt[k] = (cnt[k] || 0) + 1; });
  });
  const rows = GAP_BUCKETS.map(b => ({ ...b, value: val[b.id] || 0, claims: cnt[b.id] || 0 }));
  const recoverable = rows.filter(r => r.kind === 'recoverable').reduce((a, r) => a + r.value, 0);
  const writtenOff = rows.filter(r => r.kind === 'written-off').reduce((a, r) => a + r.value, 0);
  return { rows, recoverable, writtenOff, total: recoverable + writtenOff, headlineGap, overpaidRows, overpaidValue };
}
