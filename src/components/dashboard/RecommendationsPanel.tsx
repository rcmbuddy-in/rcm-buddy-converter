import { GlobalData } from '@/lib/rcm-data';
import { generateRecommendations, Recommendation } from '@/lib/insights-engine';
import { SEVERITY } from '@/lib/rcm-utils';

const COLOR: Record<Recommendation['priority'], string> = {
  high: SEVERITY.critical,
  medium: SEVERITY.warning,
  low: SEVERITY.neutral,
};
const LABEL: Record<Recommendation['priority'], string> = {
  high: 'High Priority',
  medium: 'Medium Priority',
  low: 'Low Priority',
};

export function RecommendationsPanel({ g }: { g: GlobalData }) {
  const recs = generateRecommendations(g);
  const groups: Recommendation['priority'][] = ['high', 'medium', 'low'];
  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-[13px] font-semibold text-foreground">RCM Recommendations</div>
          <div className="text-[11px] text-muted-foreground">Prioritised actions inferred from current data</div>
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Intelligence</span>
      </div>
      <div className="space-y-4">
        {groups.map(p => {
          const items = recs.filter(r => r.priority === p);
          if (!items.length) return null;
          return (
            <div key={p}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: COLOR[p] }} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: COLOR[p] }}>{LABEL[p]}</span>
              </div>
              <div className="space-y-2">
                {items.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border p-3 bg-background/40">
                    <div className="text-[12.5px] font-semibold text-foreground">{r.title}</div>
                    <div className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">{r.rationale}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}