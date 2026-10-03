import type { Metadata } from "next";
import { BookmarksGrid } from "@/components/listings/BookmarksGrid";
import { requireSession } from "@/lib/auth/session";
import { listBookmarks } from "@/lib/listings/queries";
import { links } from "@/lib/site";

export const metadata: Metadata = { title: "Bookmarks — Trustbrick" };

export default async function BookmarksPage() {
  const { user } = await requireSession(links.bookmarks);
  const items = await listBookmarks(user.id);

  return (
    <div>
      <p className="eyebrow flex items-center gap-3 text-brick">
        <span aria-hidden className="h-px w-8 bg-current" />
        Bookmarks
      </p>
      <h1 className="display mt-6 mb-10 text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.95]">
        Your saved <em>properties.</em>
      </h1>
      <BookmarksGrid initialItems={items} />
    </div>
  );
}
