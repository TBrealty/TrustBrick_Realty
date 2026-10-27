"use client";

import { useEffect, useRef, useState } from "react";
import { SectionLabel } from "@/components/typography/SectionLabel";
import { Lines } from "@/components/typography/Lines";
import { NeighborhoodMockup } from "@/components/visualizations/NeighborhoodMockup";
import { PassportMockup } from "@/components/visualizations/PassportMockup";
import { ScoreMockup } from "@/components/visualizations/ScoreMockup";
import { ValueMockup } from "@/components/visualizations/ValueMockup";

const concepts = [
  {
    id: "score",
    name: "Trustbrick Score",
    mark: "™",
    description: "A clearer way to understand property quality and trust signals.",
    Mockup: ScoreMockup,
  },
  {
    id: "passport",
    name: "Property Passport",
    mark: "™",
    description: "A structured digital identity for a property.",
    Mockup: PassportMockup,
  },
  {
    id: "value",
    name: "Trustbrick Value",
    mark: "™",
    description: "An intelligent estimate designed to help you understand what a property is worth.",
    Mockup: ValueMockup,
  },
  {
    id: "neighborhood",
    name: "Neighborhood Intelligence",
    mark: "",
    description: "Understand the place around the property, not just the property itself.",
    Mockup: NeighborhoodMockup,
  },
];

const CYCLE_MS = 8000;

export function Intelligence() {
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  // Once someone chooses a concept (or prefers reduced motion) the tour stops for good.
  const [interacted, setInteracted] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync with a media query
      setInteracted(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = inView && !paused;

  const select = (index: number, focus = false) => {
    setInteracted(true);
    setActive(index);
    if (focus) tabRefs.current[index]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (event.key in keys) {
      event.preventDefault();
      select((active + keys[event.key] + concepts.length) % concepts.length, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      select(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      select(concepts.length - 1, true);
    }
  };

  return (
    <section
      ref={sectionRef}
      id="intelligence"
      aria-labelledby="intelligence-title"
      data-nav="dark"
      className="relative overflow-hidden bg-contrast py-20 text-on-contrast sm:py-24 lg:py-28"
    >
      <div className="shell">
        <div className="grid gap-y-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <SectionLabel index="03" className="mb-8 text-mist">
              Trustbrick Intelligence
            </SectionLabel>
            <h2 id="intelligence-title" data-reveal="lines" className="display text-[clamp(2.5rem,5.4vw,5.75rem)]">
              <Lines lines={["Know more", <em key="e">before you decide.</em>]} />
            </h2>
          </div>
          <div data-reveal className="lg:col-span-4 lg:pb-3">
            <p className="max-w-[40ch] text-[1.0625rem] leading-relaxed text-on-contrast/70">
              Signals, records and context that are usually hard to find, brought into view before you commit. These
              are the ideas Trustbrick Intelligence is being built around.
            </p>
            <p className="eyebrow mt-6 flex items-center gap-2.5 text-brick-bright">
              <span aria-hidden className="size-1.5 bg-current" />
              Coming soon
            </p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-10 sm:mt-14 lg:grid-cols-12 lg:gap-x-8">
          {/* Tabs */}
          <div className="flex flex-col lg:col-span-5">
            <div
              role="tablist"
              aria-label="Trustbrick Intelligence concepts"
              aria-orientation="vertical"
              onKeyDown={onKeyDown}
              className="-mx-(--gutter) flex snap-x gap-2 overflow-x-auto px-(--gutter) [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-t lg:border-line-dark lg:px-0"
            >
              {concepts.map((c, i) => {
                const isActive = i === active;
                return (
                  <button
                    key={c.id}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    id={`tab-${c.id}`}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    aria-controls={`panel-${c.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => select(i)}
                    className={`group relative shrink-0 snap-start text-left transition-colors duration-500 max-lg:border max-lg:px-4 max-lg:py-3 lg:border-b lg:border-line-dark lg:py-7 lg:pl-8 ${
                      isActive ? "text-on-contrast max-lg:border-on-contrast/60" : "text-on-contrast/60 hover:text-on-contrast/80 max-lg:border-line-dark"
                    }`}
                  >
                    {/* progress rail: underline on small screens, vertical rule on desktop */}
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-px lg:inset-x-auto lg:top-7 lg:bottom-7 lg:left-0 lg:h-auto lg:w-px lg:bg-line-dark">
                      {isActive &&
                        (interacted ? (
                          <span className="absolute inset-0 bg-brick-bright" />
                        ) : (
                          <span
                            key={active}
                            className="tab-progress absolute inset-0 bg-brick-bright"
                            style={{ animationDuration: `${CYCLE_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                            onAnimationEnd={() => setActive((a) => (a + 1) % concepts.length)}
                          />
                        ))}
                    </span>
                    <span className="flex items-baseline gap-4">
                      <span className="eyebrow hidden tabular-nums lg:inline">0{i + 1}</span>
                      <span className="text-[0.9375rem] font-medium whitespace-nowrap lg:display lg:text-[2.5rem] lg:leading-none lg:whitespace-normal">
                        {c.name}
                        {c.mark && <sup className="ml-0.5 align-super text-[0.5em] lg:text-[0.4em]">{c.mark}</sup>}
                      </span>
                    </span>
                    <span
                      className={`hidden overflow-hidden pl-[calc(0.6875rem*2+1rem)] transition-[grid-template-rows,opacity] duration-500 ease-(--ease-smooth) lg:grid ${
                        isActive ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <span className="min-h-0">
                        <span className="block max-w-[34ch] pt-3 text-[0.9375rem] leading-relaxed text-on-contrast/65">{c.description}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-6 min-h-[3lh] max-w-[40ch] text-[0.9375rem] leading-relaxed text-on-contrast/70 lg:hidden" aria-live="polite">
              {concepts[active].description}
            </p>
            <div className="mt-auto hidden pt-16 lg:block">
              <p className="display max-w-[18ch] text-[2rem] leading-[1.05] text-on-contrast/85">
                Clearer signals. <em className="text-on-contrast/50">Fewer surprises.</em>
              </p>
              <p className="mt-6 max-w-[40ch] text-[0.8125rem] leading-relaxed text-on-contrast/60">
                Concept previews use sample data and do not describe real properties. Features, names and availability may
                change as the platform develops.
              </p>
            </div>
          </div>

          {/* Stage */}
          <div
            className="lg:col-span-7"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
          >
            <div data-reveal className="relative border border-line-dark bg-contrast-2">
              <div className="flex items-center justify-between border-b border-line-dark px-5 py-3.5 text-on-contrast/55 sm:px-6">
                <p className="eyebrow">Concept preview</p>
                <p className="eyebrow">Illustrative · sample data</p>
              </div>
              <div
                className="grid grid-cols-1 p-3 sm:p-10 lg:p-14"
                style={{
                  backgroundImage:
                    "linear-gradient(var(--line-dark) 1px, transparent 1px), linear-gradient(90deg, var(--line-dark) 1px, transparent 1px)",
                  backgroundSize: "48px 48px",
                  backgroundPosition: "-1px -1px",
                }}
              >
                {concepts.map(({ id, Mockup }, i) => {
                  const isActive = i === active;
                  return (
                    <div
                      key={id}
                      id={`panel-${id}`}
                      role="tabpanel"
                      aria-labelledby={`tab-${id}`}
                      inert={!isActive}
                      tabIndex={isActive ? 0 : -1}
                      className={`col-start-1 row-start-1 mx-auto w-full max-w-[34rem] self-center transition-[opacity,transform] duration-700 ease-(--ease-smooth) ${
                        isActive ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
                      }`}
                    >
                      <div className="shadow-[0_50px_90px_-50px_rgb(0_0_0/0.9)]">
                        <Mockup />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-4 text-[0.75rem] leading-relaxed text-on-contrast/60 lg:hidden">
              Concept previews use sample data and do not describe real properties. Features, names and availability may change.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
