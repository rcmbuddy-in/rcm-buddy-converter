import React, { createContext, useContext, useState } from 'react';

type ChartType = 'bar' | 'line';

interface ChartPrefsContextType {
  chartType: ChartType;
  setChartType: (t: ChartType) => void;
}

const ChartPrefsContext = createContext<ChartPrefsContextType | null>(null);

export function useChartPrefs() {
  const ctx = useContext(ChartPrefsContext);
  if (!ctx) throw new Error('useChartPrefs must be used within ChartPrefsProvider');
  return ctx;
}

export function ChartPrefsProvider({ children }: { children: React.ReactNode }) {
  const [chartType, setChartType] = useState<ChartType>('bar');

  return (
    <ChartPrefsContext.Provider value={{ chartType, setChartType }}>
      {children}
    </ChartPrefsContext.Provider>
  );
}
