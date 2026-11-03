import Link from "next/link";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { AppHeader } from "@/components/navigation/AppHeader";
import { LEGAL, legalPlaceholders } from "@/lib/legal";

/** A long legal page: title, date, contents, then numbered sections. */
export function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: React.ReactNode;
  sections: { id: string; title: string; body: React.ReactNode }[];
}) {
  return (
    <div className="min-h-svh bg-ivory text-ink">
      <AppHeader />
      <main className="shell pt-12 pb-24 sm:pt-16">
        <div className="max-w-[46rem]">
          <p className="eyebrow flex items-center gap-3 text-brick">
            <span aria-hidden className="h-px w-8 bg-current" />
            Legal
          </p>
          <h1 className="display mt-4 text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95]">{title}</h1>
          <p className="mt-4 text-[0.875rem] text-stone-deep">Last updated {LEGAL.updated}</p>
          {(LEGAL.draft || legalPlaceholders()) && (
            <p className="mt-6 border-l-2 border-brick/50 bg-brick/[0.05] px-4 py-3 text-[0.875rem] leading-relaxed text-graphite">
              This is a draft and is being reviewed. Details in [brackets] will be completed before Trustbrick launches.
            </p>
          )}
          <div className="legal-body mt-8 text-[1.0625rem] leading-relaxed text-graphite">{intro}</div>

          <nav aria-label="Contents" className="mt-10 border-y border-line-light py-6">
            <p className="eyebrow mb-3 text-stone-deep">Contents</p>
            <ol className="grid gap-1.5 text-[0.9375rem] sm:grid-cols-2">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="link-rule text-graphite hover:text-ink">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-28 pt-12">
              <h2 id={`${s.id}-title`} className="display text-[clamp(1.75rem,3vw,2.25rem)] leading-tight">
                {i + 1}. {s.title}
              </h2>
              <div className="legal-body mt-4 text-[1rem] leading-relaxed text-graphite">{s.body}</div>
            </section>
          ))}

          <p className="mt-16 border-t border-line-light pt-6 text-[0.875rem] text-stone-deep">
            See also: <Link href="/privacy" className="link-rule text-ink">Privacy Policy</Link> ·{" "}
            <Link href="/terms" className="link-rule text-ink">Terms of Use</Link> ·{" "}
            <Link href="/contact" className="link-rule text-ink">Contact us</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
