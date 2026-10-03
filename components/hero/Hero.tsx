import { ButtonLink } from "@/components/buttons/ButtonLink";
import { Lines } from "@/components/typography/Lines";
import { HeroMedia } from "./HeroMedia";
import { IntentSelector } from "./IntentSelector";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export function Hero() {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      data-nav="dark"
      className="relative isolate flex min-h-[max(40rem,100svh)] flex-col overflow-hidden bg-contrast text-on-contrast"
    >
      {/* Media: aperture opens, image settles, then drifts with scroll. */}
      <div className="hero-aperture absolute inset-0 -z-10">
        <HeroMedia />
        <div aria-hidden className="absolute inset-x-0 top-0 h-48 bg-linear-to-b from-contrast/70 to-transparent" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-contrast via-contrast/45 to-contrast/5" />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_100%,rgb(13_17_25/0.7),transparent_60%)]" />
      </div>

      <div className="shell flex flex-1 flex-col justify-end pt-32 pb-8 sm:pb-10">
        <div data-parallax="-0.06" data-fade="0.55">
          <h1 id="hero-title" className="display text-[clamp(3.25rem,15vw,4.75rem)] leading-[0.88] sm:text-[clamp(4.75rem,10.6vw,12rem)]">
            <Lines lines={["Real estate,", <em key="i" className="text-on-contrast/95">built on trust.</em>]} delay={140} step={120} />
          </h1>

          <div className="mt-8 grid gap-8 sm:mt-12 lg:grid-cols-12 lg:items-end">
            <p className="enter-rise max-w-[30ch] text-[1.0625rem] leading-relaxed text-on-contrast/78 sm:text-[1.25rem] lg:col-span-4" style={d(380)}>
              Discover, evaluate and move through real estate with greater confidence.
            </p>
            <div className="enter-rise flex flex-wrap gap-3 lg:col-span-8 lg:justify-end" style={d(470)}>
              <ButtonLink href="#idea" variant="light" arrow>
                Explore Trustbrick
              </ButtonLink>
              <IntentSelector />
            </div>
          </div>
        </div>

        <div className="mt-10 sm:mt-14">
          <div aria-hidden className="enter-rule h-px bg-on-contrast/20" style={d(560)} />
          <div className="enter-fade flex items-center justify-between pt-5 text-on-contrast/60" style={d(700)}>
            <p className="eyebrow">Realty · Technology · Finance</p>
            <a href="#idea" aria-label="Scroll to the next section" className="eyebrow flex items-center gap-3 transition-colors hover:text-on-contrast">
              <span aria-hidden className="hidden sm:inline">Scroll</span>
              <span aria-hidden className="relative block h-8 w-px overflow-hidden bg-on-contrast/15">
                <span className="scroll-cue absolute inset-0 bg-on-contrast/80" />
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
