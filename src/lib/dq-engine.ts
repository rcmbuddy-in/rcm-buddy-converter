import { ClaimRecord } from './rcm-data';
import { ddiff } from './rcm-utils';
import * as XLSX from 'xlsx';

export type Severity = 'clean' | 'warning' | 'error' | 'critical';

export interface RowFlag {
  rowIndex: number;
  severity: Severity;
  layer: 1 | 2 | 3 | 4;
  rule: string;
  message: string;
  field?: string;
}

export interface AggregateAlert {
  metric: string;
  value: string;
  expected: string;
  severity: Severity;
}

export interface DQReport {
  fileName?: string;
  fileRejected: boolean;
  rejectReason?: string;
  totalRows: number;
  cleanRows: number;
  warningRows: number;
  errorRows: number;
  criticalRows: number;
  flagsByRule: Record<string, { count: number; severity: Severity; layer: number; sampleMessage: string }>;
  rowFlags: Map<number, RowFlag[]>;
  cleanData: ClaimRecord[];
  quarantined: { record: ClaimRecord; rowIndex: number; flags: RowFlag[] }[];
  layerSummary: { layer: number; checks: number; failed: number; rules: string[] }[];
  aggregateAlerts: AggregateAlert[];
  rawRows: any[];
}

/* ---------- Layer 1 helpers (raw header inspection) ---------- */
const REQUIRED_HEADER_GROUPS: { label: string; aliases: string[] }[] = [
  { label: 'Claim Number', aliases: ['Claim No', 'Claim Number', 'ClaimNo', 'Claim ID'] },
  { label: 'Patient Name', aliases: ['Patient Name', 'PatientName', 'Patient'] },
  { label: 'Admission Date', aliases: ['Date of Admission', 'Admission Date', 'DOA'] },
  { label: 'Claimed Amount', aliases: ['Claimed Amount', 'Claim Amount', 'ClaimedAmount', 'ClaimAmount'] },
  { label: 'Status', aliases: ['Claim Status', 'Status', 'ClaimStatus'] },
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findHeader(headers: string[], aliases: string[]): string | null {
  const norm = headers.map(h => ({ raw: h, n: normalize(h) }));
  for (const a of aliases) {
    const an = normalize(a);
    const hit = norm.find(h => h.n === an);
    if (hit) return hit.raw;
  }
  for (const a of aliases) {
    const an = normalize(a);
    const hit = norm.find(h => h.n.includes(an) || an.includes(h.n));
    if (hit) return hit.raw;
  }
  return null;
}

function getRaw(row: any, aliases: string[]): any {
  const keys = Object.keys(row);
  for (const a of aliases) {
    if (row[a] !== undefined && row[a] !== null && row[a] !== '') return row[a];
  }
  for (const a of aliases) {
    const an = normalize(a);
    for (const k of keys) {
      if (normalize(k) === an && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
  }
  return null;
}

/* ---------- Treatment dictionary for Layer 4 ---------- */
const TREATMENT_RULES: { match: RegExp; minAmt?: number; maxAmt?: number; label: string }[] = [
  { match: /catarac/i, maxAmt: 200000, label: 'Cataract typically < ₹2L' },
  { match: /dialys/i, minAmt: 5000, maxAmt: 50000, label: 'Dialysis typically ₹5k–₹50k per session' },
  { match: /\b(normal\s*)?delivery\b/i, maxAmt: 150000, label: 'Normal delivery typically < ₹1.5L' },
  { match: /appendec|appendic/i, maxAmt: 200000, label: 'Appendectomy typically < ₹2L' },
  { match: /tonsil/i, maxAmt: 100000, label: 'Tonsillectomy typically < ₹1L' },
];

const CLOSED_STATUSES = ['settled', 'closed', 'completed', 'paid'];
function isClosedStatus(s: string): boolean {
  const lo = s.toLowerCase();
  return CLOSED_STATUSES.some(c => lo.includes(c));
}

/* ---------- Engine ---------- */
export function runDataQuality(
  rawRows: any[],
  parsed: ClaimRecord[],
  fileName?: string
): DQReport {
  const rowFlags = new Map<number, RowFlag[]>();
  const flagsByRule: DQReport['flagsByRule'] = {};

  const layerCounters: Record<number, { checks: number; failed: number; rules: Set<string> }> = {
    1: { checks: 0, failed: 0, rules: new Set() },
    2: { checks: 0, failed: 0, rules: new Set() },
    3: { checks: 0, failed: 0, rules: new Set() },
    4: { checks: 0, failed: 0, rules: new Set() },
  };

  function addFlag(idx: number, flag: Omit<RowFlag, 'rowIndex'>) {
    const f: RowFlag = { ...flag, rowIndex: idx };
    if (!rowFlags.has(idx)) rowFlags.set(idx, []);
    rowFlags.get(idx)!.push(f);
    if (!flagsByRule[f.rule]) {
      flagsByRule[f.rule] = { count: 0, severity: f.severity, layer: f.layer, sampleMessage: f.message };
    }
    flagsByRule[f.rule].count++;
    layerCounters[f.layer].failed++;
    layerCounters[f.layer].rules.add(f.rule);
  }

  /* ---------- LAYER 1: Structural ---------- */
  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const missingHeaders: string[] = [];
  REQUIRED_HEADER_GROUPS.forEach(g => {
    layerCounters[1].checks++;
    if (!findHeader(headers, g.aliases)) {
      missingHeaders.push(g.label);
      layerCounters[1].failed++;
      layerCounters[1].rules.add('missing_required_header');
    }
  });

  // Duplicate header detection (XLSX may suffix "_1" — detect normalized duplicates)
  const headerCounts: Record<string, number> = {};
  headers.forEach(h => {
    const n = normalize(h.replace(/_\d+$/, ''));
    if (n) headerCounts[n] = (headerCounts[n] || 0) + 1;
  });
  const duplicateHeaders = Object.entries(headerCounts).filter(([_, c]) => c > 1).map(([k]) => k);
  layerCounters[1].checks++;
  if (duplicateHeaders.length > 0) {
    layerCounters[1].failed++;
    layerCounters[1].rules.add('duplicate_headers');
  }

  if (missingHeaders.length > 0) {
    return {
      fileName,
      fileRejected: true,
      rejectReason: `Missing mandatory column(s): ${missingHeaders.join(', ')}. Garbage structure = garbage reports — please fix the file and re-upload.`,
      totalRows: rawRows.length,
      cleanRows: 0,
      warningRows: 0,
      errorRows: 0,
      criticalRows: 0,
      flagsByRule: {
        missing_required_header: {
          count: missingHeaders.length,
          severity: 'critical',
          layer: 1,
          sampleMessage: `Missing: ${missingHeaders.join(', ')}`,
        },
      },
      rowFlags,
      cleanData: [],
      quarantined: [],
      layerSummary: Object.entries(layerCounters).map(([l, v]) => ({
        layer: +l, checks: v.checks, failed: v.failed, rules: Array.from(v.rules),
      })),
      aggregateAlerts: [],
      rawRows,
    };
  }

  /* ---------- LAYER 2: Mandatory fields ---------- */
  parsed.forEach((rec, idx) => {
    const raw = rawRows[idx] || {};
    layerCounters[2].checks += 5;

    const isApprovedOrSettled = rec.approvedAmt > 0 || rec.settledAmt > 0 || isClosedStatus(rec.status);

    const claimNoVal = getRaw(raw, ['Claim No', 'Claim Number', 'ClaimNo', 'Claim ID']);
    if (!claimNoVal || String(claimNoVal).trim() === '') {
      addFlag(idx, { layer: 2, severity: 'error', rule: 'missing_claim_no', field: 'Claim No', message: 'Claim Number is blank' });
    }
    const patientVal = getRaw(raw, ['Patient Name', 'PatientName', 'Patient']);
    if (!patientVal || String(patientVal).trim() === '') {
      addFlag(idx, { layer: 2, severity: 'error', rule: 'missing_patient_name', field: 'Patient Name', message: 'Patient Name is blank' });
    }
    if (!rec.admission) {
      addFlag(idx, { layer: 2, severity: 'error', rule: 'missing_admission_date', field: 'Admission Date', message: 'Admission Date is missing' });
    }
    if (!(rec.claimedAmt > 0)) {
      addFlag(idx, { layer: 2, severity: 'error', rule: 'invalid_claimed_amount', field: 'Claimed Amount', message: 'Claimed Amount is missing or ≤ 0' });
    }
    if (!rec.status || rec.status.trim() === '') {
      addFlag(idx, { layer: 2, severity: 'error', rule: 'missing_status', field: 'Status', message: 'Claim Status is blank' });
    }

    // Soft warnings
    layerCounters[2].checks += 4;
    const ipNoVal = getRaw(raw, ['IP No', 'IP Number', 'IPNo', 'IPNumber']);
    if (!ipNoVal && !isApprovedOrSettled) addFlag(idx, { layer: 2, severity: 'warning', rule: 'missing_ip_no', field: 'IP No', message: 'IP Number missing' });
    if (!rec.discharge) addFlag(idx, { layer: 2, severity: 'warning', rule: 'missing_discharge_date', field: 'Discharge Date', message: 'Discharge Date missing' });
    if (!rec.tpa || rec.tpa === 'Unknown') addFlag(idx, { layer: 2, severity: 'warning', rule: 'missing_tpa', field: 'TPA', message: 'TPA Name missing' });
    const policyNoVal = getRaw(raw, ['Policy No', 'Policy Number', 'PolicyNo']);
    if (!policyNoVal && !isApprovedOrSettled) addFlag(idx, { layer: 2, severity: 'warning', rule: 'missing_policy_no', field: 'Policy No', message: 'Policy Number missing' });
  });

  /* ---------- LAYER 3: Business logic ---------- */
  const today = new Date();

  // Pre-build duplicate detection maps
  const claimNoMap = new Map<string, number[]>();
  const compositeMap = new Map<string, number[]>();
  parsed.forEach((rec, idx) => {
    const raw = rawRows[idx] || {};
    const claimNoVal = getRaw(raw, ['Claim No', 'Claim Number', 'ClaimNo', 'Claim ID']);
    if (claimNoVal) {
      const k = String(claimNoVal).trim().toLowerCase();
      if (!claimNoMap.has(k)) claimNoMap.set(k, []);
      claimNoMap.get(k)!.push(idx);
    }
    const patientVal = getRaw(raw, ['Patient Name', 'PatientName', 'Patient']);
    if (patientVal && rec.admission && rec.claimedAmt > 0) {
      const k = `${String(patientVal).trim().toLowerCase()}|${rec.admission.toISOString().slice(0, 10)}|${rec.claimedAmt}`;
      if (!compositeMap.has(k)) compositeMap.set(k, []);
      compositeMap.get(k)!.push(idx);
    }
  });

  parsed.forEach((rec, idx) => {
    // Financial logic
    layerCounters[3].checks += 3;
    if (rec.claimedAmt < 0 || rec.approvedAmt < 0 || rec.settledAmt < 0) {
      addFlag(idx, { layer: 3, severity: 'critical', rule: 'negative_amount', message: 'Negative monetary value detected' });
    }
    if (rec.approvedAmt > rec.claimedAmt && rec.claimedAmt > 0) {
      addFlag(idx, { layer: 3, severity: 'critical', rule: 'approved_gt_claimed', message: `Approved (${rec.approvedAmt}) > Claimed (${rec.claimedAmt})` });
    }
    if (rec.settledAmt > rec.approvedAmt && rec.approvedAmt > 0) {
      addFlag(idx, { layer: 3, severity: 'error', rule: 'settled_gt_approved', message: `Settled (${rec.settledAmt}) > Approved (${rec.approvedAmt})` });
    }

    // Date logic
    layerCounters[3].checks += 3;
    if (rec.admission && rec.discharge && rec.discharge < rec.admission) {
      addFlag(idx, { layer: 3, severity: 'critical', rule: 'discharge_before_admission', message: 'Discharge date is before admission date' });
    }
    if (rec.discharge && rec.claimCreated && rec.claimCreated < rec.discharge) {
      // Preauth submissions are intentionally created before discharge — not a defect. Skip.
    }
    if (rec.claimCreated && rec.paymentDate && rec.paymentDate < rec.claimCreated) {
      addFlag(idx, { layer: 3, severity: 'critical', rule: 'payment_before_claim', message: 'Payment date is before claim date' });
    }

    // TAT escalations (only if claim is still in pipeline)
    layerCounters[3].checks += 3;
    const isSettled = rec.settledAmt > 0 || isClosedStatus(rec.status);
    const isOpen = !isClosedStatus(rec.status) && !rec.status.toLowerCase().includes('denied') && rec.status.toLowerCase() !== 'cancelled';
    // Settled / approved claims are automatically valid — skip TAT and high-risk checks.
    if (isOpen && rec.admission && !isSettled && rec.approvedAmt === 0) {
      const ageDays = ddiff(rec.admission, today) ?? 0;
      if (!rec.docSubmit && ageDays > 3) {
        addFlag(idx, { layer: 3, severity: 'warning', rule: 'tat_no_submission_3d', message: `No submission ${ageDays} days post-admission` });
      }
      if (rec.docSubmit && rec.approvedAmt === 0 && (ddiff(rec.docSubmit, today) ?? 0) > 10) {
        addFlag(idx, { layer: 3, severity: 'error', rule: 'tat_no_approval_10d', message: `No approval > 10 days after submission` });
      }
      if (rec.approvedAmt > 0 && rec.settledAmt === 0 && (ddiff(rec.docSubmit ?? rec.admission, today) ?? 0) > 30) {
        addFlag(idx, { layer: 3, severity: 'critical', rule: 'tat_no_settlement_30d', message: `No settlement > 30 days — critical` });
      }

      // Zero approval intelligence
      layerCounters[3].checks++;
      if (rec.approvedAmt === 0 && ageDays > 7) {
        addFlag(idx, { layer: 3, severity: 'critical', rule: 'high_risk_zero_approval', message: `High Risk Claim — approved=0, age=${ageDays}d` });
      }
    }

    // Process events
    layerCounters[3].checks += 3;
    if (!rec.docSubmit && (isClosedStatus(rec.status))) {
      addFlag(idx, { layer: 3, severity: 'warning', rule: 'process_no_submission', message: 'PROCESS FAILURE — closed claim with no submission date' });
    }
    if (!rec.paymentDate && isClosedStatus(rec.status)) {
      addFlag(idx, { layer: 3, severity: 'warning', rule: 'process_no_payment', message: 'PROCESS FAILURE — closed claim with no payment date' });
    }
    if (!rec.discharge && isClosedStatus(rec.status)) {
      addFlag(idx, { layer: 3, severity: 'warning', rule: 'process_no_discharge', message: 'PROCESS FAILURE — closed claim with no discharge date' });
    }
  });

  // Duplicates (Layer 3)
  layerCounters[3].checks += claimNoMap.size + compositeMap.size;
  claimNoMap.forEach((indices, k) => {
    if (indices.length > 1) {
      indices.forEach(i => addFlag(i, {
        layer: 3, severity: 'error', rule: 'duplicate_claim_no',
        message: `Duplicate Claim No "${k}" appears ${indices.length}× (rows ${indices.map(x => x + 2).join(', ')})`,
      }));
    }
  });
  compositeMap.forEach((indices, _k) => {
    if (indices.length > 1) {
      indices.forEach(i => addFlag(i, {
        layer: 3, severity: 'error', rule: 'duplicate_composite',
        message: `Same Patient + Admission Date + Claimed Amount appears ${indices.length}× — likely double-counted`,
      }));
    }
  });

  /* ---------- LAYER 4: Performance ---------- */
  parsed.forEach((rec, idx) => {
    layerCounters[4].checks++;
    if (rec.claimedAmt > 1000000) {
      addFlag(idx, { layer: 4, severity: 'warning', rule: 'high_value_claim', message: `Outlier claim > ₹10L (₹${rec.claimedAmt.toLocaleString('en-IN')}) — verify` });
    }
    layerCounters[4].checks++;
    if (isClosedStatus(rec.status) && rec.settledAmt === 0 && rec.claimedAmt > 0) {
      addFlag(idx, { layer: 4, severity: 'error', rule: 'closed_zero_settlement', message: 'Closed claim with zero settlement — data integrity issue' });
    }
  });

  // Treatment vs amount sanity
  parsed.forEach((rec, idx) => {
    if (!rec.treatment || rec.claimedAmt <= 0) return;
    layerCounters[4].checks++;
    for (const r of TREATMENT_RULES) {
      if (r.match.test(rec.treatment)) {
        if (r.maxAmt && rec.claimedAmt > r.maxAmt) {
          addFlag(idx, { layer: 4, severity: 'warning', rule: 'treatment_amount_high', message: `${r.label} — got ₹${rec.claimedAmt.toLocaleString('en-IN')} for "${rec.treatment}"` });
        }
        if (r.minAmt && rec.claimedAmt < r.minAmt) {
          addFlag(idx, { layer: 4, severity: 'warning', rule: 'treatment_amount_low', message: `${r.label} — got ₹${rec.claimedAmt.toLocaleString('en-IN')} for "${rec.treatment}"` });
        }
        break;
      }
    }
  });

  // TAT outlier (3× median) — settled claims only
  const settledTATs: { idx: number; t: number }[] = [];
  parsed.forEach((rec, idx) => {
    if (rec.status.toLowerCase() === 'settled' && rec.admission && rec.paymentDate) {
      const t = ddiff(rec.admission, rec.paymentDate);
      if (t !== null && t < 365) settledTATs.push({ idx, t });
    }
  });
  if (settledTATs.length >= 10) {
    const sorted = [...settledTATs].sort((a, b) => a.t - b.t);
    const med = sorted[Math.floor(sorted.length / 2)].t;
    const threshold = Math.max(60, med * 3);
    settledTATs.forEach(({ idx, t }) => {
      layerCounters[4].checks++;
      if (t > threshold) {
        addFlag(idx, { layer: 4, severity: 'warning', rule: 'tat_outlier', message: `TAT ${t}d > 3× median (${med}d)` });
      }
    });
  }

  /* ---------- Aggregate alerts (Layer 4 strategic) ---------- */
  const aggregateAlerts: AggregateAlert[] = [];
  const totalClaimed = parsed.reduce((a, r) => a + r.claimedAmt, 0);
  const totalApproved = parsed.reduce((a, r) => a + r.approvedAmt, 0);
  const denied = parsed.filter(r => r.status.toLowerCase().includes('denied') || r.status.toLowerCase() === 'cancelled');
  const tatVals = parsed.map(r => ddiff(r.admission, r.paymentDate)).filter((v): v is number => v !== null && v < 365);
  const avgTAT = tatVals.length ? tatVals.reduce((a, b) => a + b, 0) / tatVals.length : 0;
  const apprRate = totalClaimed > 0 ? (totalApproved / totalClaimed) * 100 : 0;
  const denRate = parsed.length > 0 ? (denied.length / parsed.length) * 100 : 0;
  if (apprRate < 70 && parsed.length >= 20) aggregateAlerts.push({ metric: 'Approval Rate', value: apprRate.toFixed(1) + '%', expected: '> 70%', severity: 'warning' });
  if (denRate > 15 && parsed.length >= 20) aggregateAlerts.push({ metric: 'Denial Rate', value: denRate.toFixed(1) + '%', expected: '< 10–15%', severity: 'warning' });
  if (avgTAT > 30 && tatVals.length >= 20) aggregateAlerts.push({ metric: 'Average TAT', value: avgTAT.toFixed(1) + ' days', expected: '< 30 days', severity: 'warning' });

  /* ---------- Compute final severity per row ---------- */
  const severityRank: Record<Severity, number> = { clean: 0, warning: 1, error: 2, critical: 3 };
  let cleanCount = 0, warningCount = 0, errorCount = 0, criticalCount = 0;
  const cleanData: ClaimRecord[] = [];
  const quarantined: DQReport['quarantined'] = [];

  parsed.forEach((rec, idx) => {
    const flags = rowFlags.get(idx) || [];
    const max = flags.reduce<Severity>((acc, f) => severityRank[f.severity] > severityRank[acc] ? f.severity : acc, 'clean');
    if (max === 'clean') { cleanCount++; cleanData.push(rec); }
    else if (max === 'warning') { warningCount++; cleanData.push(rec); }
    else if (max === 'error') { errorCount++; quarantined.push({ record: rec, rowIndex: idx, flags }); }
    else { criticalCount++; quarantined.push({ record: rec, rowIndex: idx, flags }); }
  });

  return {
    fileName,
    fileRejected: false,
    totalRows: parsed.length,
    cleanRows: cleanCount,
    warningRows: warningCount,
    errorRows: errorCount,
    criticalRows: criticalCount,
    flagsByRule,
    rowFlags,
    cleanData,
    quarantined,
    layerSummary: Object.entries(layerCounters).map(([l, v]) => ({
      layer: +l, checks: v.checks, failed: v.failed, rules: Array.from(v.rules),
    })),
    aggregateAlerts,
    rawRows,
  };
}

/* ---------- Excel export of error sheet ---------- */
export async function exportDQErrorSheet(report: DQReport): Promise<void> {
  const errorRows = report.quarantined.map(q => {
    const original = report.rawRows[q.rowIndex] ?? {};
    return {
      ...original,
      DQ_Severity: q.flags.reduce<Severity>((acc, f) => {
        const r = { clean: 0, warning: 1, error: 2, critical: 3 } as const;
        return r[f.severity] > r[acc] ? f.severity : acc;
      }, 'clean').toUpperCase(),
      DQ_Rules: q.flags.map(f => f.rule).join(' | '),
      DQ_Messages: q.flags.map(f => `[L${f.layer}] ${f.message}`).join(' || '),
    };
  });

  const summaryRows = Object.entries(report.flagsByRule)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([rule, info]) => ({
      Layer: info.layer,
      Severity: info.severity.toUpperCase(),
      Rule: rule,
      Count: info.count,
      'Sample Message': info.sampleMessage,
    }));

  const layerRows = report.layerSummary.map(l => ({
    Layer: l.layer,
    'Checks Performed': l.checks,
    'Failures': l.failed,
    'Rules Triggered': l.rules.join(', ') || '—',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(errorRows), 'Quarantined Rows');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Issues Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(layerRows), 'Layers');

  const baseName = (report.fileName || 'upload').replace(/\.[^.]+$/, '');
  XLSX.writeFile(wb, `DQ_Errors_${baseName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}