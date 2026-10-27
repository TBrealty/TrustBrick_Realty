"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { ButtonLink } from "@/components/buttons/ButtonLink";
import { SectionLabel } from "@/components/typography/SectionLabel";
import { Lines } from "@/components/typography/Lines";
import type { TourData } from "@/lib/tours/terms";

// The 360° viewer is heavy: it loads only when someone starts the tour.
const TourViewer = dynamic(() => import("@/components/tours/TourViewer").then((m) => m.TourViewer), {
  ssr: false,
  loading: () => <div className="h-[min(70svh,40rem)] w-full animate-pulse rounded-[4px] bg-contrast-2" />,
});

const DEMO: TourData = {
  rooms: [{ id: "demo", name: "Glasshouse bedroom", url: "/images/tour/glasshouse-360.jpg", thumbnailUrl: null }],
  model: null,
  link: null,
};

const PLUS = ["Every 360° tour and 3D view on Trustbrick", "AI locality insights for any property", "Price-drop alerts on homes you've saved"];

/**
 * A real 360° room to walk around, right on the landing page, and the plan that opens every tour.
 * The photo is a sample (Poly Haven, CC0), not a listing.
 */
export function TourShowcase() {
  const [started, setStarted] = useState(false);

  return (
    <section id="tours" aria-labelledby="tours-title" data-nav="dark" className="surface-dark relative overflow-hidden bg-contrast py-20 text-on-contrast sm:py-24 lg:py-28">
      <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] size-[36rem] rounded-full bg-brick/20 blur-3xl" />
      <div className="shell relative">
        <div className="grid gap-y-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <SectionLabel index="02" className="mb-8 text-mist">
              Virtual tours
            </SectionLabel>
            <h2 id="tours-title" data-reveal="lines" className="display text-[clamp(2.5rem,5.4vw,5.75rem)]">
              <Lines lines={["Walk through it", <em key="e">before you visit.</em>]} step={120} />
            </h2>
          </div>
          <p data-reveal className="max-w-[42ch] text-[1.0625rem] leading-relaxed text-on-contrast/75 lg:col-span-5 lg:pb-3">
            Look around every room in 360°, or turn a 3D model of the home, before you travel to see it. Try this one: drag to look
            around, or move your phone.
          </p>
        </div>

        <div data-reveal className="mt-10 sm:mt-14">
          {started ? (
            <TourViewer tour={DEMO} title="Sample home" />
          ) : (
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="group relative block h-[min(70svh,40rem)] w-full overflow-hidden rounded-[4px] bg-contrast-2 text-left"
              aria-label="Start the sample 360° tour"
            >
              <Image src="/images/tour/glasshouse-poster.jpg" alt="" fill sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover transition-transform duration-700 ease-(--ease-smooth) group-hover:scale-[1.02]" />
              <span aria-hidden className="absolute inset-0 bg-linear-to-t from-contrast/80 via-contrast/10 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-5 sm:p-8">
                <span>
                  <span className="eyebrow block text-on-contrast/70">Sample home · 360°</span>
                  <span className="display mt-2 block text-[clamp(1.75rem,3vw,2.5rem)] leading-none">Glasshouse bedroom</span>
                </span>
                <span className="btn btn-light pointer-events-none">
                  <span>Start the 360° tour</span>
                  <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none">
                    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M6.5 5.5 11 8l-4.5 2.5z" fill="currentColor" />
                  </svg>
                </span>
              </span>
            </button>
          )}
          <p className="mt-3 text-[0.75rem] text-on-contrast/50">Sample room for illustration (photo: Poly Haven, CC0). Not a listing.</p>
        </div>

        <div data-reveal className="mt-12 grid gap-8 border-t border-line-dark pt-10 sm:mt-14 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="eyebrow flex items-center gap-3 text-brick-bright">
              <span aria-hidden className="h-px w-8 bg-current" />
              Trustbrick Plus
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
              {PLUS.map((f) => (
                <li key={f} className="flex gap-2.5 text-[0.9375rem] leading-snug text-on-contrast/85">
                  <span aria-hidden className="text-brick-bright">✦</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
            <ButtonLink href="/plans" variant="light" arrow>
              Unlock every tour, free trial
            </ButtonLink>
            <ButtonLink href="/rent?tour=1" variant="ghost-light">
              Homes with tours
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
