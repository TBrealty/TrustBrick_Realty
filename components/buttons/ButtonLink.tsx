import type { ComponentProps } from "react";

type Variant = "light" | "dark" | "ghost-light" | "ghost-dark";

type Props = ComponentProps<"a"> & {
  variant?: Variant;
  arrow?: boolean;
};

export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className ?? "size-4"} aria-hidden fill="none">
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function ButtonLink({ variant = "dark", arrow = false, className, children, ...rest }: Props) {
  return (
    <a className={`btn btn-${variant} ${className ?? ""}`} {...rest}>
      <span>{children}</span>
      {arrow && <Arrow className="btn-arrow size-4" />}
    </a>
  );
}
