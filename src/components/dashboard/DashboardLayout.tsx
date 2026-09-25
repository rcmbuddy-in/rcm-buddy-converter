import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { useChartPrefs } from '@/contexts/ChartPrefsContext';
import { ExportDialog } from './ExportDialog';
import { BrandThemePicker } from './BrandThemePicker';
import { DataQualityBadge } from './DataQualityBadge';
import { exportClaimsWorkbook } from '@/lib/claims-export';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import logo from '@/assets/rcm-buddy-logo.png';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'variance', label: '⇅ Variance' },
  { id: 'audit', label: '🔍 Formula Audit' },
  { id: 'financial', label: 'Financial KPIs' },
  { id: 'cashflow', label: '💰 Cash Flow 90d' },
  { id: 'dso', label: '⚡ DSO & Velocity' },
  { id: 'profitability', label: '📊 Payer Profitability' },
  { id: 'tat', label: 'TAT Analysis' },
  { id: 'denial', label: 'Denial Analysis' },
  { id: 'ar', label: 'AR Management' },
  { id: 'payer', label: 'Payer Performance' },
  { id: 'mom', label: '📈 MoM Trends' },
  { id: 'corporate', label: '🏢 Corporate' },
  { id: 'leakage', label: '⚠ Revenue Leakage', special: true },
  { id: 'ai-report', label: '✦ AI Report', ai: true },
];

export function TopBar() {
  const { globalData, resetData } = useDashboard();
  const [showExport, setShowExport] = useState(false);
  if (!globalData) return null;

  return (
    <>
      <div className="topbar-gradient px-7 h-[62px] flex items-center justify-between sticky top-0 z-50 shadow-elevated no-print">
        <div className="flex items-center gap-3">
          <img src={logo} alt="RCM Buddy" className="w-10 h-10 rounded-lg bg-primary-foreground/10 p-0.5" />
          <div>
            <div className="font-display text-lg font-bold text-primary-foreground">RCM Buddy</div>
            <div className="text-[10px] text-primary-foreground/45 tracking-wider uppercase">Revenue Care for Healthcare</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-full px-3 py-1 text-xs text-primary-foreground/85 font-medium">
            {globalData.hospitalName}
          </span>
          <span className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-full px-3 py-1 text-xs text-primary-foreground/85 font-medium">
            {globalData.n.toLocaleString()} claims
          </span>
          <span className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-full px-3 py-1 text-xs text-primary-foreground/85 font-medium hidden md:inline-block">
            {globalData.dateRange}
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <DataQualityBadge />
          <BrandThemePicker />
          <button
            onClick={() => exportClaimsWorkbook(globalData)}
            title="Download underlying claims data with formulas & definitions"
            className="bg-primary-foreground/15 border border-primary-foreground/25 text-primary-foreground rounded-lg px-3.5 py-1.5 text-xs font-semibold hover:bg-primary-foreground/25 transition-colors"
          >
            ⬇ Claims Excel
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="bg-primary-foreground/15 border border-primary-foreground/25 text-primary-foreground rounded-lg px-3.5 py-1.5 text-xs font-semibold hover:bg-primary-foreground/25 transition-colors"
          >
            📄 Export / Print
          </button>
          <button
            onClick={resetData}
            className="bg-primary-foreground text-rcm-700 border-none rounded-lg px-3.5 py-1.5 text-xs font-semibold hover:bg-rcm-50 transition-colors"
          >
            ↑ New File
          </button>
        </div>
      </div>
      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
    </>
  );
}

export function NavTabs() {
  const { activeTab, setActiveTab } = useDashboard();

  return (
    <div className="bg-card border-b border-border px-7 flex gap-0 sticky top-[62px] z-40 overflow-x-auto no-print">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`px-4 py-3.5 text-[13px] font-medium whitespace-nowrap border-b-[2.5px] transition-all ${
            activeTab === tab.id
              ? 'text-rcm-700 border-rcm-600 font-semibold'
              : tab.special
                ? 'text-rcm-500 font-semibold border-transparent hover:text-rcm-600'
                : tab.ai
                  ? 'topbar-gradient text-primary-foreground border-transparent rounded-t-lg'
                  : 'text-muted-foreground border-transparent hover:text-rcm-600'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function DatePickerButton({ date, onSelect, placeholder }: { date: Date | undefined; onSelect: (d: Date | undefined) => void; placeholder: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-md text-xs font-medium bg-card cursor-pointer hover:border-rcm-400 transition-colors",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="h-3 w-3" />
          {date ? format(date, 'dd MMM yyyy') : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar() {
  const { groupBy, setGroupBy, period, setPeriod, availableYears, dateFrom, dateTo, setDateFrom, setDateTo } = useDashboard();
  const { chartType, setChartType } = useChartPrefs();

  const clearDates = () => {
    setDateFrom(undefined);
    if (dateTo) setTimeout(() => setDateTo(undefined), 0);
  };

  return (
    <div className="bg-card border-b border-border/50 px-7 py-2.5 flex items-center gap-4 flex-wrap no-print">
      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">Period</span>
      <select
        value={period}
        onChange={e => setPeriod(e.target.value)}
        className="px-2.5 py-1 border border-border rounded-md text-xs font-medium text-foreground bg-card cursor-pointer focus:border-rcm-400 outline-none"
      >
        <option value="all">All Time</option>
        {availableYears.map(y => <option key={y} value={y}>FY {y}</option>)}
      </select>

      <div className="w-px h-5 bg-border" />

      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">Date Range</span>
      <DatePickerButton date={dateFrom} onSelect={setDateFrom} placeholder="From" />
      <span className="text-muted-foreground text-xs">→</span>
      <DatePickerButton date={dateTo} onSelect={setDateTo} placeholder="To" />
      {(dateFrom || dateTo) && (
        <button onClick={clearDates} className="text-[10px] text-rcm-600 hover:text-rcm-700 font-semibold">✕ Clear</button>
      )}

      <div className="w-px h-5 bg-border" />

      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">Group By</span>
      <div className="flex border border-border rounded-md overflow-hidden">
        {(['tpa', 'insurer'] as const).map(g => (
          <button
            key={g}
            onClick={() => setGroupBy(g)}
            className={`px-2.5 py-1 text-[11px] font-semibold transition-all ${
              groupBy === g ? 'bg-rcm-600 text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-rcm-50 hover:text-rcm-600'
            }`}
          >
            {g === 'tpa' ? 'TPA' : 'Insurer'}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-border" />

      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">Charts</span>
      <div className="flex border border-border rounded-md overflow-hidden">
        {(['bar', 'line'] as const).map(ct => (
          <button
            key={ct}
            onClick={() => setChartType(ct)}
            className={`px-2.5 py-1 text-[11px] font-semibold transition-all ${
              chartType === ct ? 'bg-rcm-600 text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-rcm-50 hover:text-rcm-600'
            }`}
          >
            {ct === 'bar' ? '▐ Bar' : '⌇ Line'}
          </button>
        ))}
      </div>
    </div>
  );
}
