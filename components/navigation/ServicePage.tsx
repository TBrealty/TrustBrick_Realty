import { ServiceFooter } from "@/components/footer/ServiceFooter";
import type { ServiceShell } from "@/lib/listings/services";
import { ServiceHeader } from "./ServiceHeader";

/**
 * A page inside a dedicated service: its header, the page, its footer. The header here is
 * taller than elsewhere (it has a row of sections), so sticky panels on the page offset
 * themselves by --sticky-top rather than the bar's height alone.
 */
export function ServicePage({ shell, current, children, mainClassName = "" }: { shell: ServiceShell; current?: string; children: React.ReactNode; mainClassName?: string }) {
  return (
    <div className="flex min-h-svh flex-col bg-ivory text-ink [--sticky-top:calc(var(--header-h)+2.75rem)]">
      <ServiceHeader shell={shell} current={current} />
      <main className={`flex-1 ${mainClassName}`}>{children}</main>
      <ServiceFooter shell={shell} />
    </div>
  );
}
