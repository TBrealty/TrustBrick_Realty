import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, EmptyState, PageHeader } from "@/components/workspace/ui";
import { requireActor } from "@/lib/authz/session";
import { globalSearch } from "@/lib/services/search";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor("/search");
  if (actor.workspace !== "platform") forbidden();
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const results = await globalSearch(actor, q);
  const nothing = !results.exact && results.groups.length === 0;

  return (
    <>
      <PageHeader title="Search" description="Paste any reference ID (PRP-, LST-, AGT-, USR-, ORG-, LEAD-, VER-…) for an exact match, or search by name, email or phone. You only see records your permissions allow." />
      <form method="get" role="search" className="mb-6 flex max-w-2xl gap-2">
        <label htmlFor="search-q" className="sr-only">
          Search
        </label>
        <input id="search-q" name="q" type="search" defaultValue={q} autoFocus className="winput" placeholder="e.g. LST-7K4M9Q2X or Priya" />
        <button type="submit" className="wbtn wbtn-primary">
          Search
        </button>
      </form>
      {q.length >= 2 && nothing && <EmptyState title={`Nothing found for “${q}”`}>Reference IDs are exact. Names match partially.</EmptyState>}
      {results.exact && (
        <Card title="Exact match" className="mb-6 max-w-2xl">
          <Link href={results.exact.href} className="flex flex-wrap items-center gap-3 hover:underline">
            <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[0.75rem]">{results.exact.kind}</span>
            <span className="font-medium">{results.exact.title}</span>
            <ReferenceId value={results.exact.referenceId} copy={false} />
            {results.exact.subtitle && <span className="text-[0.8125rem] text-stone-deep">{results.exact.subtitle}</span>}
          </Link>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {results.groups.map((g) => (
          <Card key={g.label} title={g.label} padded={false}>
            <ul className="divide-y divide-line-light">
              {g.hits.map((h) => (
                <li key={h.referenceId}>
                  <Link href={h.href} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-3 text-[0.8125rem] hover:bg-paper">
                    <span className="font-medium">{h.title}</span>
                    <ReferenceId value={h.referenceId} copy={false} />
                    {h.subtitle && <span className="basis-full text-stone-deep">{h.subtitle}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
