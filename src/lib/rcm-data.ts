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

export function parseExcelFile(buffer: ArrayBuffer): ClaimRecord[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });

  return raw.map(r => ({
    hospital: r['Hospital Name'] || '',
    admission: tDate(r['Date of Admission']),
    discharge: tDate(r['Date of Discharge']),
    tpa: r['TPA Name'] || 'Unknown',
    insurer: r['Insurance Company Name'] || 'Unknown',
    claimCreated: tDate(r['Claim Creation Date']),
    claimedAmt: +r['Claimed Amount'] || 0,
    approvedAmt: +r['Approved Amount'] || 0,
    copay: +r['Copay'] || 0,
    shortfall: +r['Shortfall Amount'] || 0,
    discount: +r['Hospital Discount'] || 0,
    patientPaid: +r['Patient Paid Amount'] || 0,
    settledAmt: +r['Settled Amount'] || 0,
    tdsAmt: +r['TDS Amount'] || 0,
    status: r['Claim Status'] || '',
    docSubmit: tDate(r['Document Submission Date (on IHX)']),
    paymentDate: tDate(r['Payment Update Date']),
    treatment: r['Treatment'] || '',
    diagnosis: r['Diagnosis'] || '',
    policyType: r['Policy Type (Base/Top-up)'] || '',
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
