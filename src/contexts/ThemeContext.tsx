import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface ThemeContextType {
  brandColor: string; // hex e.g. #B91C1C
  setBrandColor: (hex: string) => void;
  resetBrand: () => void;
}

const DEFAULT_BRAND = '#B91C1C'; // current crimson
const STORAGE_KEY = 'rcm-brand-color';

const ThemeContext = createContext<ThemeContextType | null>(null);

const FALLBACK: ThemeContextType = {
  brandColor: DEFAULT_BRAND,
  setBrandColor: () => {},
  resetBrand: () => {},
};

export function useTheme() {
  return useContext(ThemeContext) ?? FALLBACK;
}

/* ---------- color helpers ---------- */
function hexToHsl(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      case b: hue = (r - g) / d + 4; break;
    }
    hue *= 60;
  }
  return [Math.round(hue), Math.round(sat * 100), Math.round(l * 100)];
}

const hslStr = (h: number, s: number, l: number) =>
  `${h} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}%`;

function applyBrand(hex: string) {
  const hsl = hexToHsl(hex);
  if (!hsl) return;
  const [h, s] = hsl;
  const root = document.documentElement;
  // Generate ramp by varying lightness; keep saturation close to source
  const ramp: Record<string, [number, number]> = {
    '900': [s, 29],
    '800': [s - 7, 36],
    '700': [s - 3, 45],
    '600': [s + 4, 51],
    '500': [s + 9, 60],
    '400': [s + 11, 70],
    '200': [s + 18, 88],
    '100': [s + 11, 93],
    '50':  [s + 5, 97],
  };
  Object.entries(ramp).forEach(([k, [ss, ll]]) => {
    root.style.setProperty(`--rcm-${k}`, hslStr(h, ss, ll));
  });
  root.style.setProperty('--primary', hslStr(h, s, 29));
  root.style.setProperty('--ring', hslStr(h, s, 29));
  root.style.setProperty('--secondary', hslStr(h, Math.max(20, s - 15), 96));
  root.style.setProperty('--accent', hslStr(h, Math.max(20, s - 15), 96));
  root.style.setProperty('--secondary-foreground', hslStr(h, s, 29));
  root.style.setProperty('--accent-foreground', hslStr(h, s, 29));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [brandColor, setBrandColorState] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_BRAND;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_BRAND;
  });

  useEffect(() => {
    applyBrand(brandColor);
    try { localStorage.setItem(STORAGE_KEY, brandColor); } catch {}
  }, [brandColor]);

  const setBrandColor = useCallback((hex: string) => {
    if (hexToHsl(hex)) setBrandColorState(hex);
  }, []);

  const resetBrand = useCallback(() => setBrandColorState(DEFAULT_BRAND), []);

  return (
    <ThemeContext.Provider value={{ brandColor, setBrandColor, resetBrand }}>
      {children}
    </ThemeContext.Provider>
  );
}