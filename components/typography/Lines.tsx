type Props = {
  lines: React.ReactNode[];
  /** Delay in ms for the first line; each subsequent line adds `step`. */
  delay?: number;
  step?: number;
};

/** Splits a headline into masked lines that rise into place. */
export function Lines({ lines, delay = 0, step = 110 }: Props) {
  return lines.map((line, i) => (
    <span key={i} className="line-mask">
      {/* Trailing space keeps the accessible name readable ("estate, built", not "estate,built"). */}
      <span style={{ "--d": `${delay + i * step}ms` } as React.CSSProperties}>
        {line}{" "}
      </span>
    </span>
  ));
}
