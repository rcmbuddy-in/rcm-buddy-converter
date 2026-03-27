import React, { createContext, useContext, useState, useCallback } from 'react';
import { ClaimRecord, GlobalData, parseExcelFile, computeGlobals } from '@/lib/rcm-data';

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
  handleFileUpload: (buffer: ArrayBuffer) => void;
  resetData: () => void;
  getGroupKey: (x: ClaimRecord) => string;
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
  const [period, setPeriod] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [allRecords, setAllRecords] = useState<ClaimRecord[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  const handleFileUpload = useCallback((buffer: ArrayBuffer) => {
    const records = parseExcelFile(buffer);
    setAllRecords(records);

    const years: Record<string, boolean> = {};
    records.forEach(d => {
      if (d.admission) years[d.admission.getFullYear().toString()] = true;
    });
    setAvailableYears(Object.keys(years).sort().reverse());

    const g = computeGlobals(records);
    setGlobalData(g);
    setPeriod('all');
  }, []);

  const handlePeriodChange = useCallback((p: string) => {
    setPeriod(p);
    const filtered = p === 'all' ? allRecords : allRecords.filter(d => d.admission && d.admission.getFullYear().toString() === p);
    const g = computeGlobals(filtered);
    setGlobalData(g);
  }, [allRecords]);

  const resetData = useCallback(() => {
    setGlobalData(null);
    setAllRecords([]);
    setActiveTab('overview');
    setPeriod('all');
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
    }}>
      {children}
    </DashboardContext.Provider>
  );
}
