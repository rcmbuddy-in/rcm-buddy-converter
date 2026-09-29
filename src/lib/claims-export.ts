import * as XLSX from 'xlsx';
import { ClaimRecord, GlobalData } from './rcm-data';
import { GAP_BUCKETS, allocateGap, computeGapBuckets } from './gap-buckets';

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

function category(x: ClaimRecord): string {
  const status = x.status;
  if (REMOVED.includes(status)) return 'Removed (Cancelled)';
  // Zero-approval claims are denials, never receivables
  if (DENIED.includes(status) || (x.approvedAmt <= 0 && x.settledAmt <= 0)) return 'Denied';
  if (VALID_CLOSED.includes(status)) return 'Valid / Closed';
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
    'Status Category', 'AR Age (Days since Submission)', 'AR Aging Bucket',
    'Payer TAT Submission→Payment (Days)', 'Approval %', 'Collection %', 'Net Yield %',
    'Disallowed Amt', 'Uncollected Amt', 'AR Outstanding (Approved Balance)',
  ];

  const rows: any[][] = [header];
  data.forEach((x, i) => {
    const r = i + 2; // excel row (1-indexed, after header)
    const anc = x.docSubmit || x.discharge || x.admission;
    const age = anc ? Math.round((today.getTime() - anc.getTime()) / 86400000) : '';
    rows.push([
      x.hospital, fmtDate(x.admission), fmtDate(x.discharge), x.tpa, x.insurer, fmtDate(x.claimCreated),
      x.claimedAmt, x.approvedAmt, x.copay, x.shortfall, x.discount, x.patientPaid,
      x.settledAmt, x.tdsAmt, x.status, fmtDate(x.docSubmit), fmtDate(x.paymentDate),
      x.treatment, x.diagnosis, x.policyType, x.policyHolder,
      category(x),
      age,
      bucket(age),
      dayDiff(x.docSubmit || x.discharge, x.paymentDate),
      { f: `IFERROR(H${r}/G${r},0)` },
      { f: `IFERROR(M${r}/H${r},0)` },
      { f: `IFERROR(M${r}/G${r},0)` },
      { f: `IF(V${r}="Denied",0,MAX(0,G${r}-H${r}-J${r}))` },
      { f: `IF(O${r}="Settled",MAX(0,H${r}-M${r}-I${r}-N${r}),0)` },
      { f: `IF(V${r}="Active / Pending",MAX(0,H${r}-M${r}-N${r}-I${r}),0)` },
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
    ['Total Patient Paid (₹)', global.totalPatientCollected, `=SUMPRODUCT((Claims!L2:L${lastRow}>=Claims!I2:I${lastRow})*(Claims!L2:L${lastRow}>0)*Claims!L2:L${lastRow}+(1-(Claims!L2:L${lastRow}>=Claims!I2:I${lastRow})*(Claims!L2:L${lastRow}>0))*(Claims!L2:L${lastRow}+Claims!I2:I${lastRow}))`, 'Patient collection; copay counted once (if Patient Paid ≥ Copay it already includes copay)'],
    [],
    ['Approval Rate %', '', `=IFERROR(B4/B3,0)`, 'Total Approved ÷ Total Claimed'],
    ['Net Collection %', '', `=IFERROR((SUMIFS(Claims!M2:M${lastRow},Claims!O2:O${lastRow},"Settled")+SUMIFS(Claims!N2:N${lastRow},Claims!O2:O${lastRow},"Settled")+SUMIFS(Claims!I2:I${lastRow},Claims!O2:O${lastRow},"Settled"))/SUMIFS(Claims!H2:H${lastRow},Claims!O2:O${lastRow},"Settled"),0)`, '(Settled + TDS + Copay) ÷ Approved, Settled claims only'],
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
    ['Status Category — Denied', DENIED.join(', ') + '; plus any non-cancelled claim with zero approved amount'],
    ['Status Category — Valid / Closed', VALID_CLOSED.join(', ')],
    ['Status Category — Removed', REMOVED.join(', ')],
    ['Status Category — Active / Pending', 'All other statuses (pre-auth in progress, query, etc.)'],
    ['Age (Days)', 'TODAY() − Admission Date'],
    ['AR Aging Bucket', '0-30, 31-60, 61-90, 91-180, 180+ days based on Age'],
    ['Payer TAT', 'Payment Date − Doc Submission Date (fallback Discharge) in days'],
    ['AR Ageing', 'Today − Doc Submission Date (fallback Discharge, then Admission)'],
    ['Leakage', 'Mutually exclusive: Denied (full claimed) + Payer Deduction & Shortfall (non-denied) + Short-settled (Settled only)'],
    ['Approval %', 'Approved Amt ÷ Claimed Amt'],
    ['Collection %', 'Row level: Settled ÷ Approved. KPI level: (Settled + TDS + Copay) ÷ Approved, Settled claims only'],
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

  // ===== Sheet 7: Source Mapping =====
  // Maps every on-screen chart/KPI to the exact sheet, rows, and Excel formulas
  const srcMap: any[][] = [
    ['Dashboard Tab', 'Chart / KPI Name', 'Excel Sheet', 'Cell / Row Ref', 'Formula / Derivation', 'Description'],

    // Overview Tab
    ['Overview', 'Total Claims', 'KPI Summary', 'B2', '=COUNTA(Claims!A2:A{last})', 'Count of all claim records'],
    ['Overview', 'Total Billed', 'KPI Summary', 'B3', '=SUM(Claims!G2:G{last})', 'Gross claimed from payers'],
    ['Overview', 'Total Approved', 'KPI Summary', 'B4', '=SUM(Claims!H2:H{last})', 'Amount approved by payers'],
    ['Overview', 'Total Collected', 'KPI Summary', 'B5', '=SUM(Claims!M2:M{last})', 'Cash received from payers'],
    ['Overview', 'Patient Paid (incl. Copay)', 'KPI Summary', 'B10', 'SUMPRODUCT: Patient Paid if ≥ Copay, else Patient Paid + Copay', 'Copay never double-counted'],
    ['Overview', 'Claim Approval Rate', 'KPI Summary', 'B12', '=IFERROR(B4/B3,0)', 'Approved ÷ Claimed'],
    ['Overview', 'Net Collection Rate', 'KPI Summary', 'B13', '=IFERROR((SUMIFS(Claims!M2:M{last},Claims!O2:O{last},"Settled")+SUMIFS(Claims!N2:N{last},Claims!O2:O{last},"Settled")+SUMIFS(Claims!I2:I{last},Claims!O2:O{last},"Settled"))/SUMIFS(Claims!H2:H{last},Claims!O2:O{last},"Settled"),0)', '(Settled + TDS + Copay) ÷ Approved, Settled claims only'],
    ['Overview', 'Payer TAT', 'Claims', 'Y2:Y{last}', '=Payment Date − Doc Submit Date', 'Average of column Y for settled claims'],
    ['Overview', 'Denial Rate', 'Claims', 'V2:V{last}', '=COUNTIF(V2:V{last},"Denied") / COUNTA(V2:V{last})', 'Denied status category ÷ total'],
    ['Overview', 'Pending AR', 'Claims', 'V2:V{last}', '=SUMIF(V2:V{last},"Active / Pending",AE2:AE{last})', 'Sum of approved balance still due on open claims'],
    ['Overview', 'Claim Status Distribution', 'Claims', 'V2:V{last}', 'COUNTIF by Status Category', 'Pie chart of Status Category counts'],
    ['Overview', 'Monthly Claims — Volume', 'Claims', 'B2:B{last}', 'Pivot by month of Admission Date', 'Bar: count of claims per month'],
    ['Overview', 'Monthly Claims — Amount', 'Claims', 'G2:G{last}', 'SUMIF by month of Admission Date', 'Bar: sum of Claimed Amt per month'],
    ['Overview', 'Monthly Claims — Avg/Claim', 'Claims', 'G2:G{last}', 'SUMIF÷COUNTIF by month', 'Line: average claim value per month'],
    ['Overview', 'Top TPAs by Volume', 'TPA Performance', 'A2:D{tpalast}', 'Ranked by Claims column', 'Horizontal bar of claim count per TPA'],
    ['Overview', 'Policy Type Split', 'Claims', 'T2:T{last}', 'COUNTIF by Policy Type', 'Pie chart of policy type distribution'],
    ['Overview', 'Hospital Health Score', 'KPI Summary', '—', 'Weighted: Appr(25%)+Coll(25%)+Denial-inv(20%)+AR<90d(15%)+TAT-inv(15%)', 'Composite 0-100 score'],
    ['Overview', 'Leakage Banner Total', 'Revenue Leakage', 'B2:B5', '=SUM(Revenue Leakage!B2:B5)', 'Sum of all leakage buckets'],

    // Financial Tab
    ['Financial', 'Gross Billed', 'KPI Summary', 'B3', '=SUM(Claims!G2:G{last})', 'Same as Total Claimed'],
    ['Financial', 'Net Collected', 'KPI Summary', 'B5', '=SUM(Claims!M2:M{last})', 'Same as Total Settled'],
    ['Financial', 'EBITDA Impact (proxy)', 'KPI Summary', 'B16', '=B5-B9', 'Settled minus TDS'],
    ['Financial', 'Billed − Collected Gap', 'KPI Summary', 'B3,B5', '=B3-B5', 'Claimed − Settled; split into recoverable vs written-off by owner on the Money Chase sheet'],
    ['Financial', 'Approval Rate', 'KPI Summary', 'B12', '=IFERROR(B4/B3,0)', 'Same as Overview'],
    ['Financial', 'Payer Deduction %', 'KPI Summary', 'B3,B4,B6', '=IFERROR((B3-B4-B6)/B3,0)', '(Claimed − Approved − Shortfall) ÷ Claimed'],
    ['Financial', 'Net Collection Rate', 'KPI Summary', 'B13', '=IFERROR((SUMIFS(Claims!M2:M{last},Claims!O2:O{last},"Settled")+SUMIFS(Claims!N2:N{last},Claims!O2:O{last},"Settled")+SUMIFS(Claims!I2:I{last},Claims!O2:O{last},"Settled"))/SUMIFS(Claims!H2:H{last},Claims!O2:O{last},"Settled"),0)', 'Same as Overview'],
    ['Financial', 'Shortfall Rate', 'KPI Summary', 'B6,B3', '=IFERROR(B6/B3,0)', 'Shortfall ÷ Claimed'],
    ['Financial', 'Average Claim Value Waterfall', 'Claims', 'G2:G{last}, H2:H{last}, etc.', 'Step-down: Billed → Approved → After SF → After Copay → After Disc → Settled → After TDS', 'Waterfall of avg per-claim amounts'],
    ['Financial', 'Deduction Breakdown', 'Claims', 'G2:G{last}, H2:H{last}, etc.', 'SUM of: Net Settled, Payer Deductions, Shortfall, Copay, Discount, TDS', 'Pie of where billed amount goes'],
    ['Financial', 'Deduction % Trend', 'Claims', 'B2:F{last}', 'Quarterly SUM(Claimed) − SUM(Settled) ÷ SUM(Claimed)', 'Quarterly leakage trajectory'],
    ['Financial', 'Insurer Profitability', 'TPA Performance', 'A2:J{tpalast}', 'Settled ÷ Claimed per insurer', 'Net yield % by insurer'],
    ['Financial', 'Insurer Profitability Ranking', 'TPA Performance', 'A2:J{tpalast}', 'Same as above, sorted by settled desc', 'Table of insurer KPIs'],
    ['Financial', 'Financial Summary by Quarter', 'Claims', 'B2:F{last}', 'Quarterly aggregation of claimed, approved, settled', 'Quarterly table with approval & collection %'],

    // Denial Tab
    ['Denial', 'Pre-Auth Approved', 'Claims', 'O2:O{last}', '=COUNTIFS(O2:O{last},"Pre Auth Approved") + COUNTIFS(...,"Discharge Approved")', 'Count of approved pre-auth statuses'],
    ['Denial', 'Pre-Auth Denied', 'Claims', 'O2:O{last}', '=COUNTIFS(O2:O{last},"Pre Auth Denied")', 'Count of Pre Auth Denied'],
    ['Denial', 'Overall Denial Rate', 'Claims', 'V2:V{last}', '=COUNTIF(V2:V{last},"Denied") / COUNTA(V2:V{last})', 'Denied category ÷ total claims'],
    ['Denial', 'Denied Claim Value', 'Claims', 'G2:G{last}, V2:V{last}', '=SUMIF(V2:V{last},"Denied",G2:G{last})', 'Sum claimed where status category = Denied'],
    ['Denial', 'Preventable Denials', 'Claims', 'O2:O{last}', 'Count of statuses: Pre Auth Denied, Claim Denied, etc. (excluding Cancellation)', 'Denials with reconsideration potential'],
    ['Denial', 'Recovery Probability', 'Claims', 'W2:W{last}, V2:V{last}', 'Count of denied claims where Age < 30 days ÷ total denied', '% of denials still within appeal window'],
    ['Denial', 'Preventable vs Non-Preventable', 'Claims', 'O2:O{last}, G2:G{last}', 'Sum of claimed by preventable flag', 'Bar chart split by preventability'],
    ['Denial', 'Top Preventable Reasons', 'Claims', 'O2:O{last}', 'COUNTIF by specific denied status', 'Horizontal bar of top denied statuses'],
    ['Denial', 'Pre-Auth: Approved vs Denied', 'Claims', 'O2:O{last}', 'COUNTIF by Pre Auth Approved / Pre Auth Denied', 'Bar chart of pre-auth outcomes'],
    ['Denial', 'TPA-wise Denial Rate', 'TPA Performance', 'A2:J{tpalast}', 'Denied # ÷ Claims per TPA', 'Horizontal bar of denial % by TPA'],
    ['Denial', 'Denial Reasons', 'Claims', 'O2:O{last}', 'COUNTIF by exact Status', 'Pie chart of denial status distribution'],
    ['Denial', 'Denial Detail by TPA', 'TPA Performance', 'A2:J{tpalast}', 'Full TPA Performance table', 'Table: total, denied, denial %, denied value'],

    // TAT Tab
    ['TAT', 'Submission TAT', 'Claims', 'Y2:Y{last} (Adm→DocSubmit)', '=Doc Submit Date − Admission Date', 'Avg days from admission to document submission'],
    ['TAT', 'Payment TAT', 'Claims', 'Y2:Y{last} (DocSubmit→Payment)', '=Payment Date − Doc Submit Date', 'Avg days from submission to payment'],
    ['TAT', 'End-to-End TAT', 'Claims', 'Y2:Y{last}', '=Payment Date − Admission Date', 'Avg days admission to settlement'],
    ['TAT', 'Length of Stay', 'Claims', 'C2:C{last}, B2:B{last}', '=Discharge Date − Admission Date', 'Avg days from admission to discharge'],
    ['TAT', 'Discharge-to-Settle', 'Claims', 'Q2:Q{last}, C2:C{last}', '=Payment Date − Discharge Date', 'Avg days post-discharge to clearance'],
    ['TAT', 'TPA-wise Average Payment TAT', 'TPA Performance', 'A2:J{tpalast}', 'Avg TAT (Days) column', 'Horizontal bar of avg TAT per TPA'],
    ['TAT', 'Length of Stay Distribution', 'Claims', 'C2:C{last}, B2:B{last}', 'Bucketed counts: 1-3, 4-7, 8-14, 15-30, 31+ days', 'Bar chart of LOS buckets'],
    ['TAT', 'TAT Breakdown by Stage', 'Claims', 'B2:Q{last}', 'MIN/MAX/AVERAGE of date differences by stage', 'Table of stage-wise TAT stats'],

    // AR Tab
    ['AR', 'Total Pending AR', 'Claims', 'V2:V{last}, G2:G{last}', '=SUMIF(V2:V{last},"Active / Pending",AE2:AE{last})', 'Approved balance outstanding on open claims (zero-approval claims excluded as denials)'],
    ['AR', 'AR-to-Revenue Ratio', 'KPI Summary', 'B3 + Pending AR', '=Pending AR ÷ Total Claimed', '% of billed still outstanding'],
    ['AR', '90+ Day Aged Claims', 'AR Aging', 'A4:A5', '=SUM(AR Aging!B4:B5) claims; =SUM(AR Aging!C4:C5) value', '91-180 + 180+ buckets'],
    ['AR', '180+ Day Claims', 'AR Aging', 'A5', '=AR Aging!B5 claims; =AR Aging!C5 value', 'Critical age bucket'],
    ['AR', 'AR Aging Distribution', 'AR Aging', 'A2:D6', 'All buckets: count & value', 'Bar chart of outstanding value by age'],
    ['AR', 'Claims Pipeline', 'Claims', 'O2:O{last}', 'COUNTIF by Status for pending claims', 'Pie chart of open claim statuses'],
    ['AR', 'AR Aging Detail', 'AR Aging', 'A2:D6', 'Same as chart, tabular', 'Table: bucket, claims, value, % of AR'],

    // Payer Tab
    ['Payer', 'Active TPAs', 'TPA Performance', 'A2:A{tpalast}', 'COUNTA of unique TPA names', 'Number of distinct payers'],
    ['Payer', 'Top Payer by Volume', 'TPA Performance', 'A2:D{tpalast}', 'MAX of Claims column', 'TPA with highest claim count'],
    ['Payer', 'Best Approval Rate', 'TPA Performance', 'G2:G{tpalast}', 'MAX of Approval % column', 'TPA with highest approval %'],
    ['Payer', 'Worst Approval Rate', 'TPA Performance', 'G2:G{tpalast}', 'MIN of Approval % column', 'TPA with lowest approval %'],
    ['Payer', 'Payer Concentration', 'TPA Performance', 'A2:D{tpalast}, KPI Summary B3', '=Top TPA Claimed ÷ Total Claimed', '% share of largest payer'],
    ['Payer', 'TPA-wise Approval Rate', 'TPA Performance', 'A2:G{tpalast}', 'Approval % column, sorted desc', 'Horizontal bar of approval %'],
    ['Payer', 'Revenue Concentration', 'TPA Performance', 'A2:E{tpalast}', 'Settled column, top 8', 'Pie chart of settled amount by payer'],
    ['Payer', 'Net Collection Rate by TPA', 'TPA Performance', 'A2:H{tpalast}', 'Collection % column, sorted desc', 'Horizontal bar of collection %'],
    ['Payer', 'Full Payer Scorecard', 'TPA Performance', 'A2:J{tpalast}', 'All columns per TPA', 'Complete table with grade calculation'],

    // Leakage Tab
    ['Leakage', 'Total Recoverable Leakage', 'Revenue Leakage', 'B2:B5', '=SUM(Revenue Leakage!B2:B5)', 'Sum of all 4 leakage buckets'],
    ['Leakage', 'Payer Deductions', 'Revenue Leakage', 'B2', '=MAX(0,Claimed−Approved−Shortfall) or KPI B17', 'Permanently disallowed by payer'],
    ['Leakage', 'Policy Shortfall', 'Revenue Leakage', 'B3', '=SUM(Claims!J2:J{last})', 'Sum of Shortfall column'],
    ['Leakage', 'Uncollected Approved', 'Revenue Leakage', 'B4', '=MAX(0,Approved−Settled−Copay−TDS) or KPI B18', 'Approved but cash not received'],
    ['Leakage', 'Denied Claims Value', 'Revenue Leakage', 'B5', '=SUMIF(V2:V{last},"Denied",G2:G{last})', 'Sum claimed for denied status category'],
    ['Leakage', 'Leakage Composition', 'Revenue Leakage', 'A2:B5', 'All 4 buckets as pie data', 'Pie chart of leakage breakdown'],
    ['Leakage', 'TPA-wise Revenue Leakage', 'TPA Performance', 'A2:E{tpalast}', 'Payer Deduction + Shortfall per TPA', 'Horizontal bar of leakage by TPA'],
    ['Leakage', 'Leakage Recovery by Payer', 'TPA Performance', 'A2:J{tpalast}', 'Full TPA Performance with deduction & shortfall', 'Table of leakage opportunities per payer'],

    // Cash Flow Tab
    ['Cash Flow', 'Total Open AR', 'AR Aging / Claims', 'Pending sum', '=SUMIF(V2:V{last},"Active / Pending",AE2:AE{last})', 'Same as AR tab'],
    ['Cash Flow', 'Expected (90 days)', 'Claims', 'G2:G{last}, W2:W{last}', 'Open claims × payer historical realization rate, bucketed by projected days', 'Forecast using payer-specific rates'],
    ['Cash Flow', 'Beyond 90 Days', 'Claims', 'G2:G{last}', 'Remaining open AR not in 90-day buckets', 'Long-tail collection estimate'],
    ['Cash Flow', 'At-Risk Receivables', 'Claims', 'G2:G{last}, W2:W{last}', '180+ day open claims × 50% provision', 'Provisioned at-risk amount'],
    ['Cash Flow', 'Cash Flow by Period', 'Claims', 'G2:G{last}, W2:W{last}', 'Bucketed expected collections: W1-2, W3-4, M2, M3, Beyond', 'Bar chart of forecast buckets'],
    ['Cash Flow', 'Cumulative 90-Day Forecast', 'Claims', 'G2:G{last}, W2:W{last}', 'Running total of weekly expected', 'Line + bar of cumulative forecast'],
    ['Cash Flow', 'Top Payer Forecast', 'TPA Performance', 'A2:J{tpalast}', 'Open claims per TPA × realization rate', 'Table of payer-specific forecasts'],

    // DSO Tab
    ['DSO', 'DSO (Days Sales Outstanding)', 'KPI Summary', 'B3, Pending AR', '=(Pending AR ÷ Total Claimed) × Period Days', 'Industry benchmark: <45d excellent'],
    ['DSO', 'Avg Collection TAT', 'Claims', 'Y2:Y{last}', 'AVERAGE of Payment Date − Admission Date', 'For settled claims only'],
    ['DSO', 'Pending AR', 'Claims', 'V2:V{last}, G2:G{last}', '=SUMIF(V2:V{last},"Active / Pending",AE2:AE{last})', 'Same as AR tab'],
    ['DSO', 'Net Collection Rate', 'KPI Summary', 'B5/B3', '=IFERROR(B5/B3,0)', 'Settled ÷ Claimed'],
    ['DSO', 'Velocity @ 30/60/90 days', 'Claims', 'Y2:Y{last}', '=% of settled claims with TAT ≤ N days', 'Collection speed buckets'],
    ['DSO', 'DSO Trend (Monthly)', 'Claims', 'B2:G{last}', 'Monthly (Pending ÷ Billed) × 30', 'Line + bar of monthly DSO'],
    ['DSO', 'Collection Velocity Curve', 'Claims', 'Y2:Y{last}', 'Cumulative % settled within N days', 'Bar chart of velocity at 15/30/45/60/75/90/120/180d'],
    ['DSO', 'Industry Benchmark Comparison', 'KPI Summary + Claims', 'B3,B5, Y2:Y{last}', 'Derived from DSO, TAT, Net Collection, Velocity', 'Table vs industry standards'],

    // MoM Tab
    ['MoM', 'Latest Month Volume', 'Claims', 'B2:B{last}', 'COUNTIF by latest month of Admission Date', 'Current month claim count'],
    ['MoM', 'Latest Billed', 'Claims', 'G2:G{last}', 'SUMIF by latest month', 'Current month billed amount'],
    ['MoM', 'Latest Collected', 'Claims', 'M2:M{last}', 'SUMIF by latest month', 'Current month settled amount'],
    ['MoM', 'Approval Rate Trend', 'Claims', 'G2:G{last}, H2:H{last}', 'Monthly SUM(Approved)÷SUM(Claimed)', 'Line chart of monthly approval %'],
    ['MoM', 'Collection Rate Trend', 'Claims', 'H2:H{last}, M2:M{last}', 'Monthly SUM(Settled)÷SUM(Approved)', 'Line chart of monthly collection %'],
    ['MoM', 'Denial Rate Trend', 'Claims', 'V2:V{last}', 'Monthly COUNTIF(Denied)÷COUNTA', 'Line chart of monthly denial %'],
    ['MoM', 'Monthly Claims Volume', 'Claims', 'B2:B{last}', 'COUNTIF by month', 'Bar/line of claims per month'],
    ['MoM', 'Revenue Trend (Billed vs Settled)', 'Claims', 'G2:G{last}, M2:M{last}', 'SUMIF by month for claimed & settled', 'Dual line chart of monthly revenue'],
    ['MoM', 'Monthly Performance Table', 'Claims', 'B2:M{last}', 'All monthly aggregates', 'Table of all metrics by month'],

    // Corporate Tab
    ['Corporate', 'Corporate Claims', 'Claims', 'U2:U{last}', 'COUNTIF where Policy Holder is non-blank', 'Count of corporate policy claims'],
    ['Corporate', 'Corporate Billed', 'Claims', 'G2:G{last}, U2:U{last}', 'SUMIF where Policy Holder is non-blank', 'Billed amount for corporate claims'],
    ['Corporate', 'Corporate Collected', 'Claims', 'M2:M{last}, U2:U{last}', 'SUMIF where Policy Holder is non-blank', 'Settled amount for corporate claims'],
    ['Corporate', 'Approval Rate (Corp)', 'Claims', 'G2:G{last}, H2:H{last}, U2:U{last}', 'SUMIF(Approved)÷SUMIF(Claimed) for corporate', 'Corporate-specific approval %'],
    ['Corporate', 'Net Collection Rate (Corp)', 'Claims', 'H2:H{last}, M2:M{last}, U2:U{last}', '(Settled + TDS + Copay) ÷ Approved on Settled corporate claims', 'Corporate-specific collection %'],
    ['Corporate', 'Denial Rate (Corp)', 'Claims', 'O2:O{last}, U2:U{last}', 'COUNTIF(Denied)÷COUNTA for corporate', 'Corporate-specific denial %'],
    ['Corporate', 'Top Corporates by Volume', 'Claims', 'U2:U{last}', 'COUNTIF by Policy Holder', 'Horizontal bar of top policy holders'],
    ['Corporate', 'Corporate Monthly Trend', 'Claims', 'B2:G{last}, U2:U{last}', 'Monthly COUNTIF/SUMIF filtered by corporate', 'Line/bar of corporate monthly data'],
    ['Corporate', 'Top Corporate Scorecard', 'Claims', 'U2:U{last}, G2:M{last}', 'Aggregated by Policy Holder', 'Table of corporate performance'],

    // Payer Profitability Tab
    ['Payer Profitability', 'Net Margin (Overall)', 'TPA Performance', 'A2:J{tpalast}', '=(Settled − TAT Cost − Deduction − Denial) ÷ Claimed, weighted', 'Overall net margin after all costs'],
    ['Payer Profitability', 'Total Deduction Cost', 'TPA Performance', 'A2:J{tpalast}', '=MAX(0,Claimed−Approved) per TPA, summed', 'Sum of payer deductions across all TPAs'],
    ['Payer Profitability', 'Total Denial Cost', 'TPA Performance', 'A2:J{tpalast}', '=Denied Value per TPA, summed', 'Sum of denied claim values'],
    ['Payer Profitability', 'TAT Carrying Cost', 'TPA Performance', 'A2:J{tpalast}', '=(AvgTAT÷365) × CoC × Settled per TPA, summed', 'Cost of capital tied up in TAT'],
    ['Payer Profitability', 'Top Profitable Payers', 'TPA Performance', 'A2:J{tpalast}', 'Net Margin % column, sorted desc', 'Horizontal bar of top net margins'],
    ['Payer Profitability', 'Lowest Margin Payers', 'TPA Performance', 'A2:J{tpalast}', 'Net Margin % column, sorted asc', 'Horizontal bar of bottom net margins'],
    ['Payer Profitability', 'TAT vs Margin Scatter', 'TPA Performance', 'A2:J{tpalast}', 'X=Avg TAT, Y=Net Margin %, Z=Claimed', 'Bubble chart of TAT vs margin'],
    ['Payer Profitability', 'Full Payer Scorecard', 'TPA Performance', 'A2:J{tpalast}', 'All profitability columns per payer', 'Complete table with all cost components'],

    // AI Report Tab
    ['AI Report', 'Overall RCM Score', 'KPI Summary', 'B12:B18', 'Weighted blend of Approval, Collection, Denial, AR, TAT scores', 'Composite 0-100 executive score'],
    ['AI Report', 'Financial Score', 'KPI Summary', 'B12,B13', 'score(Approval)×0.4 + score(Collection)×0.3 + score(Deduction)×0.3', 'Financial dimension score'],
    ['AI Report', 'TAT Speed Score', 'Claims', 'Y2:Y{last}', 'score(Submission)×0.3 + score(Payment)×0.4 + score(E2E)×0.3', 'Turnaround dimension score'],
    ['AI Report', 'Denial Mgmt Score', 'Claims', 'V2:V{last}', 'score(DenialRate)×0.5 + score(PreAuthDenial)×0.5', 'Denial control dimension score'],
    ['AI Report', 'AR Health Score', 'AR Aging', 'A2:D6', 'score(180d)×0.4 + score(90d)×0.3 + score(ARratio)×0.3', 'AR quality dimension score'],
    ['AI Report', 'Payer Perf. Score', 'TPA Performance', 'A2:J{tpalast}', 'Average of score(Approval)×0.5 + score(Collection)×0.3 + score(Denial)×0.2', 'Payer benchmarking dimension score'],
    ['AI Report', 'Quick Wins', 'KPI Summary + Claims', 'Multiple', 'Rule-based recommendations from thresholds', 'Actionable recommendations'],
  ];

  const ws7 = XLSX.utils.aoa_to_sheet(srcMap);
  ws7['!cols'] = [{ wch: 22 }, { wch: 38 }, { wch: 18 }, { wch: 22 }, { wch: 55 }, { wch: 55 }];
  ws7['!freeze'] = { xSplit: 0, ySplit: 1 } as any;

  // ===== Sheet 8: Money Chase (Billed − Collected gap by bucket and owner) =====
  const gapList: any[][] = [['Patient', 'IP / UHID', 'TPA', 'Insurer', 'Admission', 'Status', 'Bucket', 'Type', 'Owner', 'Amount (₹)', 'Next Action']];
  data.forEach(x => {
    Object.entries(allocateGap(x, new Date())).forEach(([id, v]) => {
      const b = GAP_BUCKETS.find(g => g.id === id)!;
      gapList.push([x.patientName, x.patientId, x.tpa, x.insurer, x.admission ? x.admission.toISOString().slice(0, 10) : '', x.status, b.label, b.kind === 'recoverable' ? 'Recoverable' : 'Written-off', b.owner, Math.round((v || 0) * 100) / 100, b.action]);
    });
  });
  const gl = gapList.length;
  const gs = computeGapBuckets(data);
  const chase: any[][] = [
    ['Bucket', 'Type', 'Owner', 'Claims', 'Amount (₹)', 'Formula', 'Rule', 'Next Action'],
    ...GAP_BUCKETS.map(b => [b.label, b.kind === 'recoverable' ? 'Recoverable' : 'Written-off', b.owner,
      { f: `COUNTIF(G${2 + GAP_BUCKETS.length + 6}:G${gl + GAP_BUCKETS.length + 6},"${b.label}")` },
      { f: `SUMIF(G${2 + GAP_BUCKETS.length + 6}:G${gl + GAP_BUCKETS.length + 6},"${b.label}",J${2 + GAP_BUCKETS.length + 6}:J${gl + GAP_BUCKETS.length + 6})` },
      'SUMIF of claim list below', b.rule, b.action]),
    ['Total Recoverable', '', '', '', { f: `SUMIF(B2:B${GAP_BUCKETS.length + 1},"Recoverable",E2:E${GAP_BUCKETS.length + 1})` }],
    ['Total Written-off', '', '', '', { f: `SUMIF(B2:B${GAP_BUCKETS.length + 1},"Written-off",E2:E${GAP_BUCKETS.length + 1})` }],
    ['Check: Billed − Settled (claims where billed ≥ settled)', '', '', '', { f: `SUMPRODUCT((Claims!G2:G${lastRow}>Claims!M2:M${lastRow})*(Claims!G2:G${lastRow}-Claims!M2:M${lastRow}))` }, gs.overpaidRows ? `${gs.overpaidRows} claims settled above billed are excluded` : ''],
    [],
    ['Claim-level list'],
    ...gapList,
  ];
  const ws8 = XLSX.utils.aoa_to_sheet(chase);
  ws8['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 34 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 50 }];

  // ===== Build workbook =====
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws2, 'KPI Summary');
  XLSX.utils.book_append_sheet(wb, ws1, 'Claims');
  XLSX.utils.book_append_sheet(wb, ws3, 'AR Aging');
  XLSX.utils.book_append_sheet(wb, ws4, 'TPA Performance');
  XLSX.utils.book_append_sheet(wb, ws5, 'Revenue Leakage');
  XLSX.utils.book_append_sheet(wb, ws8, 'Money Chase');
  XLSX.utils.book_append_sheet(wb, ws6, 'Definitions');
  XLSX.utils.book_append_sheet(wb, ws7, 'Source Mapping');

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = (global.hospitalName || 'Hospital').replace(/[^a-z0-9]/gi, '_');
  XLSX.writeFile(wb, `RCM_Claims_Export_${safeName}_${stamp}.xlsx`);
}