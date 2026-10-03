import type { Metadata } from "next";
import { defaultRateAction, gstAction } from "@/app/(workspace)/commissions/actions";
import { ConfirmAction, Select, TextInput } from "@/components/workspace/forms";
import { Card, PageHeader, StatusBadge, When } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { COMMISSION_BASIS_LABELS, COMMISSION_SERVICE_LABELS, describeRate } from "@/lib/commission/terms";
import { getGstPercent, ratesFor } from "@/lib/services/commission";
import { listSettings } from "@/lib/services/settings";
import { COMMISSION_BASES, COMMISSION_SERVICES } from "@/lib/vocab";
import { setSettingAction } from "./actions";

export const metadata: Metadata = { title: "Platform settings" };

export default async function SystemPage() {
  await requirePermission("settings.manage", "/system", "platform");
  const [settings, defaults, gstPercent] = await Promise.all([listSettings(), ratesFor(null), getGstPercent()]);
  return (
    <>
      <PageHeader title="Platform settings" description="Switches that change how the whole platform behaves. Each change needs your password and is written to the audit log." />
      <div className="max-w-3xl space-y-4">
        {settings.map((s) => (
          <Card key={s.key}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[0.9375rem] font-semibold">{s.label}</h2>
                  <StatusBadge tone={s.value ? "success" : "neutral"}>{s.value ? "On" : "Off"}</StatusBadge>
                </div>
                <p className="mt-1 text-[0.8125rem] text-stone-deep">{s.description}</p>
                <p className="mt-2 font-mono text-[0.6875rem] text-stone-deep">
                  {s.key}
                  {s.updatedAt && (
                    <>
                      {" · changed "}
                      <When at={s.updatedAt.toISOString()} />
                    </>
                  )}
                </p>
              </div>
              <ConfirmAction
                label={s.value ? "Turn off" : "Turn on"}
                title={`${s.value ? "Turn off" : "Turn on"}: ${s.label}?`}
                description="This takes effect immediately for everyone."
                variant={s.value ? "secondary" : "primary"}
                action={setSettingAction}
                hidden={{ key: s.key, value: s.value ? "0" : "1" }}
                password
              />
            </div>
          </Card>
        ))}

        <Card title="Commission defaults" description="What partners pay Trustbrick unless an admin sets them their own rate. A change applies to charges from now on; partners on the default must accept it before submitting more listings.">
          <div className="overflow-x-auto">
            <table className="wtable">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Default</th>
                  <th scope="col" className="text-right">
                    <span className="sr-only">Change</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMMISSION_SERVICES.map((service) => (
                  <tr key={service}>
                    <td className="font-medium">{COMMISSION_SERVICE_LABELS[service]}</td>
                    <td>{describeRate(service, defaults[service], false)}</td>
                    <td className="text-right">
                      <ConfirmAction
                        label="Change"
                        title={`Default commission on ${COMMISSION_SERVICE_LABELS[service].toLowerCase()}`}
                        description="Applies to new charges for every partner without their own rate."
                        action={defaultRateAction}
                        hidden={{ service }}
                        variant="secondary"
                        confirmLabel="Save default"
                        reason={{ required: true, label: "Why (at least 10 characters)" }}
                        password
                      >
                        <Select
                          label="A percentage of"
                          name="basis"
                          required
                          defaultValue={defaults[service].basis}
                          options={COMMISSION_BASES.filter((b) => service !== "stay" || b === "deal_value").map((b) => ({ value: b, label: COMMISSION_BASIS_LABELS[b].replace(/^of /, "") }))}
                        />
                        <TextInput label="Rate (%)" name="percent" required inputMode="decimal" defaultValue={String(defaults[service].percent)} hint="From 0 to 50%." />
                      </ConfirmAction>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-line-light pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[0.875rem] font-medium">GST on commission: {gstPercent}%</p>
              <p className="text-[0.8125rem] text-stone-deep">Added to every charge. Set it to 0 if Trustbrick isn&apos;t registered for GST; confirm the rate with your accountant.</p>
            </div>
            <ConfirmAction
              label="Change GST"
              title="GST on commission"
              description="Applies to charges from now on."
              action={gstAction}
              confirmLabel="Save"
              reason={{ required: true, label: "Why (at least 10 characters)" }}
              password
            >
              <TextInput label="GST (%)" name="percent" required inputMode="decimal" defaultValue={String(gstPercent)} />
            </ConfirmAction>
          </div>
        </Card>
      </div>
    </>
  );
}
