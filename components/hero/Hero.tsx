import { Cube, HouseLine, Scales, SealCheck } from "@phosphor-icons/react/ssr";
import { Lines } from "@/components/typography/Lines";
import { HeroMedia } from "./HeroMedia";
import { HeroSearch } from "./HeroSearch";
import { HeroVideoToggle } from "./HeroVideo";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/** What makes Trustbrick different, in four lines under the search. */
const TRUST = [
  { Icon: SealCheck, label: "Every listing checked", href: "/#trust" },
  { Icon: Cube, label: "360° tours & 3D views", href: "/buy?tour=1" },
  { Icon: Scales, label: "Legal verification", href: "/legal-verification" },
  { Icon: HouseLine, label: "Verified homestay hosts", href: "/stays" },
];

/**
 * The landing page's opening: a film of homes and the city, the promise, and straight into a
 * search, centred. The entrance is CSS only and over in about a second: the picture eases in, the headline
 * rises line by line, and the subtitle and search box glide up into place. Nothing a visitor
 * needs is ever hidden: on a slow phone the first frame can stay on screen while JavaScript
 * loads, so the search box is visible (and usable) from that first frame.
 */
export function Hero({ locations }: { locations: { slug: string; name: string }[] }) {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      data-nav="dark"
      className="relative isolate flex min-h-[max(40rem,100svh)] flex-col overflow-hidden bg-contrast text-on-contrast"
    >
      {/* Media: settles once, then drifts with scroll. */}
      <div className="absolute inset-0 -z-10">
        <HeroMedia />
        <div aria-hidden className="absolute inset-x-0 top-0 h-48 bg-linear-to-b from-contrast/70 to-transparent" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-contrast via-contrast/55 to-contrast/10" />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_100%,rgb(13_17_25/0.7),transparent_60%)]" />
        {/* A soft pool of shade behind the words, so they read over the film's brighter frames. */}
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_42%_at_50%_45%,rgb(13_17_25/0.42),transparent_75%)]" />
      </div>

      <div className="shell flex flex-1 flex-col justify-end pt-32 pb-8 sm:pb-10">
        <div data-parallax="-0.04" data-fade="0.7" className="text-center">
          <h1 id="hero-title" className="hero-lines display text-[clamp(3.25rem,14vw,4.5rem)] leading-[0.88] sm:text-[clamp(4.5rem,8.6vw,9.5rem)]">
            <Lines lines={["Real estate,", <em key="i" className="text-on-contrast/95">built on trust.</em>]} delay={80} step={120} />
          </h1>

          <p className="hero-rise mx-auto mt-6 max-w-[42ch] text-[1.0625rem] leading-relaxed text-on-contrast/78 sm:mt-8 sm:text-[1.1875rem]" style={d(280)}>
            Discover, evaluate and move through real estate with greater confidence.
          </p>

          <div className="hero-rise mt-7 sm:mt-9" style={d(380)}>
            <HeroSearch locations={locations} />
          </div>

          <p className="hero-rise mt-6 text-[0.875rem] text-on-contrast/70" style={d(480)}>
            Agent, broker or developer?{" "}
            <a href="/become-an-agent" className="text-on-contrast underline decoration-on-contrast/40 underline-offset-4 transition-colors hover:decoration-on-contrast">
              Join Trustbrick →
            </a>
          </p>

          <ul
            className="hero-rise mx-auto mt-6 grid max-w-[62rem] grid-cols-2 gap-x-4 gap-y-3 border-t border-on-contrast/15 pt-5 text-left sm:mt-7 lg:grid-cols-4 lg:gap-0 lg:text-center"
            style={d(560)}
            aria-label="Why Trustbrick"
          >
            {TRUST.map(({ Icon, label, href }, i) => (
              <li key={label} className={i > 0 ? "lg:border-l lg:border-on-contrast/12" : ""}>
                <a
                  href={href}
                  className="inline-flex items-center gap-2.5 text-[0.8125rem] font-medium text-on-contrast/90 transition-colors hover:text-on-contrast sm:text-[0.875rem] lg:justify-center"
                >
                  <Icon size={21} weight="light" aria-hidden className="shrink-0 text-brick-bright" />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 sm:mt-12">
          <div aria-hidden className="h-px bg-on-contrast/20" />
          <div className="flex items-center justify-between pt-5 text-on-contrast/60">
            <p className="eyebrow">Realty · Technology · Finance</p>
            <HeroVideoToggle
              fallback={
                <a href="#explore" aria-label="Scroll to the next section" className="eyebrow flex items-center gap-3 transition-colors hover:text-on-contrast">
                  <span aria-hidden className="hidden sm:inline">Scroll</span>
                  <span aria-hidden className="relative block h-8 w-px overflow-hidden bg-on-contrast/15">
                    <span className="scroll-cue absolute inset-0 bg-on-contrast/80" />
                  </span>
                </a>
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
