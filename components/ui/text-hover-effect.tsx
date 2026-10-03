"use client";

/**
 * Text Hover Effect, adapted from Aceternity UI (ui.aceternity.com/components/text-hover-effect).
 *
 * Changes from the original:
 * - Brand palette: an idle hairline outline, a fired-brick outline on hover, and a brighter brick
 *   spotlight that follows the cursor.
 * - Set in the display serif, sized by a viewBox measured for the word, so it scales with its container.
 * - Unique gradient and mask IDs (useId), so two instances on a page cannot collide.
 * - The outline draws in when it scrolls into view, not on page load, and not at all with reduced motion.
 * - The mask position is derived in the pointer handler rather than in an effect.
 */
import { useId, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

type Props = {
  text: string;
  /** viewBox for the word; tune it so the text fills the box edge to edge. */
  viewBox?: string;
  /** Font size in viewBox units. */
  fontSize?: number;
  /** Vertical centre of the text in viewBox units. Push it past the bottom to crop the word. */
  y?: number | string;
  /** Seconds for the spotlight to catch up with the cursor. */
  duration?: number;
  className?: string;
};

export function TextHoverEffect({ text, viewBox = "0 0 300 100", fontSize = 72, y = "50%", duration = 0.12, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState(false);
  const [maskPosition, setMaskPosition] = useState({ cx: "50%", cy: "50%" });
  const reduceMotion = useReducedMotion();
  // Observe the whole svg, not the text: when the word is cropped, most of the text box is hidden.
  const inView = useInView(svgRef, { once: true, amount: 0.5 });

  const uid = useId().replace(/:/g, "");
  const gradientId = `tb-text-gradient-${uid}`;
  const revealId = `tb-text-reveal-${uid}`;
  const maskId = `tb-text-mask-${uid}`;

  function track(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMaskPosition({
      cx: `${((event.clientX - rect.left) / rect.width) * 100}%`,
      cy: `${((event.clientY - rect.top) / rect.height) * 100}%`,
    });
  }

  const textProps = {
    x: "50%",
    y,
    textAnchor: "middle",
    dominantBaseline: "central",
    fontSize,
    className: "fill-transparent font-serif",
  } as const;

  return (
    <svg
      ref={svgRef}
      width="100%"
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      onPointerEnter={(e) => {
        track(e);
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerMove={track}
      className={`block select-none ${className ?? ""}`}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#de6a3d" />
          <stop offset="35%" stopColor="#e8894f" />
          <stop offset="65%" stopColor="#c45a31" />
          <stop offset="100%" stopColor="#de6a3d" />
        </linearGradient>

        <motion.radialGradient
          id={revealId}
          gradientUnits="userSpaceOnUse"
          r="22%"
          initial={{ cx: "50%", cy: "50%" }}
          animate={maskPosition}
          transition={reduceMotion ? { duration: 0 } : { duration, ease: "easeOut" }}
        >
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </motion.radialGradient>
        <mask id={maskId}>
          <rect x="0" y="0" width="100%" height="100%" fill={`url(#${revealId})`} />
        </mask>
      </defs>

      {/* Hover: the whole word turns to a brick outline. */}
      <text
        {...textProps}
        strokeWidth="0.35"
        stroke="var(--brick)"
        style={{ opacity: hovered ? 0.9 : 0, transition: "opacity 400ms var(--ease-smooth, ease)" }}
      >
        {text}
      </text>

      {/* Idle: a hairline outline that draws itself in once the footer is on screen. */}
      <motion.text
        {...textProps}
        strokeWidth="0.3"
        stroke="color-mix(in oklab, var(--paper) 20%, transparent)"
        initial={reduceMotion ? false : { strokeDashoffset: 1000, strokeDasharray: 1000 }}
        animate={inView ? { strokeDashoffset: 0, strokeDasharray: 1000 } : undefined}
        transition={{ duration: 4, ease: "easeInOut" }}
      >
        {text}
      </motion.text>

      {/* Spotlight: a brighter brick gradient revealed around the cursor. */}
      <text {...textProps} strokeWidth="0.45" stroke={`url(#${gradientId})`} mask={`url(#${maskId})`} style={{ opacity: hovered ? 1 : 0 }}>
        {text}
      </text>
    </svg>
  );
}
