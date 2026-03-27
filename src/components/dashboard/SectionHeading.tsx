interface SectionHeadingProps {
  title: string;
  tag: string;
}

export function SectionHeading({ title, tag }: SectionHeadingProps) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <h3 className="font-display text-lg font-bold text-foreground">{title}</h3>
      <span className="text-[10px] font-bold tracking-wider uppercase text-rcm-500">{tag}</span>
    </div>
  );
}
