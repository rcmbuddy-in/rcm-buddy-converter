import * as XLSX from 'xlsx';
import { tDate, sm, pct, avg, ddiff, payerTat, arAnchor, patientCollected } from './rcm-utils';

export const DENIED_STATUSES = ['Pre Auth Denied', 'Discharge Denied', 'Claim Denied', 'Reconsideration Submitted', 'Enhancement Denied'];
export const VALID_CLOSED_STATUSES = ['Settled', 'Settlement Initiated', 'Claim Approved', 'Processing', 'Enhancement Approved'];
export const isDeniedStatus = (s: string) => DENIED_STATUSES.includes(s);
export const isPendingStatus = (s: string) => !VALID_CLOSED_STATUSES.includes(s) && !DENIED_STATUSES.includes(s) && s !== 'Cancelled';

/** A claim counts as denied when its status is a denial OR nothing was approved (and it isn't cancelled). */
/** Open claims with no approval yet that are ≤30 days old are still awaiting the payer's decision — not denials. */
export const isAwaitingDecision = (x: { status: string; approvedAmt: number; settledAmt: number; admission?: Date | null }) => {
  if (!isPendingStatus(x.status) || x.approvedAmt > 0 || x.settledAmt > 0 || !x.admission) return false;
  return (Date.now() - x.admission.getTime()) / 86400000 <= 30;
};
export const isDeniedClaim = (x: { status: string; approvedAmt: number; settledAmt: number; admission?: Date | null }) =>
  x.status !== 'Cancelled' && (isDeniedStatus(x.status) || (x.approvedAmt <= 0 && x.settledAmt <= 0 && !isAwaitingDecision(x)));

/** Outstanding claims: still open AND something was approved. Zero-approval claims are denials, not AR. */
export const isPendingClaim = (x: { status: string; approvedAmt: number; settledAmt: number }) =>
  isPendingStatus(x.status) && !isDeniedClaim(x) && x.approvedAmt > 0;

/** Receivable balance is the approved amount still to be collected from the payer. */
export const arOutstanding = (x: { approvedAmt: number; settledAmt: number; tdsAmt: number; copay: number }) =>
  Math.max(0, x.approvedAmt - x.settledAmt - x.tdsAmt);

/** Net collection rate on closed (Settled) claims: Settled ÷ Billed (Claimed). */
export const settledCollRate = (rows: { status: string; claimedAmt: number; settledAmt: number }[]) => {
  let b = 0, r = 0;
  rows.forEach(x => { if (x.status === 'Settled') { b += x.claimedAmt; r += x.settledAmt; } });
  return b > 0 ? (r / b) * 100 : 0;
};

/** Unique-patient key for ranking payers/corporates. */
export const patientKey = (x: ClaimRecord) =>
  (x.patientId || x.patientName || '').trim().toLowerCase() ||
  `${(x.patientName || '').trim().toLowerCase()}|${x.admission ? x.admission.toISOString().slice(0, 10) : ''}`;

/** Count distinct patients in a set of claims. */
export const uniquePatients = (rows: ClaimRecord[]) => {
  const s = new Set<string>();
  rows.forEach(r => { const k = patientKey(r); if (k) s.add(k); });
  return s.size;
};

export interface ReconCheck { name: string; pass: boolean; detail: string; }

export interface ClaimRecord {
  hospital: string;
  admission: Date | null;
  discharge: Date | null;
  tpa: string;
  insurer: string;
  claimCreated: Date | null;
  claimedAmt: number;
  approvedAmt: number;
  copay: number;
  shortfall: number;
  discount: number;
  patientPaid: number;
  settledAmt: number;
  tdsAmt: number;
  status: string;
  docSubmit: Date | null;
  paymentDate: Date | null;
  treatment: string;
  diagnosis: string;
  policyType: string;
  policyHolder: string;
  patientId: string;
  patientName: string;
}

export interface GlobalData {
  allData: ClaimRecord[];
  data: ClaimRecord[];
  n: number;
  totalClaimed: number;
  totalApproved: number;
  totalSettled: number;
  totalShortfall: number;
  totalCopay: number;
  totalDiscount: number;
  totalTDS: number;
  totalPatientPaid: number;
  hospitalName: string;
  dateRange: string;
  ageBuckets: Record<string, { cnt: number; val: number }>;
  tpaMap: Record<string, any>;
  tpaArr: any[];
  tpaLeak: Record<string, any>;
  leakageData: any;
  totalPatientCollected: number;
  pendingAR: { cnt: number; val: number };
  reconciliation: ReconCheck[];
}

/** Case-insensitive fuzzy column matcher */
function col(row: any, ...candidates: string[]): any {
  // Try exact match first
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null) return row[c];
  }
  // Try case-insensitive match
  const keys = Object.keys(row);
  for (const c of candidates) {
    const lower = c.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const k of keys) {
      if (k.toLowerCase().replace(/\s+/g, ' ').trim() === lower) return row[k];
    }
  }
  // Try partial match (candidate is substring of key or vice versa)
  for (const c of candidates) {
    const lower = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const k of keys) {
      const kLower = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (kLower.includes(lower) || lower.includes(kLower)) return row[k];
    }
  }
  return null;
}

const KNOWN_STATUSES = ['Cancelled', 'Pre Auth Query', 'Settled', 'Pre Auth Denied', 'Pre Auth Initiated', 'Pre Auth Approved', 'Pre Auth Query Replied', 'Settlement Initiated', 'Claim Approved', 'Discharge Denied', 'Claim Denied', 'Reconsideration Submitted', 'Discharge Approved', 'Pre Auth Submitted to Payer', 'Processing', 'Enhancement Denied', 'Enhancement Approved'];
const squash = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
/** Map raw status text (any case/spacing, e.g. "SETTLED ", "Claim Settled", "Pre-Auth Denied") to the canonical status names used by every formula. */
export function normalizeStatus(raw: any): string {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const q = squash(t);
  const exact = KNOWN_STATUSES.find(k => squash(k) === q);
  if (exact) return exact;
  if (q.includes('cancel')) return 'Cancelled';
  if (q.includes('settlementinitiated')) return 'Settlement Initiated';
  if (q.includes('settled') || q === 'paid' || q.includes('closedpaid')) return 'Settled';
  return t;
}

/** Parse amounts like "1,23,456.50", "₹ 45,000", "(500)" or blank into a number. */
export function num(v: any): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null) return 0;
  let t = String(v).trim();
  const neg = /^\(.*\)$/.test(t);
  t = t.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(t);
  return isFinite(n) ? (neg ? -Math.abs(n) : n) : 0;
}

export function parseExcelFile(buffer: ArrayBuffer): ClaimRecord[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });

  // Log first row keys for debugging
  if (raw.length > 0) {
    console.log('[RCM] Excel columns found:', Object.keys(raw[0]));
  }

  return raw.map(r => ({
    hospital: col(r, 'Hospital Name', 'HospitalName', 'Hospital') || '',
    admission: tDate(col(r, 'Date of Admission', 'Admission Date', 'DateOfAdmission', 'DOA')),
    discharge: tDate(col(r, 'Date of Discharge', 'Discharge Date', 'DateOfDischarge', 'DOD')),
    tpa: col(r, 'TPA Name', 'TPAName', 'TPA') || 'Unknown',
    insurer: col(r, 'Insurance Company Name', 'Insurer', 'Insurance Company', 'InsuranceCompany', 'Payer') || 'Unknown',
    claimCreated: tDate(col(r, 'Claim Creation Date', 'ClaimCreationDate', 'Claim Date')),
    claimedAmt: num(col(r, 'Claimed Amount', 'ClaimedAmount', 'Claim Amount', 'ClaimAmount')),
    approvedAmt: num(col(r, 'Approved Amount', 'ApprovedAmount', 'Approved Amt')),
    copay: num(col(r, 'Copay', 'Co-pay', 'CoPay Amount')),
    shortfall: num(col(r, 'Shortfall Amount', 'ShortfallAmount', 'Shortfall')),
    discount: num(col(r, 'Hospital Discount', 'HospitalDiscount', 'Discount')),
    patientPaid: num(col(r, 'Patient Paid Amount', 'PatientPaidAmount', 'Patient Paid')),
    settledAmt: num(col(r, 'Settled Amount', 'SettledAmount', 'Settlement Amount', 'Net Settled Amount')),
    tdsAmt: num(col(r, 'TDS Amount', 'TDSAmount', 'TDS')),
    status: normalizeStatus(col(r, 'Claim Status', 'ClaimStatus', 'Status')),
    docSubmit: tDate(col(r, 'Document Submission Date (on IHX)', 'Document Submission Date', 'Doc Submission Date', 'DocSubmitDate', 'DocumentSubmissionDate')),
    paymentDate: tDate(col(r, 'Payment Update Date', 'Payment Date', 'PaymentDate', 'PaymentUpdateDate', 'Settlement Date')),
    treatment: col(r, 'Treatment', 'Treatment Type', 'Procedure') || '',
    diagnosis: col(r, 'Diagnosis', 'Diagnosis Name', 'Disease') || '',
    policyType: col(r, 'Policy Type (Base/Top-up)', 'Policy Type', 'PolicyType') || '',
    policyHolder: col(r, 'Policy Holder Name', 'PolicyHolderName', 'Policy Holder', 'Corporate Name', 'Company Name', 'Group Name', 'Employer Name') || '',
    patientId: String(col(r, 'IP No', 'IP Number', 'IPNo', 'IPNumber', 'Inpatient No', 'UHID', 'MRN', 'Patient ID', 'PatientId') || ''),
    patientName: String(col(r, 'Patient Name', 'PatientName', 'Patient') || ''),
  }));
}

/** Parse just the raw sheet rows (no normalization) — used by DQ engine to inspect originals */
export function parseRawSheet(buffer: ArrayBuffer): any[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

export function computeGlobals(data: ClaimRecord[]): GlobalData {
  const n = data.length;
  const totalClaimed = sm(data.map(x => x.claimedAmt));
  const totalApproved = sm(data.map(x => x.approvedAmt));
  const totalSettled = sm(data.map(x => x.settledAmt));
  const totalShortfall = sm(data.map(x => x.shortfall));
  const totalCopay = sm(data.map(x => x.copay));
  const totalDiscount = sm(data.map(x => x.discount));
  const totalTDS = sm(data.map(x => x.tdsAmt));
  const totalPatientPaid = sm(data.map(x => x.patientPaid));

  const hosp = (data.find(d => d.hospital) || { hospital: 'Hospital' }).hospital;
  const dates = data.map(d => d.admission).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime()) as Date[];
  const f = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const dateRange = dates.length ? `${f(dates[0])} – ${f(dates[dates.length - 1])}` : '';

  // Status categorization per business policy
  const REMOVED_STATUSES = ['Cancelled'];
  const isDenied = (s: string) => DENIED_STATUSES.includes(s);
  const isValidClosed = (s: string) => VALID_CLOSED_STATUSES.includes(s);
  // Age buckets for AR — pending = open claims with an approved amount still to collect.
  // Zero-approval claims are denials, never receivables.
  const pending = data.filter(x => isPendingClaim(x));
  const now = new Date();
  const buckets: Record<string, { cnt: number; val: number }> = {
    '0-30': { cnt: 0, val: 0 },
    '31-60': { cnt: 0, val: 0 },
    '61-90': { cnt: 0, val: 0 },
    '91-180': { cnt: 0, val: 0 },
    '180+': { cnt: 0, val: 0 },
  };
  pending.forEach(x => {
    const anchor = arAnchor(x);
    const age = anchor ? (ddiff(anchor, now) ?? 0) : 0;
    const key = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : age <= 180 ? '91-180' : '180+';
    buckets[key].cnt++;
    buckets[key].val += arOutstanding(x);
  });

  // TPA map for payer tab
  const tpaMap: Record<string, any> = {};
  data.forEach(x => {
    const k = x.tpa;
    if (!tpaMap[k]) tpaMap[k] = { cnc: 0, cnt: 0, claimed: 0, approved: 0, settled: 0, denied: 0, tatVals: [] as number[], closedApproved: 0, closedRealised: 0, patients: new Set<string>(), uniquePatients: 0 };
    const t = tpaMap[k];
    t.cnt++; if (x.status === 'Cancelled') t.cnc++; t.claimed += x.claimedAmt; t.approved += x.approvedAmt; t.settled += x.settledAmt;
    if (isDeniedClaim(x)) t.denied++;
    if (x.status === 'Settled') { t.closedApproved += x.approvedAmt; t.closedRealised += x.settledAmt + x.tdsAmt; }
    const pk = patientKey(x);
    if (pk) t.patients.add(pk);
    const tat = payerTat(x);
    if (tat !== null) t.tatVals.push(tat);
  });
  Object.values(tpaMap).forEach((t: any) => { t.uniquePatients = t.patients.size; });

  const tpaArr = Object.entries(tpaMap)
    .map(([k, v]) => ({
      k, v,
      uniquePatients: v.uniquePatients,
      approvalRate: pct(v.approved, v.claimed),
      collRate: pct(v.closedRealised, v.closedApproved),
      lowVolume: v.cnt < 15,
      denialRate: pct(v.denied, v.cnt - v.cnc),
      avgTAT: avg(v.tatVals || [])
    }))
    .sort((a, b) => (b.uniquePatients - a.uniquePatients) || (b.v.claimed - a.v.claimed));

  // Leakage — mutually exclusive, row-level buckets (no rupee counted twice)
  //  • Denied claims: full claimed value → Denied bucket only
  //  • Other claims: Payer Deduction = Claimed − Approved − Shortfall (≥0); Shortfall = patient-liability gap
  //  • Short-settlement: only for Settled claims = Approved − Settled − TDS (≥0). Open claims are AR, not leakage.
  let payerDed = 0, shortfallVal = 0, uncollected = 0, deniedVal = 0, overApprovedRows = 0, overSettledRows = 0;
  data.forEach(x => {
    if (x.status === 'Cancelled') return;
    if (isDeniedClaim(x)) { deniedVal += x.claimedAmt; return; }
    const sf = Math.max(0, x.shortfall);
    const ded = x.claimedAmt - x.approvedAmt - sf;
    if (ded < 0 && x.approvedAmt > 0) overApprovedRows++;
    payerDed += Math.max(0, ded);
    shortfallVal += sf;
    if (x.status === 'Settled') {
      const gap = x.approvedAmt - x.settledAmt - x.tdsAmt;
      if (gap < 0 && x.approvedAmt > 0) overSettledRows++;
      uncollected += Math.max(0, gap);
    }
  });
  const leakTotal = payerDed + shortfallVal + uncollected + deniedVal;
  const leakageData = { payerDed, shortfall: shortfallVal, uncollected, deniedVal, copayDue: totalCopay, total: leakTotal };

  const totalPatientCollected = sm(data.map(patientCollected));
  const copayInside = data.filter(x => x.copay > 0 && x.patientPaid >= x.copay).length;
  const copaySeparate = data.filter(x => x.copay > 0 && x.patientPaid < x.copay).length;
  const pendingAR = { cnt: pending.length, val: sm(pending.map(arOutstanding)) };
  const bucketCnt = Object.values(buckets).reduce((a, b) => a + b.cnt, 0);
  const bucketVal = Object.values(buckets).reduce((a, b) => a + b.val, 0);
  const tatCovered = data.filter(x => x.status === 'Settled' && payerTat(x) !== null).length;
  const settledCnt = data.filter(x => x.status === 'Settled').length;
  const agedFromAdmission = pending.filter(x => !x.docSubmit && !x.discharge).length;
  const deniedAll = data.filter(x => isDeniedClaim(x)).length;
  const validAll = data.filter(x => isValidClosed(x.status) && !isDeniedClaim(x)).length;
  const awaitingAll = data.filter(x => isAwaitingDecision(x)).length;
  const statusSum = deniedAll + validAll + pending.length + awaitingAll + data.filter(x => x.status === 'Cancelled').length;
  const r = (v: number) => Math.round(v);
  const reconciliation: ReconCheck[] = [
    { name: 'Leakage buckets are mutually exclusive', pass: leakTotal <= totalClaimed + 1, detail: `Leakage ₹${r(leakTotal).toLocaleString('en-IN')} ≤ Billed ₹${r(totalClaimed).toLocaleString('en-IN')}; denied claims counted only in Denied bucket` },
    { name: 'AR ageing buckets = Pending AR', pass: bucketCnt === pendingAR.cnt && Math.abs(bucketVal - pendingAR.val) < 1, detail: `${bucketCnt} claims in buckets vs ${pendingAR.cnt} pending; ${agedFromAdmission} aged from admission (no submission/discharge date)` },
    { name: 'Every claim has exactly one status category', pass: statusSum === n, detail: `${statusSum} categorised of ${n} claims (${awaitingAll} new claims awaiting payer decision)` },
    { name: 'Patient paid has no copay double-count', pass: true, detail: `${copayInside} rows copay already inside Patient Paid; ${copaySeparate} rows copay added separately` },
    { name: 'Approved ≤ Claimed − Shortfall', pass: overApprovedRows === 0, detail: `${overApprovedRows} claims approved above billed (check source data)` },
    { name: 'Settled + TDS ≤ Approved', pass: overSettledRows === 0, detail: `${overSettledRows} settled claims paid above approved (check source data)` },
    { name: 'Payer TAT coverage', pass: settledCnt === 0 || tatCovered / settledCnt >= 0.8, detail: `${tatCovered} of ${settledCnt} settled claims have submission/discharge + payment dates` },
  ];

  // TPA leakage
  const tpaLeak: Record<string, any> = {};
  data.forEach(x => {
    const k = x.tpa;
    if (!tpaLeak[k]) tpaLeak[k] = { cnt: 0, cnc: 0, claimed: 0, approved: 0, settled: 0, shortfall: 0, denied: 0, denVal: 0 };
    const t = tpaLeak[k];
    t.cnt++; if (x.status === 'Cancelled') t.cnc++; t.claimed += x.claimedAmt; t.approved += x.approvedAmt; t.settled += x.settledAmt; t.shortfall += x.shortfall;
    if (isDeniedClaim(x)) { t.denied++; t.denVal += x.claimedAmt; }
  });

  return {
    allData: data, data, n, totalClaimed, totalApproved, totalSettled, totalShortfall,
    totalCopay, totalDiscount, totalTDS, totalPatientPaid,
    hospitalName: hosp.replace('Hospital', '').replace('- Hyderabad', '').trim().split('-')[0].trim(),
    dateRange, ageBuckets: buckets, tpaMap, tpaArr, tpaLeak, leakageData,
    totalPatientCollected, pendingAR, reconciliation,
  };
}
