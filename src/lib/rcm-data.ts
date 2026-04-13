import * as XLSX from 'xlsx';
import { tDate, sm, pct, avg, ddiff } from './rcm-utils';

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
  }));
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

  // Age buckets for AR
  const pending = data.filter(x => !['Settled', 'Claim Denied', 'Pre Auth Denied', 'Cancelled', 'Enhancement Denied', 'Discharge Denied'].includes(x.status));
  const now = new Date();
  const buckets: Record<string, { cnt: number; val: number }> = {
    '0-30': { cnt: 0, val: 0 },
    '31-60': { cnt: 0, val: 0 },
    '61-90': { cnt: 0, val: 0 },
    '91-180': { cnt: 0, val: 0 },
    '180+': { cnt: 0, val: 0 },
  };
  pending.forEach(x => {
    const age = x.admission ? Math.round((now.getTime() - x.admission.getTime()) / 86400000) : 0;
    const key = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : age <= 180 ? '91-180' : '180+';
    buckets[key].cnt++;
    buckets[key].val += x.claimedAmt;
  });

  // TPA map for payer tab
  const tpaMap: Record<string, any> = {};
  data.forEach(x => {
    const k = x.tpa;
    if (!tpaMap[k]) tpaMap[k] = { cnt: 0, claimed: 0, approved: 0, settled: 0, denied: 0, tatVals: [] as number[] };
    const t = tpaMap[k];
    t.cnt++; t.claimed += x.claimedAmt; t.approved += x.approvedAmt; t.settled += x.settledAmt;
    if (x.status.toLowerCase().includes('denied') || x.status === 'Cancelled') t.denied++;
    const tat = ddiff(x.admission, x.paymentDate);
    if (tat !== null && tat < 365) t.tatVals.push(tat);
  });

  const tpaArr = Object.entries(tpaMap)
    .filter(e => e[1].cnt >= 15)
    .map(([k, v]) => ({
      k, v,
      approvalRate: pct(v.approved, v.claimed),
      collRate: pct(v.settled, v.approved),
      denialRate: pct(v.denied, v.cnt),
      avgTAT: avg(v.tatVals || [])
    }));

  // Leakage data
  const payerDed = Math.max(0, totalClaimed - totalApproved - totalShortfall);
  const shortfallVal = totalShortfall;
  const uncollected = Math.max(0, totalApproved - totalSettled - totalCopay - totalTDS);
  const deniedVal = sm(data.filter(x => x.status.toLowerCase().includes('denied') || x.status === 'Cancelled').map(x => x.claimedAmt));
  const leakageData = { payerDed, shortfall: shortfallVal, uncollected, deniedVal, copayDue: totalCopay };

  // TPA leakage
  const tpaLeak: Record<string, any> = {};
  data.forEach(x => {
    const k = x.tpa;
    if (!tpaLeak[k]) tpaLeak[k] = { cnt: 0, claimed: 0, approved: 0, settled: 0, shortfall: 0, denied: 0, denVal: 0 };
    const t = tpaLeak[k];
    t.cnt++; t.claimed += x.claimedAmt; t.approved += x.approvedAmt; t.settled += x.settledAmt; t.shortfall += x.shortfall;
    if (x.status.toLowerCase().includes('denied') || x.status === 'Cancelled') { t.denied++; t.denVal += x.claimedAmt; }
  });

  return {
    allData: data, data, n, totalClaimed, totalApproved, totalSettled, totalShortfall,
    totalCopay, totalDiscount, totalTDS, totalPatientPaid,
    hospitalName: hosp.replace('Hospital', '').replace('- Hyderabad', '').trim().split('-')[0].trim(),
    dateRange, ageBuckets: buckets, tpaMap, tpaArr, tpaLeak, leakageData,
  };
}
