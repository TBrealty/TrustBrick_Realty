import { apiRoute } from "@/lib/api/http";
import { auth } from "@/lib/auth/auth";

/** Ends this app session. Its push registration goes with it. */
export const POST = apiRoute("v1.auth.sign_out", { auth: "user" }, async ({ request }) => {
  await auth.api.signOut({ headers: request.headers });
  return { signedOut: true };
});
