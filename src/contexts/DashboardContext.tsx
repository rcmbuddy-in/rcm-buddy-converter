import React, { createContext, useContext, useState, useCallback } from 'react';
import { ClaimRecord, GlobalData, parseExcelFile, parseRawSheet, computeGlobals } from '@/lib/rcm-data';
import { runDataQuality, DQReport } from '@/lib/dq-engine';

type GroupBy = 'tpa' | 'insurer';

interface DashboardContextType {
  globalData: GlobalData | null;
  setGlobalData: (data: GlobalData | null) => void;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  period: string;
  setPeriod: (p: string) => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
  availableYears: string[];
  handleFileUpload: (buffer: ArrayBuffer, fileName?: string) => void;
  resetData: () => void;
  getGroupKey: (x: ClaimRecord) => string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  dqReport: DQReport | null;
  dqModalOpen: boolean;
  openDQModal: () => void;
  closeDQModal: () => void;
  proceedAfterDQ: () => void;
  bypassDQ: () => void;
  allRecords: ClaimRecord[];
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [globalData, setGlobalData] = useState<GlobalData | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('tpa');
  const [period, setPeriodState] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [allRecords, setAllRecords] = useState<ClaimRecord[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [dqReport, setDqReport] = useState<DQReport | null>(null);
  const [dqModalOpen, setDqModalOpen] = useState(false);

  const recompute = useCallback((records: ClaimRecord[], p: string, from?: Date, to?: Date) => {
    let filtered = records;
    if (p !== 'all') {
      filtered = filtered.filter(d => d.admission && d.admission.getFullYear().toString() === p);
    }
    if (from) {
      // Normalize to date-only comparison (strip time)
      const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
      filtered = filtered.filter(d => {
        if (!d.admission) return false;
        const admDay = new Date(d.admission.getFullYear(), d.admission.getMonth(), d.admission.getDate()).getTime();
        return admDay >= fromDay;
      });
    }
    if (to) {
      const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
      filtered = filtered.filter(d => {
        if (!d.admission) return false;
        const admDay = new Date(d.admission.getFullYear(), d.admission.getMonth(), d.admission.getDate()).getTime();
        return admDay <= toDay;
      });
    }
    console.log(`[RCM] Recompute: period=${p}, from=${from?.toISOString()}, to=${to?.toISOString()}, filtered=${filtered.length}/${records.length}`);
    setGlobalData(computeGlobals(filtered));
  }, []);

  const handleFileUpload = useCallback((buffer: ArrayBuffer, fileName?: string) => {
    const rawRows = parseRawSheet(buffer);
    const records = parseExcelFile(buffer);
    const report = runDataQuality(rawRows, records, fileName);

    setDqReport(report);
    setDqModalOpen(true);
    setPeriodState('all');
    setDateFrom(undefined);
    setDateTo(undefined);

    if (report.fileRejected) {
      // do not commit any data; user must fix and re-upload
      setAllRecords([]);
      setAvailableYears([]);
      setGlobalData(null);
    }
    // else: wait for user to click Proceed in the modal
  }, []);

  const proceedAfterDQ = useCallback(() => {
    if (!dqReport || dqReport.fileRejected) return;
    const records = dqReport.cleanData;
    setAllRecords(records);
    const years: Record<string, boolean> = {};
    records.forEach(d => {
      if (d.admission) years[d.admission.getFullYear().toString()] = true;
    });
    setAvailableYears(Object.keys(years).sort().reverse());
    setGlobalData(computeGlobals(records));
    setDqModalOpen(false);
  }, [dqReport]);

  // Bypass quality check entirely — load every parsed record (clean + warning + quarantined)
  const bypassDQ = useCallback(() => {
    if (!dqReport) return;
    const all = [
      ...dqReport.cleanData,
      ...dqReport.quarantined.map(q => q.record),
    ];
    setAllRecords(all);
    const years: Record<string, boolean> = {};
    all.forEach(d => {
      if (d.admission) years[d.admission.getFullYear().toString()] = true;
    });
    setAvailableYears(Object.keys(years).sort().reverse());
    setGlobalData(computeGlobals(all));
    setDqModalOpen(false);
  }, [dqReport]);

  const openDQModal = useCallback(() => setDqModalOpen(true), []);
  const closeDQModal = useCallback(() => setDqModalOpen(false), []);

  const handlePeriodChange = useCallback((p: string) => {
    setPeriodState(p);
    setDateFrom(undefined);
    setDateTo(undefined);
    recompute(allRecords, p);
  }, [allRecords, recompute]);

  const handleDateFrom = useCallback((d: Date | undefined) => {
    setDateFrom(d);
    setPeriodState('all');
    recompute(allRecords, 'all', d, dateTo);
  }, [allRecords, dateTo, recompute]);

  const handleDateTo = useCallback((d: Date | undefined) => {
    setDateTo(d);
    setPeriodState('all');
    recompute(allRecords, 'all', dateFrom, d);
  }, [allRecords, dateFrom, recompute]);

  const resetData = useCallback(() => {
    setGlobalData(null);
    setAllRecords([]);
    setActiveTab('overview');
    setPeriodState('all');
    setDateFrom(undefined);
    setDateTo(undefined);
    setDqReport(null);
    setDqModalOpen(false);
  }, []);

  const getGroupKey = useCallback((x: ClaimRecord) => {
    return groupBy === 'insurer' ? x.insurer : x.tpa;
  }, [groupBy]);

  return (
    <DashboardContext.Provider value={{
      globalData, setGlobalData,
      groupBy, setGroupBy,
      period, setPeriod: handlePeriodChange,
      activeTab, setActiveTab,
      availableYears,
      handleFileUpload,
      resetData,
      getGroupKey,
      dateFrom, dateTo,
      setDateFrom: handleDateFrom,
      setDateTo: handleDateTo,
      dqReport,
      dqModalOpen,
      openDQModal,
      closeDQModal,
      proceedAfterDQ,
      bypassDQ,
      allRecords,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}
