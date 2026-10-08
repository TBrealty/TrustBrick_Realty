import { apiRoute } from "@/lib/api/http";
import { listBookmarks } from "@/lib/listings/queries";

/** Saved homes, newest first. */
export const GET = apiRoute("v1.bookmarks", { auth: "user" }, async ({ person }) => ({ items: await listBookmarks(person!.userId) }));
