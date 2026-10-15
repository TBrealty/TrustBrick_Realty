"use client";

import { useActionState, useState } from "react";
import { type AgentFormState, initialAgentFormState, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/form";
import { APPLICANT_ORG_TYPE_LABELS, APPLICANT_ORG_TYPES } from "@/lib/organizations/terms";
import { ChoiceCards, FormAlert, PasswordField, SelectField, SubmitButton, TextAreaField, TextField } from "./fields";

type Joining = "independent" | "organization";
type OrgRoute = "new_organization" | "join_organization";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 border-t border-line-light pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-[1rem] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[0.8125rem] leading-snug text-stone-deep">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Applying as an agent: on your own, or through an organization, either registering it (name,
 * GST number, address…) or joining one already on Trustbrick. With `withAccount`, it's also the
 * sign-up form: the account is created first, and the application goes to Trustbrick's team
 * once the email is confirmed.
 */
export function AgentForm({
  action,
  cities,
  withAccount,
}: {
  action: (state: AgentFormState, form: FormData) => Promise<AgentFormState>;
  cities: { id: string; name: string; state: string }[];
  withAccount: boolean;
}) {
  const [state, formAction] = useActionState(action, initialAgentFormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const [joining, setJoining] = useState<Joining>(v.applyingAs === "new_organization" || v.applyingAs === "join_organization" ? "organization" : "independent");
  const [route, setRoute] = useState<OrgRoute>(v.applyingAs === "join_organization" ? "join_organization" : "new_organization");
  const applyingAs = joining === "independent" ? "independent" : route;

  return (
    <form action={formAction} noValidate className="space-y-8">
      {state.message && <FormAlert tone="error">{state.message}</FormAlert>}
      <input type="hidden" name="applyingAs" value={applyingAs} />

      {withAccount && (
        <Section title="Your account" description="You'll sign in with this email and password.">
          <TextField label="Full name" name="name" autoComplete="name" defaultValue={v.name} error={e.name} autoFocus />
          <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={v.email} error={e.email} />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            error={e.password}
            hint={`At least ${PASSWORD_MIN} characters.`}
          />
        </Section>
      )}

      <Section title="You as an agent" description="Customers who enquire on your listings see your phone number.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={v.phone} error={e.phone} />
          <SelectField
            // React resets the form after each submit; a select only takes a new default when it's redrawn.
            key={`city-${v.cityId ?? ""}`}
            label="City you work in"
            name="cityId"
            defaultValue={v.cityId}
            error={e.cityId}
            options={cities.map((c) => ({ value: c.id, label: `${c.name}, ${c.state}` }))}
          />
          <TextField
            label="RERA agent registration number"
            name="reraAgentNumber"
            autoComplete="off"
            required={false}
            defaultValue={v.reraAgentNumber}
            error={e.reraAgentNumber}
            hint="Required in most states. It speeds up approval."
          />
          <TextField label="Years of experience" name="experienceYears" inputMode="numeric" autoComplete="off" required={false} defaultValue={v.experienceYears} error={e.experienceYears} />
        </div>
      </Section>

      <Section title="How are you joining?">
        <ChoiceCards
          legend="I'm signing up as"
          name="joining"
          value={joining}
          onChange={(value) => setJoining(value as Joining)}
          options={[
            { value: "independent", title: "An individual agent", description: "You work on your own, under your own name." },
            { value: "organization", title: "Through an organization", description: "A brokerage, developer, property manager or PG operator." },
          ]}
        />

        {joining === "organization" && (
          <div className="space-y-5">
            <ChoiceCards
              legend="Your organization"
              name="orgRoute"
              value={route}
              onChange={(value) => setRoute(value as OrgRoute)}
              options={[
                { value: "new_organization", title: "Register my organization", description: "It's new to Trustbrick. You'll be its admin once approved." },
                { value: "join_organization", title: "It's already on Trustbrick", description: "Join it with the ORG- reference its admin gives you." },
              ]}
            />

            {route === "join_organization" ? (
              <TextField
                label="Organization reference"
                name="organizationReference"
                autoComplete="off"
                placeholder="ORG-XXXXXXXX"
                defaultValue={v.organizationReference}
                error={e.organizationReference}
                hint="Ask your organization's admin for it: it's on their Trustbrick workspace."
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField label="Registered name" name="orgName" autoComplete="organization" defaultValue={v.orgName} error={e.orgName} hint="As it appears on your GST certificate." />
                </div>
                <SelectField
                  key={`org-type-${v.orgType ?? ""}`}
                  label="Kind of organization"
                  name="orgType"
                  defaultValue={v.orgType}
                  error={e.orgType}
                  options={APPLICANT_ORG_TYPES.map((t) => ({ value: t, label: APPLICANT_ORG_TYPE_LABELS[t] }))}
                />
                <TextField
                  label="GST number (GSTIN)"
                  name="gstin"
                  autoComplete="off"
                  placeholder="27AAPFU0939F1ZV"
                  maxLength={20}
                  defaultValue={v.gstin}
                  error={e.gstin}
                  hint="15 characters. We check it for typos."
                />
                <TextField label="RERA registration" name="orgRera" autoComplete="off" required={false} defaultValue={v.orgRera} error={e.orgRera} hint="The organization's own registration, where your state requires one." />
                <TextField label="Website" name="orgWebsite" type="url" inputMode="url" autoComplete="url" required={false} placeholder="https://" defaultValue={v.orgWebsite} error={e.orgWebsite} />
                <div className="sm:col-span-2">
                  <TextAreaField label="Registered office address" name="orgAddress" rows={3} maxLength={500} defaultValue={v.orgAddress} error={e.orgAddress} />
                </div>
                <TextField
                  label="Office email"
                  name="orgEmail"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  required={false}
                  defaultValue={v.orgEmail}
                  error={e.orgEmail}
                  hint="Leave blank to use your own."
                />
                <TextField
                  label="Office phone"
                  name="orgPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  required={false}
                  defaultValue={v.orgPhone}
                  error={e.orgPhone}
                  hint="Leave blank to use your own."
                />
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="About you">
        <TextAreaField label="A line or two about your work" name="bio" rows={3} maxLength={600} required={false} defaultValue={v.bio} error={e.bio} />
      </Section>

      <div className="space-y-3">
        <SubmitButton pendingLabel={withAccount ? "Creating your account…" : "Sending…"}>{withAccount ? "Create account and apply" : "Send application"}</SubmitButton>
        <p className="text-[0.8125rem] leading-relaxed text-stone-deep">
          {withAccount
            ? "We'll email you a link to confirm your address. Your application goes to our team as soon as you confirm, and we'll email you when it's decided."
            : "A Trustbrick admin reviews every application. We'll email you when it's decided."}
        </p>
      </div>
    </form>
  );
}
