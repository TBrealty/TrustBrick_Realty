import { useId } from "react";

type MarkProps = {
  className?: string;
  /** "brand" keeps the logo's brick and green; "mono" renders in currentColor. */
  tone?: "brand" | "mono";
  title?: string;
};

/**
 * Vector redraw of the Trustbrick shield: an open arch, brick courses and a check.
 * Replace with the master SVG from /public/images/brand when it is available.
 *
 * The brand tone keeps the logo's own colours on every background: the arch stays navy
 * rather than turning white on dark surfaces. Navy on near-black would vanish, so a soft
 * halo sits behind the arch, faded in by `--logo-halo` (set on dark surfaces in globals.css).
 */
export function LogoMark({ className, tone = "brand", title }: MarkProps) {
  const uid = useId().replace(/:/g, "");
  const brand = tone === "brand";
  const arch = brand ? "var(--navy)" : "currentColor";
  const brick = brand ? "var(--brick-bright)" : "currentColor";
  const check = brand ? "#2f9a56" : "currentColor";

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <clipPath id={`shield-${uid}`}>
          <path d="M13 44h74v14c0 18-15 30-37 40C28 88 13 76 13 58z" />
        </clipPath>
        <mask id={`knock-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          <path d="M35 33l15 16L86 8" fill="none" stroke="#000" strokeWidth="19" strokeLinejoin="miter" />
        </mask>
        {brand && (
          <filter id={`halo-${uid}`} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        )}
      </defs>
      <g mask={`url(#knock-${uid})`}>
        {/* Soft light behind the arch, so navy reads on a dark surface without a hard outline. */}
        {brand && (
          <g style={{ opacity: "var(--logo-halo, 0)", transition: "opacity 0.5s var(--ease-smooth)" }}>
            <path
              d="M17 40V21C33 7 67 7 83 21v19"
              fill="none"
              stroke="#fff"
              strokeWidth="11"
              strokeLinecap="round"
              filter={`url(#halo-${uid})`}
              opacity="0.8"
            />
          </g>
        )}
        <path
          d="M17 40V21C33 7 67 7 83 21v19"
          fill="none"
          strokeWidth="7.5"
          strokeLinecap="butt"
          style={{ stroke: arch, transition: "stroke 0.5s var(--ease-smooth)" }}
        />
        <g clipPath={`url(#shield-${uid})`} style={{ fill: brick, transition: "fill 0.5s var(--ease-smooth)" }}>
          <rect x="13" y="44" width="23" height="11" />
          <rect x="39" y="44" width="22" height="11" />
          <rect x="64" y="44" width="23" height="11" />
          <rect x="13" y="58" width="11" height="11" />
          <rect x="27" y="58" width="21.5" height="11" />
          <rect x="51.5" y="58" width="21.5" height="11" />
          <rect x="76" y="58" width="11" height="11" />
          <rect x="13" y="72" width="23" height="11" />
          <rect x="39" y="72" width="22" height="11" />
          <rect x="64" y="72" width="23" height="11" />
          <rect x="13" y="86" width="36" height="14" />
          <rect x="51.5" y="86" width="36" height="14" />
        </g>
      </g>
      <path
        d="M35 33l15 16L86 8"
        fill="none"
        strokeWidth="9"
        strokeLinejoin="miter"
        style={{ stroke: check, transition: "stroke 0.5s var(--ease-smooth)" }}
      />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  markClassName?: string;
  tone?: "brand" | "mono";
};

export function Logo({ className, markClassName = "size-7", tone = "brand" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 sm:gap-2.5 ${className ?? ""}`}>
      <LogoMark className={markClassName} tone={tone} />
      <span className="text-[1rem] font-semibold tracking-[-0.02em] sm:text-[1.0625rem]">
        Trust
        <span className={`transition-colors duration-500 ease-(--ease-smooth) ${tone === "brand" ? "text-brick-bright" : ""}`}>brick</span>
      </span>
    </span>
  );
}
