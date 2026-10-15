import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { agentSignUpAction } from "@/app/(auth)/actions";
import { AgentForm } from "@/components/auth/AgentForm";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { FormAlert } from "@/components/auth/fields";
import { SignUpForm } from "@/components/auth/forms";
import { getSession } from "@/lib/auth/session";
import { cityOptions } from "@/lib/services/organizations";
import { getSetting } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Sign up — Trustbrick" };

type Props = { searchParams: Promise<{ as?: string }> };

/** Looking for a home, or listing them: the two ways to sign up. */
function Switch({ agent }: { agent: boolean }) {
  const tab = (active: boolean) =>
    `flex-1 rounded-[2px] px-4 py-2.5 text-center text-[0.875rem] font-medium transition-colors ${active ? "bg-ink text-paper" : "text-graphite hover:text-ink"}`;
  return (
    <nav aria-label="Account type" className="mb-8 flex gap-1 rounded-[3px] border border-line-light bg-paper p-1">
      <Link href="/signup" aria-current={agent ? undefined : "page"} className={tab(!agent)}>
        Looking for a home
      </Link>
      <Link href="/signup?as=agent" aria-current={agent ? "page" : undefined} className={tab(agent)}>
        Become an agent
      </Link>
    </nav>
  );
}

export default async function SignUpPage({ searchParams }: Props) {
  const agent = (await searchParams).as === "agent";
  if (await getSession()) redirect(agent ? "/become-an-agent" : "/account/profile");

  if (agent) {
    const [cities, open] = await Promise.all([cityOptions(), getSetting("agents.applications_open")]);
    return (
      <>
        <AuthHeading
          eyebrow="For agents"
          title={
            <>
              Become an <em>agent.</em>
            </>
          }
        >
          List properties, handle enquiries and schedule visits from your own workspace. Every application is reviewed by our team. Already have an account?{" "}
          <Link href="/login?next=/become-an-agent" className="link-rule font-medium text-ink">
            Log in to apply
          </Link>
        </AuthHeading>
        <Switch agent />
        {open ? (
          <AgentForm action={agentSignUpAction} cities={cities} withAccount />
        ) : (
          <FormAlert tone="info">We&rsquo;re not accepting new agent applications right now. Please check back soon.</FormAlert>
        )}
      </>
    );
  }

  return (
    <>
      <AuthHeading
        eyebrow="Sign up"
        title={
          <>
            Create your <em>account.</em>
          </>
        }
      >
        Already have one?{" "}
        <Link href="/login" className="link-rule font-medium text-ink">
          Log in
        </Link>
      </AuthHeading>
      <Switch agent={false} />
      <SignUpForm />
    </>
  );
}
