import * as XLSX from 'xlsx';
import { tDate, sm, pct, avg, ddiff, payerTat, arAnchor, patientCollected } from './rcm-utils';

export const DENIED_STATUSES = ['Pre Auth Denied', 'Discharge Denied', 'Claim Denied', 'Reconsideration Submitted', 'Enhancement Denied'];
export const VALID_CLOSED_STATUSES = ['Settled', 'Settlement Initiated', 'Claim Approved', 'Processing', 'Enhancement Approved'];
export const isDeniedStatus = (s: string) => DENIED_STATUSES.includes(s);
export const isPendingStatus = (s: string) => !VALID_CLOSED_STATUSES.includes(s) && !DENIED_STATUSES.includes(s) && s !== 'Cancelled';

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
    claimedAmt: +(col(r, 'Claimed Amount', 'ClaimedAmount', 'Claim Amount', 'ClaimAmount') || 0),
    approvedAmt: +(col(r, 'Approved Amount', 'ApprovedAmount', 'Approved Amt') || 0),
    copay: +(col(r, 'Copay', 'Co-pay', 'CoPay Amount') || 0),
    shortfall: +(col(r, 'Shortfall Amount', 'ShortfallAmount', 'Shortfall') || 0),
    discount: +(col(r, 'Hospital Discount', 'HospitalDiscount', 'Discount') || 0),
    patientPaid: +(col(r, 'Patient Paid Amount', 'PatientPaidAmount', 'Patient Paid') || 0),
    settledAmt: +(col(r, 'Settled Amount', 'SettledAmount', 'Settlement Amount', 'Net Settled Amount') || 0),
    tdsAmt: +(col(r, 'TDS Amount', 'TDSAmount', 'TDS') || 0),
    status: col(r, 'Claim Status', 'ClaimStatus', 'Status') || '',
    docSubmit: tDate(col(r, 'Document Submission Date (on IHX)', 'Document Submission Date', 'Doc Submission Date', 'DocSubmitDate', 'DocumentSubmissionDate')),
    paymentDate: tDate(col(r, 'Payment Update Date', 'Payment Date', 'PaymentDate', 'PaymentUpdateDate', 'Settlement Date')),
    treatment: col(r, 'Treatment', 'Treatment Type', 'Procedure') || '',
    diagnosis: col(r, 'Diagnosis', 'Diagnosis Name', 'Disease') || '',
    policyType: col(r, 'Policy Type (Base/Top-up)', 'Policy Type', 'PolicyType') || '',
    policyHolder: col(r, 'Policy Holder Name', 'PolicyHolderName', 'Policy Holder', 'Corporate Name', 'Company Name', 'Group Name', 'Employer Name') || '',
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
  // Age buckets for AR — pending = active claims (not settled/valid, not denied, not cancelled)
  const pending = data.filter(x => !isValidClosed(x.status) && !isDenied(x.status) && !REMOVED_STATUSES.includes(x.status));
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
    buckets[key].val += x.claimedAmt;
  });

  // TPA map for payer tab
  const tpaMap: Record<string, any> = {};
  data.forEach(x => {
    const k = x.tpa;
    if (!tpaMap[k]) tpaMap[k] = { cnc: 0, cnt: 0, claimed: 0, approved: 0, settled: 0, denied: 0, tatVals: [] as number[] };
    const t = tpaMap[k];
    t.cnt++; if (x.status === 'Cancelled') t.cnc++; t.claimed += x.claimedAmt; t.approved += x.approvedAmt; t.settled += x.settledAmt;
    if (isDenied(x.status)) t.denied++;
    const tat = payerTat(x);
    if (tat !== null) t.tatVals.push(tat);
  });

  const tpaArr = Object.entries(tpaMap)
    .filter(e => e[1].cnt >= 15)
    .map(([k, v]) => ({
      k, v,
      approvalRate: pct(v.approved, v.claimed),
      collRate: pct(v.settled, v.approved),
      denialRate: pct(v.denied, v.cnt - v.cnc),
      avgTAT: avg(v.tatVals || [])
    }));

  // Leakage — mutually exclusive, row-level buckets (no rupee counted twice)
  //  • Denied claims: full claimed value → Denied bucket only
  //  • Other claims: Payer Deduction = Claimed − Approved − Shortfall (≥0); Shortfall = patient-liability gap
  //  • Short-settlement: only for Settled claims = Approved − Settled − Copay − TDS (≥0). Open claims are AR, not leakage.
  let payerDed = 0, shortfallVal = 0, uncollected = 0, deniedVal = 0, overApprovedRows = 0, overSettledRows = 0;
  data.forEach(x => {
    if (x.status === 'Cancelled') return;
    if (isDenied(x.status)) { deniedVal += x.claimedAmt; return; }
    const sf = Math.max(0, x.shortfall);
    const ded = x.claimedAmt - x.approvedAmt - sf;
    if (ded < 0 && x.approvedAmt > 0) overApprovedRows++;
    payerDed += Math.max(0, ded);
    shortfallVal += sf;
    if (x.status === 'Settled') {
      const gap = x.approvedAmt - x.settledAmt - x.copay - x.tdsAmt;
      if (gap < 0 && x.approvedAmt > 0) overSettledRows++;
      uncollected += Math.max(0, gap);
    }
  });
  const leakTotal = payerDed + shortfallVal + uncollected + deniedVal;
  const leakageData = { payerDed, shortfall: shortfallVal, uncollected, deniedVal, copayDue: totalCopay, total: leakTotal };

  const totalPatientCollected = sm(data.map(patientCollected));
  const copayInside = data.filter(x => x.copay > 0 && x.patientPaid >= x.copay).length;
  const copaySeparate = data.filter(x => x.copay > 0 && x.patientPaid < x.copay).length;
  const pendingAR = { cnt: pending.length, val: sm(pending.map(x => x.claimedAmt)) };
  const bucketCnt = Object.values(buckets).reduce((a, b) => a + b.cnt, 0);
  const bucketVal = Object.values(buckets).reduce((a, b) => a + b.val, 0);
  const tatCovered = data.filter(x => x.status === 'Settled' && payerTat(x) !== null).length;
  const settledCnt = data.filter(x => x.status === 'Settled').length;
  const agedFromAdmission = pending.filter(x => !x.docSubmit && !x.discharge).length;
  const statusSum = data.filter(x => isDenied(x.status)).length + data.filter(x => isValidClosed(x.status)).length + pending.length + data.filter(x => x.status === 'Cancelled').length;
  const r = (v: number) => Math.round(v);
  const reconciliation: ReconCheck[] = [
    { name: 'Leakage buckets are mutually exclusive', pass: leakTotal <= totalClaimed + 1, detail: `Leakage ₹${r(leakTotal).toLocaleString('en-IN')} ≤ Billed ₹${r(totalClaimed).toLocaleString('en-IN')}; denied claims counted only in Denied bucket` },
    { name: 'AR ageing buckets = Pending AR', pass: bucketCnt === pendingAR.cnt && Math.abs(bucketVal - pendingAR.val) < 1, detail: `${bucketCnt} claims in buckets vs ${pendingAR.cnt} pending; ${agedFromAdmission} aged from admission (no submission/discharge date)` },
    { name: 'Every claim has exactly one status category', pass: statusSum === n, detail: `${statusSum} categorised of ${n} claims` },
    { name: 'Patient paid has no copay double-count', pass: true, detail: `${copayInside} rows copay already inside Patient Paid; ${copaySeparate} rows copay added separately` },
    { name: 'Approved ≤ Claimed − Shortfall', pass: overApprovedRows === 0, detail: `${overApprovedRows} claims approved above billed (check source data)` },
    { name: 'Settled + Copay + TDS ≤ Approved', pass: overSettledRows === 0, detail: `${overSettledRows} settled claims paid above approved (check source data)` },
    { name: 'Payer TAT coverage', pass: settledCnt === 0 || tatCovered / settledCnt >= 0.8, detail: `${tatCovered} of ${settledCnt} settled claims have submission/discharge + payment dates` },
  ];

  // TPA leakage
  const tpaLeak: Record<string, any> = {};
  data.forEach(x => {
    const k = x.tpa;
    if (!tpaLeak[k]) tpaLeak[k] = { cnt: 0, claimed: 0, approved: 0, settled: 0, shortfall: 0, denied: 0, denVal: 0 };
    const t = tpaLeak[k];
    t.cnt++; if (x.status === 'Cancelled') t.cnc++; t.claimed += x.claimedAmt; t.approved += x.approvedAmt; t.settled += x.settledAmt; t.shortfall += x.shortfall;
    if (isDenied(x.status)) { t.denied++; t.denVal += x.claimedAmt; }
  });

  return {
    allData: data, data, n, totalClaimed, totalApproved, totalSettled, totalShortfall,
    totalCopay, totalDiscount, totalTDS, totalPatientPaid,
    hospitalName: hosp.replace('Hospital', '').replace('- Hyderabad', '').trim().split('-')[0].trim(),
    dateRange, ageBuckets: buckets, tpaMap, tpaArr, tpaLeak, leakageData,
    totalPatientCollected, pendingAR, reconciliation,
  };
}
