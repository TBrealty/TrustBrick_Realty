import { API_VERSION, apiRoute } from "@/lib/api/http";

/** The API's front door: its version, and a check that the server is up. */
export const GET = apiRoute("v1.index", { auth: "public" }, async () => ({
  name: "Trustbrick API",
  version: API_VERSION,
  docs: "docs/mobile-api.md in the repository",
}));
