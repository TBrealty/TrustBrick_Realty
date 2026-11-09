type Props = {
  /** The chapter number; left out on pages that aren't numbered. */
  index?: string;
  children: React.ReactNode;
  className?: string;
};

/** Small mono chapter marker: "01 — The idea", or just "— The idea" without a number. */
export function SectionLabel({ index, children, className }: Props) {
  return (
    <p className={`eyebrow flex items-center gap-3 ${className ?? ""}`}>
      {index && <span className="tabular-nums">{index}</span>}
      <span aria-hidden className="h-px w-8 bg-current opacity-40" />
      <span>{children}</span>
    </p>
  );
}
