/** The heading block every Buy tool and guide opens with. */
export function ToolIntro({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="border-b border-line-light pb-8">
      <p className="eyebrow flex items-center gap-3 text-brick">
        <span aria-hidden className="h-px w-8 bg-current" />
        {eyebrow}
      </p>
      <h1 className="display mt-4 max-w-[20ch] text-[clamp(2.25rem,5vw,3.75rem)] leading-[0.95]">{title}</h1>
      {children && <div className="mt-4 max-w-[62ch] text-[1rem] leading-relaxed text-graphite">{children}</div>}
    </div>
  );
}

/** Numbers from the address bar, kept within bounds; anything else falls back. */
export function numberParam(value: string | string[] | undefined, min: number, max: number, fallback: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}
