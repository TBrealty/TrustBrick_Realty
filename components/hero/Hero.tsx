import { Lines } from "@/components/typography/Lines";
import { HeroMedia } from "./HeroMedia";
import { HeroSearch } from "./HeroSearch";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/** The landing page's opening: the skyline, the promise, and straight into a search. */
export function Hero({ locations }: { locations: { slug: string; name: string }[] }) {
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
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-contrast via-contrast/55 to-contrast/10" />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_100%,rgb(13_17_25/0.7),transparent_60%)]" />
      </div>

      <div className="shell flex flex-1 flex-col justify-end pt-32 pb-8 sm:pb-10">
        <div data-parallax="-0.04" data-fade="0.7">
          <h1 id="hero-title" className="display text-[clamp(3.25rem,14vw,4.5rem)] leading-[0.88] sm:text-[clamp(4.5rem,8.6vw,9.5rem)]">
            <Lines lines={["Real estate,", <em key="i" className="text-on-contrast/95">built on trust.</em>]} delay={140} step={120} />
          </h1>

          <p className="enter-rise mt-6 max-w-[42ch] text-[1.0625rem] leading-relaxed text-on-contrast/78 sm:mt-8 sm:text-[1.1875rem]" style={d(380)}>
            Discover, evaluate and move through real estate with greater confidence.
          </p>

          <div className="enter-rise mt-7 sm:mt-9" style={d(470)}>
            <HeroSearch locations={locations} />
          </div>

          <p className="enter-fade mt-6 text-[0.875rem] text-on-contrast/70" style={d(600)}>
            Agent, broker or developer?{" "}
            <a href="/become-an-agent" className="text-on-contrast underline decoration-on-contrast/40 underline-offset-4 transition-colors hover:decoration-on-contrast">
              Join Trustbrick →
            </a>
          </p>
        </div>

        <div className="mt-10 sm:mt-12">
          <div aria-hidden className="enter-rule h-px bg-on-contrast/20" style={d(560)} />
          <div className="enter-fade flex items-center justify-between pt-5 text-on-contrast/60" style={d(700)}>
            <p className="eyebrow">Realty · Technology · Finance</p>
            <a href="#explore" aria-label="Scroll to the next section" className="eyebrow flex items-center gap-3 transition-colors hover:text-on-contrast">
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
