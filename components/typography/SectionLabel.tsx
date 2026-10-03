type Props = {
  index: string;
  children: React.ReactNode;
  className?: string;
};

/** Small mono chapter marker: "01 — The idea". */
export function SectionLabel({ index, children, className }: Props) {
  return (
    <p className={`eyebrow flex items-center gap-3 ${className ?? ""}`}>
      <span className="tabular-nums">{index}</span>
      <span aria-hidden className="h-px w-8 bg-current opacity-40" />
      <span>{children}</span>
    </p>
  );
}
