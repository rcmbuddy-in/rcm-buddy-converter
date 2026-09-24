import { ClaimRecord, GlobalData } from './rcm-data';
import { sm, pct, avg, ddiff, fmt, fN , payerTat } from './rcm-utils';

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'good';

export interface Insight {
  severity: InsightSeverity;
  title: string;
  detail: string;
  impact?: string; // financial impact line
  action?: string; // recommended action
}

export interface HealthScore {
  score: number; // 0-100
  band: 'Excellent' | 'Healthy' | 'Watch' | 'At Risk' | 'Critical';
  drivers: { label: string; value: number; weight: number; contribution: number }[];
}

const DENIED = ['Pre Auth Denied', 'Discharge Denied', 'Claim Denied', 'Reconsideration Submitted', 'Enhancement Denied'];
const SETTLED_LIKE = ['Settled', 'Settlement Initiated'];
const isDenied = (s: string) => DENIED.includes(s);
const isClosed = (s: string) => SETTLED_LIKE.includes(s) || isDenied(s) || s === 'Cancelled';

function ageDays(d: Date | null): number {
  if (!d) return 0;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

/** Hospital RCM Health Score — weighted blend of approval, collection, denial, AR aging, TAT */
export function computeHealthScore(g: GlobalData): HealthScore {
  const { data, totalClaimed, totalApproved, totalSettled, ageBuckets } = g;
  const approvalRate = pct(totalApproved, totalClaimed);
  const collRate = pct(totalSettled, totalApproved);
  const denied = data.filter(x => isDenied(x.status));
  const denialRate = pct(denied.length, data.length);
  const arOver90 = (ageBuckets['91-180']?.val || 0) + (ageBuckets['180+']?.val || 0);
  const arTotal = Object.values(ageBuckets).reduce((a, b) => a + b.val, 0);
  const arHealth = arTotal ? 100 - pct(arOver90, arTotal) : 100;
  const tatVals = data.map(x => payerTat(x)).filter((v): v is number => v !== null);
  const avgTAT = avg(tatVals);
  const tatScore = avgTAT === 0 ? 70 : Math.max(0, Math.min(100, 100 - (avgTAT - 20) * 1.5));

  const norm = (v: number, target: number) => Math.max(0, Math.min(100, (v / target) * 100));
  const drivers = [
    { label: 'Approval Rate', value: approvalRate, weight: 0.25, contribution: norm(approvalRate, 80) * 0.25 },
    { label: 'Net Collection', value: collRate, weight: 0.25, contribution: norm(collRate, 90) * 0.25 },
    { label: 'Denial Control', value: 100 - denialRate, weight: 0.20, contribution: Math.max(0, 100 - denialRate * 4) * 0.20 },
    { label: 'AR Aging', value: arHealth, weight: 0.15, contribution: arHealth * 0.15 },
    { label: 'TAT Speed', value: tatScore, weight: 0.15, contribution: tatScore * 0.15 },
  ];
  const score = Math.round(drivers.reduce((a, d) => a + d.contribution, 0));
  const band: HealthScore['band'] =
    score >= 85 ? 'Excellent' : score >= 72 ? 'Healthy' : score >= 58 ? 'Watch' : score >= 42 ? 'At Risk' : 'Critical';
  return { score, band, drivers };
}

/** Top urgent issues — ranked by financial impact and severity */
export function getUrgentIssues(g: GlobalData, limit = 5): Insight[] {
  const { data, ageBuckets } = g;
  const issues: Insight[] = [];

  // 1. Aged 180+ AR
  const ar180 = ageBuckets['180+'];
  if (ar180 && ar180.cnt > 0) {
    issues.push({
      severity: 'critical',
      title: `${ar180.cnt} claims aged 180+ days`,
      detail: 'Recovery probability drops sharply beyond 180 days.',
      impact: `${fmt(ar180.val)} at write-off risk`,
      action: 'Escalate to TPA grievance cell immediately.',
    });
  }

  // 2. Approved but unsettled high-value
  const approvedPending = data.filter(x => x.status === 'Claim Approved' && ageDays(x.admission) > 45 && x.approvedAmt > 50000);
  if (approvedPending.length > 0) {
    const val = sm(approvedPending.map(x => x.approvedAmt));
    issues.push({
      severity: 'critical',
      title: `${approvedPending.length} approved claims awaiting payment >45d`,
      detail: 'Money already approved by payer but not credited.',
      impact: `${fmt(val)} payment overdue`,
      action: 'Run payment follow-up batch with payer finance team.',
    });
  }

  // 3. Stale Pre Auth Query
  const stalePAQ = data.filter(x => x.status === 'Pre Auth Query' && ageDays(x.admission) > 20);
  if (stalePAQ.length > 0) {
    issues.push({
      severity: 'warning',
      title: `${stalePAQ.length} pre-auth queries pending >20 days`,
      detail: 'Risk of auto-cancellation by TPA at 30-day mark.',
      impact: `${fmt(sm(stalePAQ.map(x => x.claimedAmt)))} claim value`,
      action: 'Reply to queries within 48 hours.',
    });
  }

  // 4. Settlement initiated but not paid
  const settInit = data.filter(x => x.status === 'Settlement Initiated' && ageDays(x.admission) > 30);
  if (settInit.length > 0) {
    issues.push({
      severity: 'warning',
      title: `${settInit.length} claims in 'Settlement Initiated' >30d`,
      detail: 'Payer has initiated settlement but bank credit pending.',
      impact: `${fmt(sm(settInit.map(x => x.approvedAmt)))} expected inflow`,
      action: 'Verify UTR / bank credit with payer.',
    });
  }

  // 5. Shortfall heavy claims
  const heavyShortfall = data.filter(x => x.shortfall > 0 && pct(x.shortfall, x.claimedAmt) > 30);
  if (heavyShortfall.length > 0) {
    const val = sm(heavyShortfall.map(x => x.shortfall));
    issues.push({
      severity: 'warning',
      title: `${heavyShortfall.length} claims with shortfall >30%`,
      detail: 'Large gaps between claimed and approved indicate documentation or coding gaps.',
      impact: `${fmt(val)} shortfall total`,
      action: 'Audit shortfall reasons; train coding team.',
    });
  }

  // 6. Cancellation cluster
  const cancelled = data.filter(x => x.status === 'Cancelled');
  if (cancelled.length > 0 && pct(cancelled.length, data.length) > 5) {
    issues.push({
      severity: 'warning',
      title: `${cancelled.length} cancelled claims (${fN(pct(cancelled.length, data.length))}%)`,
      detail: 'High cancellation rate — review pre-auth eligibility checks.',
      impact: `${fmt(sm(cancelled.map(x => x.claimedAmt)))} lost opportunity`,
      action: 'Strengthen front-desk eligibility verification.',
    });
  }

  return issues
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity))
    .slice(0, limit);
}

function sevRank(s: InsightSeverity): number {
  return { critical: 0, warning: 1, info: 2, good: 3 }[s];
}

/** Today's action queue — concrete claim follow-up counts */
export function getTodaysActions(g: GlobalData): Insight[] {
  const { data } = g;
  const out: Insight[] = [];

  const queryReply = data.filter(x => x.status === 'Pre Auth Query' && ageDays(x.admission) > 1);
  if (queryReply.length) out.push({
    severity: 'critical',
    title: `Reply to ${queryReply.length} pre-auth queries`,
    detail: 'Pending payer queries blocking approval.',
    impact: `${fmt(sm(queryReply.map(x => x.claimedAmt)))} blocked`,
    action: 'Submit clarifications today.',
  });

  const followPay = data.filter(x => x.status === 'Claim Approved' && ageDays(x.admission) > 30);
  if (followPay.length) out.push({
    severity: 'warning',
    title: `Follow up on ${followPay.length} approved claims`,
    detail: 'Payment delayed beyond standard cycle.',
    impact: `${fmt(sm(followPay.map(x => x.approvedAmt)))} expected`,
    action: 'Send payment reminder email batch.',
  });

  const submitDoc = data.filter(x => x.status === 'Enhancement Approved');
  if (submitDoc.length) out.push({
    severity: 'warning',
    title: `Submit final documents for ${submitDoc.length} enhancement-approved claims`,
    detail: 'Approval received; final bill submission pending.',
    impact: `${fmt(sm(submitDoc.map(x => x.approvedAmt)))} ready to settle`,
    action: 'Upload discharge summary + final bill.',
  });

  const reconsider = data.filter(x => x.status === 'Reconsideration Submitted' && ageDays(x.admission) > 15);
  if (reconsider.length) out.push({
    severity: 'info',
    title: `Track ${reconsider.length} reconsiderations >15d old`,
    detail: 'Payer review pending on previously denied claims.',
    impact: `${fmt(sm(reconsider.map(x => x.claimedAmt)))} recovery potential`,
    action: 'Push for payer decision.',
  });

  return out;
}

/** Financial tab insights */
export function getFinancialInsights(g: GlobalData): Insight[] {
  const { data, totalClaimed, totalApproved, totalSettled, totalShortfall, totalDiscount, totalCopay, totalTDS } = g;
  const insights: Insight[] = [];
  const approvalRate = pct(totalApproved, totalClaimed);
  const collRate = pct(totalSettled, totalApproved);
  const grossLeak = totalClaimed - totalApproved;

  // Gross vs Net
  insights.push({
    severity: 'info',
    title: 'Gross vs Net collection gap',
    detail: `Gross billed ${fmt(totalClaimed)} → Net collected ${fmt(totalSettled)}.`,
    impact: `${fmt(totalClaimed - totalSettled)} (${fN(pct(totalClaimed - totalSettled, totalClaimed))}%) leakage from gross to net.`,
  });

  if (approvalRate < 70) insights.push({
    severity: 'critical',
    title: 'Approval rate below benchmark (70%)',
    detail: `Current approval rate is ${fN(approvalRate)}%.`,
    impact: `${fmt(grossLeak)} deducted by payers`,
    action: 'Audit top 3 reasons for deductions; tighten coding & documentation.',
  });

  if (collRate < 85) insights.push({
    severity: 'warning',
    title: 'Net collection lagging',
    detail: `Only ${fN(collRate)}% of approved amount actually collected.`,
    impact: `${fmt(totalApproved - totalSettled)} approved-but-uncollected`,
    action: 'Run aging-based collection drive.',
  });

  // Insurer profitability — top earner & top leaker
  const insurerMap: Record<string, { claimed: number; settled: number; cnt: number }> = {};
  data.forEach(x => {
    const k = x.insurer || 'Unknown';
    if (!insurerMap[k]) insurerMap[k] = { claimed: 0, settled: 0, cnt: 0 };
    insurerMap[k].claimed += x.claimedAmt;
    insurerMap[k].settled += x.settledAmt;
    insurerMap[k].cnt++;
  });
  const insurers = Object.entries(insurerMap).filter(([, v]) => v.cnt >= 10);
  const ranked = insurers.map(([k, v]) => ({ k, ...v, yield: pct(v.settled, v.claimed) })).sort((a, b) => a.yield - b.yield);
  if (ranked.length >= 2) {
    const worst = ranked[0];
    insights.push({
      severity: 'warning',
      title: `Lowest-yield insurer: ${worst.k}`,
      detail: `Net realisation only ${fN(worst.yield)}% across ${worst.cnt} claims.`,
      impact: `${fmt(worst.claimed - worst.settled)} not collected`,
      action: 'Re-negotiate tariff or reduce empanelment exposure.',
    });
  }

  // Deduction drivers
  const dedTotal = totalShortfall + totalDiscount + totalCopay + totalTDS;
  if (dedTotal > 0) {
    const parts = [
      { name: 'Shortfall', val: totalShortfall },
      { name: 'Discount', val: totalDiscount },
      { name: 'Copay', val: totalCopay },
      { name: 'TDS', val: totalTDS },
    ].sort((a, b) => b.val - a.val);
    insights.push({
      severity: 'info',
      title: `Largest deduction bucket: ${parts[0].name}`,
      detail: `${parts[0].name} accounts for ${fN(pct(parts[0].val, dedTotal))}% of total deductions.`,
      impact: `${fmt(parts[0].val)} lost to ${parts[0].name.toLowerCase()}`,
    });
  }

  return insights;
}

/** Denial tab insights — preventable vs non-preventable + recovery probability */
export interface DenialBreakdown {
  preventable: { count: number; value: number; reasons: { name: string; count: number }[] };
  nonPreventable: { count: number; value: number; reasons: { name: string; count: number }[] };
  recoveryProbability: number; // 0-100
  insights: Insight[];
}

const PREVENTABLE_HINTS = ['query', 'document', 'enhancement denied', 'pre auth denied', 'reconsideration'];

export function getDenialBreakdown(g: GlobalData): DenialBreakdown {
  const denied = g.data.filter(x => isDenied(x.status) || x.status === 'Cancelled');
  const reasonsMap: Record<string, { count: number; preventable: boolean }> = {};

  denied.forEach(x => {
    const s = x.status;
    const lower = s.toLowerCase();
    const preventable = PREVENTABLE_HINTS.some(p => lower.includes(p));
    if (!reasonsMap[s]) reasonsMap[s] = { count: 0, preventable };
    reasonsMap[s].count++;
  });

  const preventableClaims = denied.filter(x => PREVENTABLE_HINTS.some(p => x.status.toLowerCase().includes(p)));
  const nonPreventableClaims = denied.filter(x => !PREVENTABLE_HINTS.some(p => x.status.toLowerCase().includes(p)));

  const preventable = {
    count: preventableClaims.length,
    value: sm(preventableClaims.map(x => x.claimedAmt)),
    reasons: Object.entries(reasonsMap).filter(([, v]) => v.preventable).map(([name, v]) => ({ name, count: v.count })).sort((a, b) => b.count - a.count),
  };
  const nonPreventable = {
    count: nonPreventableClaims.length,
    value: sm(nonPreventableClaims.map(x => x.claimedAmt)),
    reasons: Object.entries(reasonsMap).filter(([, v]) => !v.preventable).map(([name, v]) => ({ name, count: v.count })).sort((a, b) => b.count - a.count),
  };

  // Recovery probability: reconsideration + recent denials are most recoverable
  const recoverable = denied.filter(x =>
    x.status === 'Reconsideration Submitted' ||
    (x.status === 'Pre Auth Denied' && ageDays(x.admission) < 30) ||
    x.status === 'Enhancement Denied'
  );
  const recoveryProbability = denied.length ? Math.round(pct(recoverable.length, denied.length)) : 0;

  const insights: Insight[] = [];
  if (preventable.count > 0) insights.push({
    severity: 'critical',
    title: `${preventable.count} preventable denials identified`,
    detail: 'These denials trace to documentation, query response, or coding gaps.',
    impact: `${fmt(preventable.value)} potentially avoidable loss`,
    action: 'Set up daily query-resolution SLA + pre-submission audit.',
  });
  if (recoverable.length > 0) insights.push({
    severity: 'warning',
    title: `${recoverable.length} denials still recoverable`,
    detail: 'Reconsideration + recent denials within appeal window.',
    impact: `${fmt(sm(recoverable.map(x => x.claimedAmt)))} potential recovery`,
    action: 'File appeals with supporting evidence within 7 days.',
  });
  // Top denial concentration
  const top = Object.entries(reasonsMap).sort((a, b) => b[1].count - a[1].count)[0];
  if (top && top[1].count >= 5) insights.push({
    severity: 'info',
    title: `Concentration in '${top[0]}'`,
    detail: `${top[1].count} of ${denied.length} denials fall in this single bucket (${fN(pct(top[1].count, denied.length))}%).`,
    action: 'Run a root-cause workshop on this status.',
  });

  return { preventable, nonPreventable, recoveryProbability, insights };
}

/** Revenue leakage one-liner summary for Overview */
export function getLeakageSummary(g: GlobalData): { total: number; breakdown: { label: string; value: number }[] } {
  const { totalClaimed, totalApproved, totalShortfall, totalCopay, totalTDS, totalSettled, leakageData } = g;
  return {
    total: totalClaimed - totalSettled,
    breakdown: [
      { label: 'Payer Deductions', value: leakageData.payerDed },
      { label: 'Shortfall', value: totalShortfall },
      { label: 'Denied Claims', value: leakageData.deniedVal },
      { label: 'Uncollected AR', value: leakageData.uncollected },
    ],
  };
}