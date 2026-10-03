"use client";

import { useState } from "react";
import { ADMIN_GRANTABLE, ADMIN_PRESETS, type AdminPreset, PERMISSIONS, type Permission } from "@/lib/authz/catalog";
import { useFieldError } from "./forms";

const DOMAIN_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  analytics: "Analytics",
  users: "Users",
  agents: "Agents",
  organizations: "Organizations",
  properties: "Properties",
  listings: "Listings",
  leads: "Leads",
  visits: "Visits",
  verification: "Verification",
  reports: "Reports",
  audit: "Audit",
};

/**
 * Choose an admin's permissions: start from a preset, then adjust. Only grantable permissions
 * are offered; the server filters again, so SuperAdmin-only powers can never be granted.
 */
export function PermissionPicker({ initial = [] }: { initial?: Permission[] }) {
  const [selected, setSelected] = useState<Set<Permission>>(new Set(initial));
  const error = useFieldError("permissions");
  const domains = [...new Set(ADMIN_GRANTABLE.map((p) => PERMISSIONS[p].domain))];

  const toggle = (p: Permission) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  return (
    <fieldset>
      <legend className="mb-2 text-[0.8125rem] font-medium">Permissions</legend>
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(ADMIN_PRESETS) as AdminPreset[]).map((key) => (
          <button key={key} type="button" className="wbtn wbtn-secondary wbtn-sm" title={ADMIN_PRESETS[key].description} onClick={() => setSelected(new Set(ADMIN_PRESETS[key].permissions))}>
            Use {ADMIN_PRESETS[key].label}
          </button>
        ))}
        <button type="button" className="wbtn wbtn-ghost wbtn-sm" onClick={() => setSelected(new Set())}>
          Clear
        </button>
      </div>
      <p className="mb-3 text-[0.75rem] text-stone-deep">
        {selected.size} of {ADMIN_GRANTABLE.length} selected. Managing admins and platform settings stay with SuperAdmins.
      </p>
      {error && <p className="mb-3 text-[0.75rem] text-brick">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {domains.map((domain) => (
          <div key={domain} className="rounded-[3px] border border-line-light p-3">
            <p className="mb-2 text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">{DOMAIN_LABELS[domain] ?? domain}</p>
            <ul className="space-y-1.5">
              {ADMIN_GRANTABLE.filter((p) => PERMISSIONS[p].domain === domain).map((p) => (
                <li key={p}>
                  <label className="flex items-start gap-2 text-[0.8125rem] leading-snug">
                    <input type="checkbox" name="permissions" value={p} checked={selected.has(p)} onChange={() => toggle(p)} className="mt-0.5 size-4 accent-ink" />
                    <span>
                      {PERMISSIONS[p].description}
                      <span className="block font-mono text-[0.6875rem] text-stone-deep">{p}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
