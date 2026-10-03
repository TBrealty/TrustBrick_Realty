/**
 * Building blocks for the services' guides: a sticky "On this page" list beside the
 * sections, numbered steps, and titled bullet lists.
 */

export function GuideLayout({ contents, children }: { contents: readonly (readonly [string, string])[]; children: React.ReactNode }) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
      <nav aria-label="On this page" className="lg:sticky lg:top-[calc(var(--sticky-top,var(--header-h))+1.5rem)] lg:self-start">
        <p className="eyebrow text-stone-deep">On this page</p>
        <ol className="mt-4 space-y-2.5 text-[0.9375rem]">
          {contents.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-graphite hover:text-ink hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="min-w-0 max-w-3xl space-y-14">{children}</div>
    </div>
  );
}

export function GuideSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-[calc(var(--sticky-top,var(--header-h))+1.5rem)] border-t border-line-light pt-10">
      <h2 id={`${id}-title`} className="display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Steps({ steps }: { steps: [string, React.ReactNode][] }) {
  return (
    <ol className="space-y-6">
      {steps.map(([title, body], i) => (
        <li key={title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3">
          <span className="font-mono text-[0.875rem] text-stone-deep tabular-nums">{String(i + 1).padStart(2, "0")}</span>
          <span>
            <span className="block text-[1.0625rem] font-medium">{title}</span>
            <span className="mt-1 block text-[0.9375rem] leading-relaxed text-graphite">{body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DocList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <ul className="mt-4 space-y-4">
      {items.map(([title, body]) => (
        <li key={title} className="flex gap-3">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brick" />
          <span>
            <span className="block font-medium">{title}</span>
            <span className="mt-0.5 block text-[0.9375rem] leading-relaxed text-graphite">{body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RedFlags({ flags, children }: { flags: string[]; children?: React.ReactNode }) {
  return (
    <>
      <ul className="space-y-3">
        {flags.map((flag) => (
          <li key={flag} className="flex gap-3 text-[0.9375rem] leading-relaxed text-graphite">
            <span aria-hidden className="mt-0.5 font-medium text-brick">!</span>
            {flag}
          </li>
        ))}
      </ul>
      {children && <div className="mt-6 text-[0.9375rem] text-graphite">{children}</div>}
    </>
  );
}

/** The closing note every guide ends with. */
export function GuideDisclaimer({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-line-light pt-6 text-[0.8125rem] leading-relaxed text-stone-deep">{children}</p>;
}

/** The official RERA portal for each state Trustbrick covers. */
export const RERA_PORTALS: [string, string][] = [
  ["Telangana (TS RERA)", "https://rera.telangana.gov.in"],
  ["Karnataka (K-RERA)", "https://rera.karnataka.gov.in"],
  ["Maharashtra (MahaRERA)", "https://maharera.maharashtra.gov.in"],
  ["Goa (Goa RERA)", "https://rera.goa.gov.in"],
];

export function ReraPortals() {
  return (
    <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {RERA_PORTALS.map(([name, href]) => (
        <li key={href}>
          <a href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 border border-line-light bg-card px-4 py-3 text-[0.9375rem] hover:border-ink">
            {name}
            <span aria-hidden>↗</span>
            <span className="sr-only">(opens the official portal in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
