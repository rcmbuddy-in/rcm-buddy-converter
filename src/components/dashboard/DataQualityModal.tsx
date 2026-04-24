import { useMemo, useState } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { exportDQErrorSheet, Severity } from '@/lib/dq-engine';
import { fN, pct } from '@/lib/rcm-utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const SEVERITY_COLORS: Record<Severity, string> = {
  clean: '#15803D',
  warning: '#D97706',
  error: '#DC2626',
  critical: '#7B1212',
};

const SEVERITY_BADGE: Record<Severity, string> = {
  clean: 'badge-good',
  warning: 'badge-warning',
  error: 'badge-critical',
  critical: 'badge-critical',
};

const LAYER_LABELS: Record<number, { title: string; subtitle: string; emoji: string }> = {
  1: { title: 'Structural Validation', subtitle: 'File integrity & headers', emoji: '🔵' },
  2: { title: 'Mandatory Fields', subtitle: 'Row-level gatekeeper', emoji: '🟢' },
  3: { title: 'Business Logic', subtitle: 'RCM intelligence', emoji: '🟠' },
  4: { title: 'Performance Validation', subtitle: 'Outliers & strategic checks', emoji: '🔴' },
};

export function DataQualityModal() {
  const { dqReport, dqModalOpen, closeDQModal, proceedAfterDQ, resetData } = useDashboard();
  const [tab, setTab] = useState<'overview' | 'issues' | 'quarantine'>('overview');

  if (!dqModalOpen || !dqReport) return null;

  const r = dqReport;
  const isRejected = r.fileRejected;
  const qualityPct = r.totalRows > 0 ? ((r.cleanRows + r.warningRows) / r.totalRows) * 100 : 0;

  const sevData = [
    { name: 'Clean', value: r.cleanRows, color: SEVERITY_COLORS.clean },
    { name: 'Warning', value: r.warningRows, color: SEVERITY_COLORS.warning },
    { name: 'Error', value: r.errorRows, color: SEVERITY_COLORS.error },
    { name: 'Critical', value: r.criticalRows, color: SEVERITY_COLORS.critical },
  ].filter(x => x.value > 0);

  const topIssues = useMemo(() => Object.entries(r.flagsByRule)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12), [r.flagsByRule]);

  const handleExport = () => exportDQErrorSheet(r);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-elevated w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b border-border flex items-center justify-between ${isRejected ? 'bg-rcm-50' : 'bg-muted/40'}`}>
          <div className="flex items-center gap-3">
            <div className="text-3xl">🧠</div>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Data Quality Engine</h2>
              <p className="text-xs text-muted-foreground">{r.fileName || 'Uploaded file'} · {r.totalRows.toLocaleString()} rows analyzed</p>
            </div>
          </div>
          <div className="text-right">
            {isRejected ? (
              <div className="text-rcm-700 font-bold text-sm">❌ FILE REJECTED</div>
            ) : (
              <div>
                <div className="font-display text-2xl font-bold" style={{ color: qualityPct > 90 ? '#15803D' : qualityPct > 70 ? '#D97706' : '#DC2626' }}>
                  {fN(qualityPct)}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Data Quality Score</div>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isRejected ? (
            <div className="text-center py-10">
              <div className="text-6xl mb-4">🚫</div>
              <div className="font-display text-xl font-bold text-rcm-700 mb-2">File cannot be processed</div>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">{r.rejectReason}</p>
              <p className="text-xs text-muted-foreground mt-4 italic">Garbage structure = garbage reports. Fix the file and try again.</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex gap-1 border-b border-border mb-5 -mt-2">
                {([
                  { id: 'overview', label: 'Overview' },
                  { id: 'issues', label: `Top Issues (${Object.keys(r.flagsByRule).length})` },
                  { id: 'quarantine', label: `Quarantined (${r.quarantined.length})` },
                ] as const).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${tab === t.id ? 'border-rcm-600 text-rcm-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'overview' && (
                <div className="grid md:grid-cols-2 gap-5">
                  {/* Severity donut */}
                  <div className="bg-muted/30 rounded-xl p-4">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Severity Breakdown</div>
                    <div style={{ height: 220 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={sevData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                            {sevData.map((s, i) => <Cell key={i} fill={s.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => v.toLocaleString()} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Clean</span><span className="font-bold" style={{ color: SEVERITY_COLORS.clean }}>{r.cleanRows.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Warning</span><span className="font-bold" style={{ color: SEVERITY_COLORS.warning }}>{r.warningRows.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Error</span><span className="font-bold" style={{ color: SEVERITY_COLORS.error }}>{r.errorRows.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Critical</span><span className="font-bold" style={{ color: SEVERITY_COLORS.critical }}>{r.criticalRows.toLocaleString()}</span></div>
                    </div>
                  </div>

                  {/* Layer summary */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Validation Layers</div>
                    {r.layerSummary.map(l => {
                      const meta = LAYER_LABELS[l.layer];
                      const passRate = l.checks > 0 ? ((l.checks - l.failed) / l.checks) * 100 : 100;
                      return (
                        <div key={l.layer} className="bg-card border border-border rounded-lg p-3 hover:shadow-sm transition-shadow">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{meta.emoji}</span>
                              <div>
                                <div className="text-[13px] font-bold text-foreground">Layer {l.layer}: {meta.title}</div>
                                <div className="text-[10px] text-muted-foreground">{meta.subtitle}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold" style={{ color: passRate > 95 ? '#15803D' : passRate > 80 ? '#D97706' : '#DC2626' }}>{fN(passRate)}%</div>
                              <div className="text-[9px] text-muted-foreground">{l.failed} of {l.checks.toLocaleString()} failed</div>
                            </div>
                          </div>
                          {l.rules.length > 0 && (
                            <div className="text-[10px] text-muted-foreground truncate">Rules: {l.rules.slice(0, 4).join(', ')}{l.rules.length > 4 ? `… +${l.rules.length - 4}` : ''}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Aggregate alerts */}
                  {r.aggregateAlerts.length > 0 && (
                    <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 mb-2">⚠️ Strategic Alerts (Aggregate)</div>
                      <div className="grid sm:grid-cols-3 gap-3">
                        {r.aggregateAlerts.map((a, i) => (
                          <div key={i} className="bg-white rounded-lg p-3 border border-amber-100">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.metric}</div>
                            <div className="text-lg font-bold text-amber-800">{a.value}</div>
                            <div className="text-[10px] text-muted-foreground">Expected: {a.expected}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'issues' && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Layer</th>
                        <th className="text-left px-3 py-2 font-semibold">Rule</th>
                        <th className="text-left px-3 py-2 font-semibold">Sample message</th>
                        <th className="text-right px-3 py-2 font-semibold">Count</th>
                        <th className="text-center px-3 py-2 font-semibold">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topIssues.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No issues detected — all clean! 🎉</td></tr>
                      )}
                      {topIssues.map(([rule, info]) => (
                        <tr key={rule} className="border-t border-border hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">L{info.layer}</td>
                          <td className="px-3 py-2 font-mono text-[11px]">{rule}</td>
                          <td className="px-3 py-2 text-muted-foreground">{info.sampleMessage}</td>
                          <td className="px-3 py-2 text-right font-bold">{info.count.toLocaleString()}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${SEVERITY_BADGE[info.severity]}`}>{info.severity}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'quarantine' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-3">
                    These {r.quarantined.length.toLocaleString()} rows have ERROR or CRITICAL flags and will be excluded from analysis.
                    Showing first 100. Download the full error sheet to review all.
                  </p>
                  <div className="border border-border rounded-xl overflow-hidden max-h-[55vh] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Row</th>
                          <th className="text-left px-3 py-2 font-semibold">Patient</th>
                          <th className="text-right px-3 py-2 font-semibold">Claimed</th>
                          <th className="text-left px-3 py-2 font-semibold">Status</th>
                          <th className="text-left px-3 py-2 font-semibold">Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.quarantined.length === 0 && (
                          <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No rows quarantined.</td></tr>
                        )}
                        {r.quarantined.slice(0, 100).map(q => {
                          const raw = r.rawRows[q.rowIndex] ?? {};
                          const patient = raw['Patient Name'] ?? raw['PatientName'] ?? raw['Patient'] ?? '—';
                          return (
                            <tr key={q.rowIndex} className="border-t border-border hover:bg-muted/30">
                              <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{q.rowIndex + 2}</td>
                              <td className="px-3 py-2">{String(patient).slice(0, 30)}</td>
                              <td className="px-3 py-2 text-right font-mono text-[11px]">{q.record.claimedAmt.toLocaleString('en-IN')}</td>
                              <td className="px-3 py-2 text-[11px]">{q.record.status || '—'}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {q.flags.slice(0, 3).map((f, i) => (
                                    <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${SEVERITY_BADGE[f.severity]}`} title={f.message}>{f.rule}</span>
                                  ))}
                                  {q.flags.length > 3 && <span className="text-[9px] text-muted-foreground">+{q.flags.length - 3} more</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            {isRejected ? (
              <>Fix the structural issues and re-upload your file.</>
            ) : (
              <>
                <strong className="text-foreground">{(r.cleanRows + r.warningRows).toLocaleString()}</strong> rows ready for analysis
                {r.quarantined.length > 0 && <> · <strong className="text-rcm-700">{r.quarantined.length.toLocaleString()}</strong> quarantined</>}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {!isRejected && r.quarantined.length > 0 && (
              <button
                onClick={handleExport}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                ⬇ Download Error Sheet
              </button>
            )}
            {isRejected ? (
              <button
                onClick={() => { resetData(); }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-rcm-700 text-primary-foreground hover:bg-rcm-800 transition-colors"
              >
                Re-upload File
              </button>
            ) : (
              <>
                <button
                  onClick={closeDQModal}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={proceedAfterDQ}
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-rcm-700 text-primary-foreground hover:bg-rcm-800 transition-colors"
                >
                  ✓ Proceed with Clean Data ({(r.cleanRows + r.warningRows).toLocaleString()} rows)
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}