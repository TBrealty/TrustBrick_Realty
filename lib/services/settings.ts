import "server-only";
import { eq } from "drizzle-orm";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type DbOrTx, db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema/platform";
import { invalid } from "@/lib/errors";
import { type RequestContext, audit } from "./audit";

/** Every platform setting, with its type and meaning. Unknown keys are rejected. */
export const SETTINGS = {
  "agents.applications_open": {
    label: "Accept new agent applications",
    description: "When off, the Become an agent page explains that applications are paused.",
    default: true,
  },
  "stays.host_applications_open": {
    label: "Accept new host applications",
    description: "When off, the Become a host page explains that applications are paused. Existing hosts keep hosting.",
    default: true,
  },
} as const;
export type SettingKey = keyof typeof SETTINGS;

export async function getSetting(key: SettingKey, tx: DbOrTx = db): Promise<boolean> {
  const [row] = await tx.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, key));
  return typeof row?.value === "boolean" ? row.value : SETTINGS[key].default;
}

export async function listSettings() {
  const rows = await db.select().from(systemSettings);
  return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
    const row = rows.find((r) => r.key === key);
    return { key, ...SETTINGS[key], value: typeof row?.value === "boolean" ? row.value : SETTINGS[key].default, updatedAt: row?.updatedAt ?? null };
  });
}

export async function setSetting(actor: Actor, key: string, value: boolean, ctx: RequestContext) {
  assertCan(actor, "settings.manage", "platform");
  if (!(key in SETTINGS)) throw invalid("Unknown setting.");
  const settingKey = key as SettingKey;
  await db.transaction(async (tx) => {
    const before = await getSetting(settingKey, tx);
    if (before === value) return;
    await tx
      .insert(systemSettings)
      .values({ key: settingKey, value, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedBy: actor.userId, updatedAt: new Date() } });
    await audit(tx, actor, { event: "SYSTEM_SETTING_CHANGED", target: { type: "setting", referenceId: settingKey }, before: { value: before }, after: { value } }, ctx);
  });
}
