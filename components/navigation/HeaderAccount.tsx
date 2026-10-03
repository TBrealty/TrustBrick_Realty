import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getSession } from "@/lib/auth/session";
import { loadWorkspaces } from "@/lib/authz/actor";
import { links } from "@/lib/site";
import { UserMenu } from "./UserMenu";

/**
 * The right-hand end of every non-landing header: the theme switch, then the account.
 * `compact` drops the switch on phones, for headers that also carry a service's name;
 * those pages have the theme picker in their footer.
 */
export async function HeaderAccount({ compact = false }: { compact?: boolean }) {
  const session = await getSession();
  const hasWorkspace = session ? (await loadWorkspaces(session.user.id)).length > 0 : false;

  return (
    <div className="ml-auto flex items-center gap-2 sm:gap-5">
      <ThemeToggle className={compact ? "hidden sm:inline-flex" : ""} />
      {session ? (
        <UserMenu user={{ name: session.user.name, email: session.user.email, hasWorkspace }} />
      ) : (
        <>
          <Link href={links.login} className="link-rule px-0.5 py-2 text-[0.875rem] whitespace-nowrap sm:px-1">
            Log in
          </Link>
          <Link href={links.signup} className="btn btn-dark min-h-10 px-3 text-[0.875rem] sm:px-4">
            Sign up
          </Link>
        </>
      )}
    </div>
  );
}
