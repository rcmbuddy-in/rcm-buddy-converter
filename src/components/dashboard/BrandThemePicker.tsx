import { useTheme } from '@/contexts/ThemeContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Palette } from 'lucide-react';

const PRESETS = [
  { name: 'Crimson', hex: '#B91C1C' },
  { name: 'Ocean Blue', hex: '#1D4ED8' },
  { name: 'Forest', hex: '#15803D' },
  { name: 'Royal Purple', hex: '#6D28D9' },
  { name: 'Teal', hex: '#0F766E' },
  { name: 'Slate', hex: '#334155' },
  { name: 'Amber', hex: '#B45309' },
  { name: 'Rose', hex: '#BE185D' },
];

export function BrandThemePicker() {
  const { brandColor, setBrandColor, resetBrand } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Customize brand color"
          className="flex items-center gap-1.5 bg-primary-foreground/15 border border-primary-foreground/25 text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary-foreground/25 transition-colors"
        >
          <Palette className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Theme</span>
          <span className="w-3.5 h-3.5 rounded-full border border-primary-foreground/40" style={{ background: brandColor }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground mb-2">Hospital Brand Color</div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="w-10 h-9 rounded cursor-pointer border border-border bg-transparent"
                aria-label="Pick brand color"
              />
              <input
                type="text"
                value={brandColor.toUpperCase()}
                onChange={e => setBrandColor(e.target.value)}
                className="flex-1 px-2.5 py-1.5 border border-border rounded-md text-xs font-mono uppercase outline-none focus:border-rcm-400"
                maxLength={7}
              />
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground mb-2">Presets</div>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.hex}
                  onClick={() => setBrandColor(p.hex)}
                  title={p.name}
                  className={`h-9 rounded-md border-2 transition-all ${brandColor.toLowerCase() === p.hex.toLowerCase() ? 'border-foreground scale-105' : 'border-transparent hover:scale-105'}`}
                  style={{ background: p.hex }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={resetBrand}
            className="w-full text-[11px] text-muted-foreground hover:text-rcm-700 font-semibold py-1.5"
          >
            ↺ Reset to default crimson
          </button>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Your theme is saved on this browser and applied across all reports including PDF exports.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}