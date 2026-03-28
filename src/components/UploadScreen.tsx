import { useCallback, useState, useRef } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import logo from '@/assets/rcm-buddy-logo.png';

export function UploadScreen() {
  const { handleFileUpload } = useDashboard();
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setLoading(true);
    setLoadMsg(`Reading ${file.name}…`);
    const reader = new FileReader();
    reader.onload = (e) => {
      setLoadMsg('Computing KPIs…');
      setTimeout(() => {
        try {
          handleFileUpload(e.target!.result as ArrayBuffer);
        } catch (err: any) {
          alert('Error reading file: ' + err.message);
        }
        setLoading(false);
      }, 50);
    };
    reader.readAsArrayBuffer(file);
  }, [handleFileUpload]);

  if (loading) {
    return (
      <div className="fixed inset-0 upload-gradient flex flex-col items-center justify-center z-50">
        <div className="w-11 h-11 border-[3px] border-primary-foreground/25 border-t-primary-foreground rounded-full animate-spin mb-4" />
        <div className="text-[15px] font-medium text-primary-foreground">{loadMsg}</div>
        <div className="text-xs text-primary-foreground/60 mt-1">Analyzing claims data…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen upload-gradient flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(255,255,255,0.07)_0%,transparent_60%)] pointer-events-none" />

      <div className="flex items-center gap-3 mb-10 relative z-10">
        <img src={logo} alt="RCM Buddy" className="w-14 h-14 rounded-xl bg-primary-foreground/10 p-1" />
        <div>
          <div className="font-display text-3xl font-bold text-primary-foreground tracking-tight">RCM Buddy Intelligence</div>
          <div className="text-[10px] font-semibold tracking-[2px] uppercase text-primary-foreground/50 mt-0.5">Insurance KPI Analyzer</div>
        </div>
      </div>

      <div className="bg-card rounded-2xl p-11 w-[520px] max-w-[92vw] shadow-elevated relative z-10">
        <h2 className="font-display text-xl font-bold text-foreground mb-1">Upload Claims Export</h2>
        <p className="text-[13px] text-muted-foreground mb-6">
          Drop your Excel file to generate full KPI analysis — financials, TAT, denials, AR aging, payer benchmarks and revenue leakage.
        </p>

        <div
          className={`border-2 border-dashed rounded-xl p-9 text-center cursor-pointer transition-all ${
            dragOver ? 'border-rcm-500 bg-rcm-100' : 'border-rcm-200 bg-rcm-50 hover:border-rcm-500 hover:bg-rcm-100'
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
        >
          <div className="text-4xl mb-2">📂</div>
          <div className="text-sm font-medium text-foreground/70">Drop .xlsx here or click to browse</div>
          <div className="text-xs text-muted-foreground mt-1">Standard claims export format · All 39 columns supported</div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) processFile(e.target.files[0]); }}
        />

        <button
          onClick={() => fileRef.current?.click()}
          className="mt-4 w-full py-3 bg-rcm-600 text-primary-foreground rounded-lg text-sm font-semibold hover:bg-rcm-700 transition-colors"
        >
          Choose File
        </button>

        <div className="mt-4 p-3 bg-muted rounded-lg text-[11px] text-muted-foreground">
          <strong className="text-foreground block mb-1">Expected columns:</strong>
          Date of Admission/Discharge · TPA Name · Insurance Company · Claimed Amount · Approved Amount · Shortfall · Copay · Hospital Discount · Settled Amount · TDS Amount · Claim Status · Document Submission Date · Payment Update Date · Treatment · Diagnosis
        </div>
      </div>
    </div>
  );
}
