import { useState } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { SectionHeading } from './SectionHeading';
import { fmt, fN, pct, avg, ddiff, sm, shortP, score, scoreColor } from '@/lib/rcm-utils';

export function AIReportTab() {
  const { globalData } = useDashboard();
  const [report, setReport] = useState<any>(null);

  if (!globalData) return null;

  function generateReport() {
    const d = globalData!.data;
    const { n, totalClaimed, totalApproved, totalSettled, totalShortfall, totalCopay, totalDiscount, totalTDS, tpaArr, ageBuckets, leakageData } = globalData!;

    const pending = d.filter(x => !['Settled', 'Claim Denied', 'Pre Auth Denied', 'Cancelled', 'Enhancement Denied', 'Discharge Denied'].includes(x.status));
    const denied = d.filter(x => x.status.toLowerCase().includes('denied') || x.status === 'Cancelled');
    const paDenied = d.filter(x => x.status === 'Pre Auth Denied');
    const paTotal = d.filter(x => x.status.startsWith('Pre Auth') || x.status.startsWith('Discharge') || x.status.startsWith('Enhancement'));

    const apprR = pct(totalApproved, totalClaimed);
    const dedR = pct(totalClaimed - totalApproved, totalClaimed);
    const ncR = pct(totalSettled, totalApproved);
    const denR = pct(denied.length, n);
    const paDenR = pct(paDenied.length, paTotal.length);

    const tatVals = d.map(x => ddiff(x.admission, x.paymentDate)).filter((v): v is number => v !== null && v < 365);
    const avgE2E = avg(tatVals);
    const avgSub = avg(d.map(x => ddiff(x.admission, x.docSubmit)).filter((v): v is number => v !== null && v < 365));
    const avgPay = avg(d.map(x => ddiff(x.docSubmit, x.paymentDate)).filter((v): v is number => v !== null && v < 365));

    const pendVal = sm(pending.map(x => x.claimedAmt));
    const aged180 = ageBuckets['180+'] || { cnt: 0, val: 0 };
    const aged90 = ageBuckets['91-180'] || { cnt: 0, val: 0 };

    const finScore = Math.round((score(apprR, 75, 60) * 0.4 + score(ncR, 85, 70) * 0.3 + score(dedR, 20, 35, false) * 0.3));
    const tatScore = Math.round((score(avgSub, 7, 14, false) * 0.3 + score(avgPay, 30, 60, false) * 0.4 + score(avgE2E, 30, 60, false) * 0.3));
    const denScore = Math.round((score(denR, 10, 20, false) * 0.5 + score(paDenR, 15, 30, false) * 0.5));
    const arScore = Math.round((score(aged180.cnt, 0, 5, false) * 0.4 + score(aged90.cnt, 5, 20, false) * 0.3 + score(pct(pendVal, totalClaimed), 20, 40, false) * 0.3));
    const payerScore = tpaArr.length ? Math.round(avg(tpaArr.map(t => score(t.approvalRate, 75, 60) * 0.5 + score(t.collRate, 85, 70) * 0.3 + score(t.denialRate, 10, 20, false) * 0.2))) : 50;
    const overall = Math.round(finScore * 0.3 + tatScore * 0.2 + denScore * 0.2 + arScore * 0.15 + payerScore * 0.15);

    // Build recommendations
    const sections = [
      { icon: '₹', title: 'Financial Performance', score: finScore, recs: buildFinRecs(apprR, ncR, dedR, totalClaimed, totalApproved, totalSettled) },
      { icon: '⏱', title: 'Turnaround Time', score: tatScore, recs: buildTATRecs(avgSub, avgPay, avgE2E) },
      { icon: '❌', title: 'Denial Management', score: denScore, recs: buildDenialRecs(denR, paDenR, denied, paDenied, paTotal) },
      { icon: '📋', title: 'AR Management', score: arScore, recs: buildARRecs(aged180, aged90, pending, pendVal) },
      { icon: '🏥', title: 'Payer Performance', score: payerScore, recs: buildPayerRecs(tpaArr) },
    ];

    setReport({
      hosp: globalData!.hospitalName,
      period: globalData!.dateRange,
      n, overall, scores: { fin: finScore, tat: tatScore, denial: denScore, ar: arScore, payer: payerScore },
      sections,
      quickWins: buildQuickWins(avgSub, aged180, leakageData, paDenR),
    });
  }

  return (
    <div className="animate-fadeIn">
      <div className="hero-gradient rounded-2xl p-7 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 text-primary-foreground">
        <div>
          <h2 className="font-display text-2xl font-black">✦ RCM Performance Report</h2>
          <p className="text-xs text-primary-foreground/60 mt-1">
            {report ? `${report.hosp} · ${report.n.toLocaleString()} claims · ${report.period}` : 'Click Generate to get instant KPI analysis and improvement recommendations'}
          </p>
        </div>
        <button onClick={generateReport} className="bg-primary-foreground text-rcm-700 rounded-lg px-5 py-2.5 text-sm font-bold hover:bg-rcm-50 transition-colors flex-shrink-0">
          ▶ Generate Report
        </button>
      </div>

      {!report ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-3">📈</div>
          <div className="text-base font-semibold text-foreground/70 mb-1">Load your claims data, then click Generate</div>
          <div className="text-xs">Instant analysis — no internet required — based entirely on your actual KPI numbers</div>
        </div>
      ) : (
        <div>
          {/* Score cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
            <div className="bg-card rounded-xl border border-border p-3.5 text-center shadow-card">
              <div className="font-display text-3xl font-black" style={{ color: scoreColor(report.overall) }}>{report.overall}<span className="text-sm">/100</span></div>
              <div className="text-[9px] font-bold tracking-wider uppercase text-muted-foreground mt-1">Overall RCM</div>
              <div className="text-[10px] font-bold mt-0.5" style={{ color: scoreColor(report.overall) }}>{report.overall >= 75 ? 'Good' : report.overall >= 55 ? 'Average' : 'Needs Work'}</div>
            </div>
            {Object.entries(report.scores).map(([k, v]) => (
              <div key={k} className="bg-card rounded-xl border border-border p-3.5 text-center shadow-card">
                <div className="font-display text-2xl font-black" style={{ color: scoreColor(v as number) }}>{v as number}</div>
                <div className="text-[9px] font-bold tracking-wider uppercase text-muted-foreground mt-1">
                  {{ fin: 'Financial', tat: 'TAT Speed', denial: 'Denial Mgmt', ar: 'AR Health', payer: 'Payer Perf.' }[k]}
                </div>
              </div>
            ))}
          </div>

          {/* Executive summary */}
          <div className="bg-gradient-to-br from-rcm-50 to-card border border-rcm-200 rounded-xl p-5 mb-5 text-[13px] text-muted-foreground leading-relaxed">
            <strong className="block mb-1 text-rcm-700 text-xs tracking-wider uppercase">Executive Summary</strong>
            {report.hosp} processed {report.n.toLocaleString()} insurance claims during {report.period}, billing a total of {fmt(globalData.totalClaimed)} and collecting {fmt(globalData.totalSettled)}.
            The overall RCM score of <strong>{report.overall}/100</strong> reflects {report.overall >= 75 ? 'strong' : report.overall >= 55 ? 'average' : 'below-average'} performance.
          </div>

          {/* Quick wins */}
          {report.quickWins.length > 0 && (
            <div className="bg-card rounded-xl border border-border shadow-card mb-4 overflow-hidden">
              <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center gap-2">
                <span>⚡</span><span className="text-sm font-bold text-foreground">Quick Wins — Act in the Next 30 Days</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {report.quickWins.map((w: any, i: number) => (
                  <div key={i} className="bg-status-good-bg border border-status-good/20 rounded-lg p-3">
                    <div className="font-bold text-status-good text-[13px] mb-1">⚡ {w.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{w.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sections */}
          {report.sections.map((sec: any, i: number) => (
            <div key={i} className="bg-card rounded-xl border border-border shadow-card mb-4 overflow-hidden">
              <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center gap-2">
                <span>{sec.icon}</span>
                <span className="text-sm font-bold text-foreground flex-1">{sec.title}</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{
                  background: sec.score >= 75 ? 'hsl(142 76% 95%)' : sec.score >= 55 ? 'hsl(48 96% 89%)' : 'hsl(0 86% 93%)',
                  color: sec.score >= 75 ? '#15803D' : sec.score >= 55 ? '#854D0E' : '#9B1C1C',
                }}>{sec.score}/100</span>
              </div>
              <div className="p-4 flex flex-col gap-2.5">
                {sec.recs.map((r: any, j: number) => (
                  <div key={j} className={`rounded-lg p-3.5 border-l-4 ${
                    r.pri === 'critical' ? 'bg-rcm-50 border-l-rcm-600' :
                    r.pri === 'warning' ? 'bg-amber-50 border-l-amber-500' :
                    r.pri === 'good' ? 'bg-emerald-50 border-l-emerald-500' :
                    'bg-blue-50 border-l-blue-500'
                  }`}>
                    <span className={`inline-block text-[9px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-lg mb-1 ${
                      r.pri === 'critical' ? 'badge-critical' : r.pri === 'warning' ? 'badge-warning' : r.pri === 'good' ? 'badge-good' : 'badge-info'
                    }`}>{r.pri === 'critical' ? 'Critical Action' : r.pri === 'warning' ? 'Needs Attention' : r.pri === 'good' ? 'Performing Well' : 'Insight'}</span>
                    <div className="text-[13px] font-bold text-foreground mb-1">{r.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{r.body}</div>
                    {r.metric && <div className="inline-block mt-1.5 text-[11px] font-bold font-mono bg-foreground/5 px-1.5 py-0.5 rounded">{r.metric}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper functions to build recommendations
function rec(pri: string, title: string, body: string, metric?: string) {
  return { pri, title, body, metric };
}

function buildFinRecs(apprR: number, ncR: number, dedR: number, totalClaimed: number, totalApproved: number, totalSettled: number) {
  const recs = [];
  if (apprR < 60) recs.push(rec('critical', 'Approval Rate Below 60%', `Approval rate of ${fN(apprR)}% is critically low. Review package rates vs payer tariffs.`, `Approval Rate: ${fN(apprR)}%`));
  else if (apprR < 75) recs.push(rec('warning', 'Approval Rate Needs Improvement', `At ${fN(apprR)}%, there's room to improve. Focus on pre-auth documentation.`, `Approval Rate: ${fN(apprR)}%`));
  else recs.push(rec('good', 'Strong Approval Rate', `Approval rate of ${fN(apprR)}% is above the 75% benchmark.`, `Approval Rate: ${fN(apprR)}%`));

  if (ncR < 70) recs.push(rec('critical', 'Net Collection Rate is Low', `Only ${fN(ncR)}% of approved amounts are being collected.`, `Collection Rate: ${fN(ncR)}%`));
  else if (ncR < 85) recs.push(rec('warning', 'Collection Rate Below Benchmark', `Collection rate of ${fN(ncR)}% is below the 85% target.`, `Collection Rate: ${fN(ncR)}%`));
  else recs.push(rec('good', 'Strong Collections', `Net collection rate of ${fN(ncR)}% exceeds the 85% benchmark.`, `Collection Rate: ${fN(ncR)}%`));

  recs.push(rec('info', 'Revenue Gap Analysis', `Total gap between billed (${fmt(totalClaimed)}) and collected (${fmt(totalSettled)}) is ${fmt(totalClaimed - totalSettled)}.`, `Gap: ${fmt(totalClaimed - totalSettled)}`));
  return recs;
}

function buildTATRecs(avgSub: number, avgPay: number, avgE2E: number) {
  const recs = [];
  if (avgSub > 14) recs.push(rec('critical', 'Document Submission Taking Too Long', `Submission TAT of ${fN(avgSub)} days is well above the 7-day benchmark.`, `Submission TAT: ${fN(avgSub)} days`));
  else if (avgSub > 7) recs.push(rec('warning', 'Submission TAT Needs Improvement', `Submission TAT of ${fN(avgSub)} days is above the 7-day benchmark.`, `Submission TAT: ${fN(avgSub)} days`));
  else recs.push(rec('good', 'Fast Document Submission', `Submission TAT of ${fN(avgSub)} days is within benchmark.`, `Submission TAT: ${fN(avgSub)} days`));

  if (avgPay > 60) recs.push(rec('critical', 'Payment TAT Exceeds IRDAI Guidelines', `Average payment TAT of ${fN(avgPay)} days exceeds IRDAI's 30-day guideline.`, `Payment TAT: ${fN(avgPay)} days`));
  else if (avgPay > 30) recs.push(rec('warning', 'Payment TAT Above Benchmark', `Payment TAT of ${fN(avgPay)} days is above the 30-day IRDAI benchmark.`, `Payment TAT: ${fN(avgPay)} days`));
  else recs.push(rec('good', 'Payment TAT Within Benchmark', `Payment TAT of ${fN(avgPay)} days meets the 30-day guideline.`, `Payment TAT: ${fN(avgPay)} days`));

  if (avgE2E > 60) recs.push(rec('warning', 'End-to-End Cycle Time is High', `E2E TAT of ${fN(avgE2E)} days means cash is tied up for over 2 months.`, `E2E TAT: ${fN(avgE2E)} days`));
  return recs;
}

function buildDenialRecs(denR: number, paDenR: number, denied: any[], paDenied: any[], paTotal: any[]) {
  const recs = [];
  if (denR > 20) recs.push(rec('critical', 'Denial Rate is Critically High', `Overall denial rate of ${fN(denR)}% (${denied.length} claims) is well above the 10% benchmark.`, `Denial Rate: ${fN(denR)}%`));
  else if (denR > 10) recs.push(rec('warning', 'Denial Rate Above Benchmark', `Denial rate of ${fN(denR)}% exceeds the 10% benchmark.`, `Denial Rate: ${fN(denR)}%`));
  else recs.push(rec('good', 'Denial Rate Under Control', `Denial rate of ${fN(denR)}% is within the 10% benchmark.`, `Denial Rate: ${fN(denR)}%`));

  if (paDenR > 25) recs.push(rec('critical', 'Pre-Auth Denial Rate Needs Urgent Attention', `Pre-auth denial rate of ${fN(paDenR)}% (${paDenied.length} of ${paTotal.length}) is very high.`, `Pre-Auth Denial: ${fN(paDenR)}%`));
  else if (paDenR > 15) recs.push(rec('warning', 'Pre-Auth Denial Rate Above 15%', `Pre-auth denial rate of ${fN(paDenR)}% is above the threshold.`, `Pre-Auth Denial: ${fN(paDenR)}%`));

  recs.push(rec('info', 'Set Up Denial Recovery Workflow', `Create a 30-day reconsideration SOP for every denied claim above ${fmt(50000)}.`, `Denied Value: ${fmt(sm(denied.map(x => x.claimedAmt)))}`));
  return recs;
}

function buildARRecs(aged180: any, aged90: any, pending: any[], pendVal: number) {
  const recs = [];
  if (aged180.cnt > 0) recs.push(rec('critical', `${aged180.cnt} Claims in 180+ Day Bucket`, `${aged180.cnt} claims worth ${fmt(aged180.val)} are at risk of becoming uncollectable.`, `180+ Day AR: ${fmt(aged180.val)}`));
  else recs.push(rec('good', 'No Critical-Age AR Outstanding', `No claims in the 180+ day bucket — strong AR discipline.`, `180+ Day AR: Zero`));

  if (aged90.cnt > 10) recs.push(rec('warning', `${aged90.cnt} Claims Approaching Critical Age`, `${aged90.cnt} claims worth ${fmt(aged90.val)} are between 90–180 days.`, `90+ Day AR: ${aged90.cnt} claims`));

  recs.push(rec('info', 'AR Pipeline Monitoring', `Total pending AR of ${fmt(pendVal)} across ${pending.length} claims.`, `Total AR: ${fmt(pendVal)}`));
  return recs;
}

function buildPayerRecs(tpaArr: any[]) {
  const recs = [];
  const best = [...tpaArr].sort((a, b) => b.approvalRate - a.approvalRate)[0];
  const worst = [...tpaArr].sort((a, b) => a.approvalRate - b.approvalRate)[0];

  if (best) recs.push(rec('good', 'Benchmark Against Best TPA', `${shortP(best.k)} achieves ${fN(best.approvalRate)}% approval. Replicate best practices.`, `Best: ${shortP(best.k)} ${fN(best.approvalRate)}%`));
  if (worst && worst.approvalRate < 60) recs.push(rec('critical', 'Contract Review with Low-Approval Payer', `${shortP(worst.k)} has only ${fN(worst.approvalRate)}% approval rate.`, `Worst: ${shortP(worst.k)} ${fN(worst.approvalRate)}%`));

  recs.push(rec('info', 'Diversify Payer Mix', `Active payers: ${tpaArr.length}. Consider expanding empanelment.`, `Active Payers: ${tpaArr.length}`));
  return recs;
}

function buildQuickWins(avgSub: number, aged180: any, leakageData: any, paDenR: number) {
  const wins = [];
  if (avgSub > 7) wins.push({ title: 'Same-day discharge billing', body: `Mandate IHX upload within 24 hours. Can reduce submission TAT from ${fN(avgSub)} to under 7 days.` });
  if (aged180.cnt > 0) wins.push({ title: 'Clear the 180+ day bucket', body: `Dedicate an AR officer for 2 weeks to recover ${aged180.cnt} claims worth ${fmt(aged180.val)}.` });
  if (leakageData.uncollected > 0) wins.push({ title: 'Reconcile approved-but-unsettled claims', body: `Chase UTR/cheque issuance. ${fmt(leakageData.uncollected)} is already approved — just needs collection.` });
  if (paDenR > 15) wins.push({ title: 'Pre-auth documentation template', body: `Create TPA-specific templates for top 5 denied procedures. Reduces denials by 20-30%.` });
  if (wins.length < 3) wins.push({ title: 'Weekly TPA reconciliation call', body: 'Schedule 30-minute weekly calls with top 3 TPAs to prevent silent claim aging.' });
  return wins;
}
