import * as XLSX from 'xlsx';
import { ClaimRecord, GlobalData } from './rcm-data';

const DENIED = ['Pre Auth Denied', 'Discharge Denied', 'Claim Denied', 'Reconsideration Submitted', 'Enhancement Denied'];
const VALID_CLOSED = ['Settled', 'Settlement Initiated', 'Claim Approved', 'Processing', 'Enhancement Approved'];
const REMOVED = ['Cancelled'];

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const dayDiff = (a: Date | null, b: Date | null) =>
  a && b ? Math.round((b.getTime() - a.getTime()) / 86400000) : '';

function bucket(age: number | string): string {
  if (typeof age !== 'number') return '';
  if (age <= 30) return '0-30';
  if (age <= 60) return '31-60';
  if (age <= 90) return '61-90';
  if (age <= 180) return '91-180';
  return '180+';
}

function category(status: string): string {
  if (DENIED.includes(status)) return 'Denied';
  if (VALID_CLOSED.includes(status)) return 'Valid / Closed';
  if (REMOVED.includes(status)) return 'Removed (Cancelled)';
  return 'Active / Pending';
}

export function exportClaimsWorkbook(global: GlobalData) {
  const data = global.allData;
  const today = new Date();

  // ===== Sheet 1: Claims (raw + computed columns w/ formulas) =====
  // Column layout:
  // A Hospital, B Admission, C Discharge, D TPA, E Insurer, F Claim Created,
  // G Claimed, H Approved, I Copay, J Shortfall, K Discount, L Patient Paid,
  // M Settled, N TDS, O Status, P Doc Submit, Q Payment Date,
  // R Treatment, S Diagnosis, T Policy Type, U Policy Holder,
  // V Status Category, W Age (Days from Admission), X AR Bucket,
  // Y TAT Adm→Pay (Days), Z Approval % (Approved/Claimed),
  // AA Collection % (Settled/Approved), AB Net Yield % (Settled/Claimed),
  // AC Disallowed (Claimed-Approved-Shortfall), AD Uncollected (Approved-Settled-Copay-TDS)
  const header = [
    'Hospital', 'Admission Date', 'Discharge Date', 'TPA', 'Insurer', 'Claim Created',
    'Claimed Amt', 'Approved Amt', 'Copay', 'Shortfall', 'Discount', 'Patient Paid',
    'Settled Amt', 'TDS', 'Status', 'Doc Submit Date', 'Payment Date',
    'Treatment', 'Diagnosis', 'Policy Type', 'Policy Holder / Corporate',
    'Status Category', 'Age (Days since Admission)', 'AR Aging Bucket',
    'TAT Adm→Payment (Days)', 'Approval %', 'Collection %', 'Net Yield %',
    'Disallowed Amt', 'Uncollected Amt',
  ];

  const rows: any[][] = [header];
  data.forEach((x, i) => {
    const r = i + 2; // excel row (1-indexed, after header)
    const age = x.admission ? Math.round((today.getTime() - x.admission.getTime()) / 86400000) : '';
    rows.push([
      x.hospital, fmtDate(x.admission), fmtDate(x.discharge), x.tpa, x.insurer, fmtDate(x.claimCreated),
      x.claimedAmt, x.approvedAmt, x.copay, x.shortfall, x.discount, x.patientPaid,
      x.settledAmt, x.tdsAmt, x.status, fmtDate(x.docSubmit), fmtDate(x.paymentDate),
      x.treatment, x.diagnosis, x.policyType, x.policyHolder,
      category(x.status),
      age,
      bucket(age),
      dayDiff(x.admission, x.paymentDate),
      { f: `IFERROR(H${r}/G${r},0)` },
      { f: `IFERROR(M${r}/H${r},0)` },
      { f: `IFERROR(M${r}/G${r},0)` },
      { f: `MAX(0,G${r}-H${r}-J${r})` },
      { f: `MAX(0,H${r}-M${r}-I${r}-N${r})` },
    ]);
  });

  // Totals row
  const lastRow = data.length + 1;
  const totalRow = lastRow + 1;
  rows.push([
    'TOTAL', '', '', '', '', '',
    { f: `SUM(G2:G${lastRow})` },
    { f: `SUM(H2:H${lastRow})` },
    { f: `SUM(I2:I${lastRow})` },
    { f: `SUM(J2:J${lastRow})` },
    { f: `SUM(K2:K${lastRow})` },
    { f: `SUM(L2:L${lastRow})` },
    { f: `SUM(M2:M${lastRow})` },
    { f: `SUM(N2:N${lastRow})` },
    '', '', '', '', '', '', '',
    '', '', '', '',
    { f: `IFERROR(H${totalRow}/G${totalRow},0)` },
    { f: `IFERROR(M${totalRow}/H${totalRow},0)` },
    { f: `IFERROR(M${totalRow}/G${totalRow},0)` },
    { f: `MAX(0,G${totalRow}-H${totalRow}-J${totalRow})` },
    { f: `MAX(0,H${totalRow}-M${totalRow}-I${totalRow}-N${totalRow})` },
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  // Apply % format on cols Z, AA, AB (indices 25, 26, 27)
  const pctCols = [25, 26, 27];
  for (let i = 1; i < rows.length; i++) {
    pctCols.forEach(c => {
      const addr = XLSX.utils.encode_cell({ r: i, c });
      if (ws1[addr]) ws1[addr].z = '0.0%';
    });
  }
  // Currency cols G-N (6..13) and AC, AD (28..29)
  const moneyCols = [6, 7, 8, 9, 10, 11, 12, 13, 28, 29];
  for (let i = 1; i < rows.length; i++) {
    moneyCols.forEach(c => {
      const addr = XLSX.utils.encode_cell({ r: i, c });
      if (ws1[addr]) ws1[addr].z = '#,##0';
    });
  }
  ws1['!cols'] = header.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 12), 28) }));
  ws1['!freeze'] = { xSplit: 0, ySplit: 1 } as any;

  // ===== Sheet 2: KPI Summary =====
  const kpi: any[][] = [
    ['KPI', 'Value', 'Formula (refers to Claims sheet)', 'Description'],
    ['Total Claims', global.n, `=COUNTA(Claims!A2:A${lastRow})`, 'Total number of claim records after data quality filter'],
    ['Total Claimed (₹)', global.totalClaimed, `=SUM(Claims!G2:G${lastRow})`, 'Gross amount billed to payers'],
    ['Total Approved (₹)', global.totalApproved, `=SUM(Claims!H2:H${lastRow})`, 'Amount approved by payers (pre-auth + final)'],
    ['Total Settled (₹)', global.totalSettled, `=SUM(Claims!M2:M${lastRow})`, 'Cash actually received from payers (net of TDS)'],
    ['Total Shortfall (₹)', global.totalShortfall, `=SUM(Claims!J2:J${lastRow})`, 'Disallowed by payer but recoverable from patient'],
    ['Total Copay (₹)', global.totalCopay, `=SUM(Claims!I2:I${lastRow})`, 'Patient-borne share as per policy'],
    ['Total Discount (₹)', global.totalDiscount, `=SUM(Claims!K2:K${lastRow})`, 'Hospital concession / write-off'],
    ['Total TDS (₹)', global.totalTDS, `=SUM(Claims!N2:N${lastRow})`, 'Tax deducted at source by payer'],
    ['Total Patient Paid (₹)', global.totalPatientPaid, `=SUM(Claims!L2:L${lastRow})`, 'Amount collected from patient (incl. copay)'],
    [],
    ['Approval Rate %', '', `=IFERROR(B4/B3,0)`, 'Total Approved ÷ Total Claimed'],
    ['Net Collection %', '', `=IFERROR(B5/B4,0)`, 'Total Settled ÷ Total Approved'],
    ['Net Yield %', '', `=IFERROR(B5/B3,0)`, 'Total Settled ÷ Total Claimed (cash realised per ₹ billed)'],
    ['Avg Claim Value (₹)', '', `=IFERROR(B3/B2,0)`, 'Total Claimed ÷ Total Claims'],
    ['Avg Realisation per Claim (₹)', '', `=IFERROR(B5/B2,0)`, 'Total Settled ÷ Total Claims'],
    ['EBITDA Proxy (₹)', '', `=B5-B9`, 'Settled minus TDS (gross cash margin proxy)'],
    ['Disallowed (Leakage) (₹)', '', `=MAX(0,B3-B4-B6)`, 'Claimed − Approved − Shortfall'],
    ['Uncollected (₹)', '', `=MAX(0,B4-B5-B7-B9)`, 'Approved − Settled − Copay − TDS'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(kpi);
  ws2['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 40 }, { wch: 60 }];

  // ===== Sheet 3: AR Aging =====
  const ar: any[][] = [
    ['Bucket', 'Claims', 'Pending Value (₹)', 'Definition'],
  ];
  const bucketDef: Record<string, string> = {
    '0-30': 'Admission within last 30 days — fresh claims, normal cycle',
    '31-60': '31–60 days old — active follow-up window',
    '61-90': '61–90 days old — at-risk, escalate to TPA',
    '91-180': '91–180 days old — high-risk, formal escalation',
    '180+': 'Over 180 days — critical, provisioning candidate',
  };
  Object.entries(global.ageBuckets).forEach(([k, v]) => {
    ar.push([k, v.cnt, v.val, bucketDef[k] || '']);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(ar);
  ws3['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 55 }];

  // ===== Sheet 4: TPA / Payer Performance =====
  const tpa: any[][] = [
    ['TPA / Payer', 'Claims', 'Claimed (₹)', 'Approved (₹)', 'Settled (₹)', 'Denied #', 'Approval %', 'Collection %', 'Denial %', 'Avg TAT (Days)'],
  ];
  global.tpaArr.forEach(t => {
    tpa.push([
      t.k, t.v.cnt, t.v.claimed, t.v.approved, t.v.settled, t.v.denied,
      t.approvalRate / 100, t.collRate / 100, t.denialRate / 100, t.avgTAT,
    ]);
  });
  const ws4 = XLSX.utils.aoa_to_sheet(tpa);
  // Percent format on last cols
  for (let i = 1; i < tpa.length; i++) {
    [6, 7, 8].forEach(c => {
      const addr = XLSX.utils.encode_cell({ r: i, c });
      if (ws4[addr]) ws4[addr].z = '0.0%';
    });
  }
  ws4['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];

  // ===== Sheet 5: Revenue Leakage =====
  const leak: any[][] = [
    ['Leakage Bucket', 'Value (₹)', 'Formula', 'Explanation'],
    ['Payer Deduction', global.leakageData.payerDed, '= Claimed − Approved − Shortfall', 'Amount permanently disallowed by payer (not recoverable from patient)'],
    ['Shortfall (Patient Recoverable)', global.leakageData.shortfall, '= Sum of Shortfall column', 'Disallowed by payer but billable to patient'],
    ['Uncollected from Payer', global.leakageData.uncollected, '= Approved − Settled − Copay − TDS', 'Approved but cash not received; AR follow-up needed'],
    ['Denied Claim Value', global.leakageData.deniedVal, '= Σ Claimed where Status ∈ Denied list', 'Claims with denied / reconsideration status'],
    ['Copay Due', global.leakageData.copayDue, '= Sum of Copay column', 'Patient-share, collect at discharge'],
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(leak);
  ws5['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 40 }, { wch: 60 }];

  // ===== Sheet 6: Definitions & Methodology =====
  const def: any[][] = [
    ['Field / Metric', 'Definition / Formula'],
    ['Status Category — Denied', DENIED.join(', ')],
    ['Status Category — Valid / Closed', VALID_CLOSED.join(', ')],
    ['Status Category — Removed', REMOVED.join(', ')],
    ['Status Category — Active / Pending', 'All other statuses (pre-auth in progress, query, etc.)'],
    ['Age (Days)', 'TODAY() − Admission Date'],
    ['AR Aging Bucket', '0-30, 31-60, 61-90, 91-180, 180+ days based on Age'],
    ['TAT Adm→Payment', 'Payment Date − Admission Date (days)'],
    ['Approval %', 'Approved Amt ÷ Claimed Amt'],
    ['Collection %', 'Settled Amt ÷ Approved Amt'],
    ['Net Yield %', 'Settled Amt ÷ Claimed Amt (cash realised per ₹ billed)'],
    ['Disallowed Amt', 'MAX(0, Claimed − Approved − Shortfall)'],
    ['Uncollected Amt', 'MAX(0, Approved − Settled − Copay − TDS)'],
    ['EBITDA Proxy', 'Settled − TDS'],
    ['Hospital Health Score', 'Weighted blend: Approval (25%) + Collection (25%) + Denial-inverse (20%) + AR<90d (15%) + TAT-inverse (15%)'],
    [],
    ['Notes', ''],
    ['Currency', 'All amounts in ₹ (Indian Rupees)'],
    ['Data source', 'Claims sheet — generated from the uploaded Excel after data quality filter'],
    ['Filters applied', 'Period / Date range as set in the dashboard at the time of export'],
    ['Generated on', new Date().toLocaleString('en-IN')],
  ];
  const ws6 = XLSX.utils.aoa_to_sheet(def);
  ws6['!cols'] = [{ wch: 36 }, { wch: 90 }];

  // ===== Build workbook =====
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws2, 'KPI Summary');
  XLSX.utils.book_append_sheet(wb, ws1, 'Claims');
  XLSX.utils.book_append_sheet(wb, ws3, 'AR Aging');
  XLSX.utils.book_append_sheet(wb, ws4, 'TPA Performance');
  XLSX.utils.book_append_sheet(wb, ws5, 'Revenue Leakage');
  XLSX.utils.book_append_sheet(wb, ws6, 'Definitions');

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = (global.hospitalName || 'Hospital').replace(/[^a-z0-9]/gi, '_');
  XLSX.writeFile(wb, `RCM_Claims_Export_${safeName}_${stamp}.xlsx`);
}