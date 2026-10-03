export function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-10">
      <p className="eyebrow flex items-center gap-3 text-brick">
        <span aria-hidden className="h-px w-8 bg-current" />
        {eyebrow}
      </p>
      <h1 className="display mt-6 text-[clamp(2.5rem,6vw,3.75rem)] leading-[0.95]">{title}</h1>
      {children && <div className="mt-5 text-[1rem] leading-relaxed text-graphite">{children}</div>}
    </div>
  );
}
