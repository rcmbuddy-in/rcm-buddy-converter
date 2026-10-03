import { useState } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { captureElementCanvas, exportTabsToPDF, printCapturedTabs, waitForExportPaint } from '@/lib/pdf-export';
import { ExportRenderSurface } from './ExportRenderSurface';
import { loadProfile, displayName } from '@/lib/hospital-profile';

const TABS = [
  { id: 'overview', label: 'Overview Dashboard' },
  { id: 'financial', label: 'Financial KPIs' },
  { id: 'tat', label: 'TAT Analysis' },
  { id: 'denial', label: 'Denial Analysis' },
  { id: 'ar', label: 'AR Management' },
  { id: 'payer', label: 'Payer Performance' },
  { id: 'leakage', label: 'Revenue Leakage' },
  { id: 'ai-report', label: 'AI Report' },
];

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { globalData, activeTab } = useDashboard();
  const [selectedTabs, setSelectedTabs] = useState<string[]>([activeTab]);
  const [mode, setMode] = useState<'pdf' | 'print'>('pdf');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [renderTabs, setRenderTabs] = useState<string[]>([]);

  if (!open || !globalData) return null;

  const toggleTab = (id: string) => {
    setSelectedTabs(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedTabs(TABS.map(t => t.id));
  const selectNone = () => setSelectedTabs([]);

  const handleExport = async () => {
    if (selectedTabs.length === 0) return;
    setExporting(true);
    setRenderTabs(selectedTabs);

    const captures: Array<{ tabId: string; canvas: HTMLCanvasElement }> = [];

    try {
      await waitForExportPaint(900);

      for (let i = 0; i < selectedTabs.length; i++) {
        const tabId = selectedTabs[i];
        const tabLabel = TABS.find(t => t.id === tabId)?.label || tabId;
        setProgress(`Rendering ${tabLabel}… (${i + 1}/${selectedTabs.length})`);

        const section = document.querySelector<HTMLElement>(`[data-export-section="${tabId}"]`);
        if (!section) continue;

        const canvas = await captureElementCanvas(section);
        if (canvas) captures.push({ tabId, canvas });
      }

      if (captures.length === 0) return;

      if (mode === 'pdf') {
        await exportTabsToPDF(captures, displayName(loadProfile(), globalData.hospitalName), globalData.dateRange);
      } else {
        await printCapturedTabs(captures, displayName(loadProfile(), globalData.hospitalName), globalData.dateRange);
      }
    } finally {
      setRenderTabs([]);
      setExporting(false);
      setProgress('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <ExportRenderSurface tabs={renderTabs} />
      <div className="bg-card rounded-2xl shadow-elevated w-[480px] max-w-[92vw] p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-foreground mb-1">Export / Print Report</h3>
        <p className="text-xs text-muted-foreground mb-5">Select pages and output format</p>

        {/* Mode toggle */}
        <div className="flex border border-border rounded-lg overflow-hidden mb-5">
          {(['pdf', 'print'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 px-4 py-2 text-xs font-semibold transition-all ${
                mode === m ? 'bg-rcm-600 text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              {m === 'pdf' ? '📄 Export PDF' : '🖨️ Print'}
            </button>
          ))}
        </div>

        {/* Tab selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">Select Pages</span>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-[10px] text-rcm-600 font-medium hover:underline">Select All</button>
              <button onClick={selectNone} className="text-[10px] text-muted-foreground font-medium hover:underline">Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {TABS.map(tab => (
              <label
                key={tab.id}
                className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-xs ${
                  selectedTabs.includes(tab.id)
                    ? 'border-rcm-400 bg-rcm-50 text-rcm-700 font-medium'
                    : 'border-border bg-card text-muted-foreground hover:border-rcm-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTabs.includes(tab.id)}
                  onChange={() => toggleTab(tab.id)}
                  className="accent-rcm-600 w-3.5 h-3.5"
                />
                {tab.label}
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-3 border-t border-border">
          {exporting ? (
            <div className="flex items-center gap-2 text-xs text-rcm-600 font-medium">
              <div className="w-4 h-4 border-2 border-rcm-300 border-t-rcm-600 rounded-full animate-spin" />
              {progress}
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">{selectedTabs.length} page(s) selected</span>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={exporting} className="px-4 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={handleExport} disabled={exporting || selectedTabs.length === 0} className="px-4 py-2 text-xs rounded-lg bg-rcm-600 text-primary-foreground font-semibold hover:bg-rcm-700 transition-colors disabled:opacity-50">
              {mode === 'pdf' ? 'Download PDF' : 'Print'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
