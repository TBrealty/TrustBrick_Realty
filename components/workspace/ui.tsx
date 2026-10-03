import Link from "next/link";
import { formatCount, formatDateTime, relativeTime } from "@/lib/format";
import { describeChange } from "@/lib/range";

/* Server-rendered building blocks for workspace pages. No client JavaScript. */

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[0.75rem] text-stone-deep">{eyebrow}</div>}
        <h1 className="text-[1.5rem] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-[0.875rem] text-stone-deep">{description}</p>}
        {meta && <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem] text-stone-deep">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, description, actions, children, className = "", padded = true }: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`wcard ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-line-light px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[0.8125rem] text-stone-deep">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { box: string; glyph: string }> = {
  neutral: { box: "bg-ink/5 text-graphite", glyph: "○" },
  info: { box: "bg-slate/10 text-slate", glyph: "●" },
  success: { box: "bg-sage/12 text-sage-deep", glyph: "✓" },
  warning: { box: "bg-amber/12 text-amber", glyph: "!" },
  danger: { box: "bg-brick/10 text-brick", glyph: "×" },
};

/** A status is always a word; the colour and glyph only reinforce it. */
export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.75rem] leading-5 font-medium whitespace-nowrap ${t.box}`}>
      <span aria-hidden className="text-[0.6875rem] leading-none">
        {t.glyph}
      </span>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  active: "success",
  verified: "success",
  published: "success",
  approved: "success",
  accepted: "success",
  converted: "success",
  completed: "success",
  actioned: "success",
  pending: "warning",
  open: "warning",
  requested: "warning",
  submitted: "info",
  under_review: "info",
  in_review: "info",
  scheduled: "info",
  new: "info",
  contacted: "info",
  qualified: "info",
  visit_scheduled: "info",
  negotiation: "info",
  changes_requested: "warning",
  paused: "warning",
  unpublished: "warning",
  unverified: "neutral",
  draft: "neutral",
  withdrawn: "neutral",
  archived: "neutral",
  expired: "neutral",
  revoked: "neutral",
  dismissed: "neutral",
  cancelled: "neutral",
  no_show: "warning",
  lost: "neutral",
  suspended: "danger",
  rejected: "danger",
  removed: "danger",
};

const humanise = (value: string) => value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** For generic lifecycle values (active, pending, suspended…). */
export function Status({ value, label }: { value: string; label?: string }) {
  return <StatusBadge tone={STATUS_TONE[value] ?? "neutral"}>{label ?? humanise(value)}</StatusBadge>;
}

export function StatCard({
  label,
  value,
  hint,
  change,
  href,
  emphasis,
}: {
  label: string;
  value: number | string;
  hint?: React.ReactNode;
  change?: { current: number; previous: number; periodLabel: string };
  href?: string;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <p className="text-[0.8125rem] text-stone-deep">{label}</p>
      <p className={`mt-1.5 font-semibold tracking-[-0.02em] text-ink ${emphasis ? "text-[2rem] leading-none" : "text-[1.5rem] leading-none"}`}>
        {typeof value === "number" ? formatCount(value) : value}
      </p>
      {change && <Change {...change} />}
      {hint && <p className="mt-1.5 text-[0.75rem] text-stone-deep">{hint}</p>}
    </>
  );
  const cls = "wcard block p-4 transition-colors";
  return href ? (
    <Link href={href} className={`${cls} hover:border-ink/30`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Change({ current, previous, periodLabel }: { current: number; previous: number; periodLabel: string }) {
  const c = describeChange(current, previous);
  const arrow = c.direction === "up" ? "↑" : c.direction === "down" ? "↓" : "";
  if (c.direction === "none") return <p className="mt-1.5 text-[0.75rem] text-stone-deep">None in {periodLabel}</p>;
  return (
    <p className="mt-1.5 text-[0.75rem] text-stone-deep">
      <span className={c.direction === "up" ? "text-sage" : c.direction === "down" ? "text-brick" : ""}>
        {arrow && <span aria-hidden>{arrow} </span>}
        {c.text}
      </span>{" "}
      vs {periodLabel}
    </p>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-[0.9375rem] font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-[0.8125rem] text-stone-deep">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Tabs({ items, label }: { items: { href: string; label: string; count?: number; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-5 overflow-x-auto border-b border-line-light px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {items.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-[0.8125rem] font-medium transition-colors ${
                t.active ? "border-ink text-ink" : "border-transparent text-stone-deep hover:text-ink"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`rounded-full px-1.5 text-[0.6875rem] leading-5 tabular-nums ${t.active ? "bg-ink text-paper" : "bg-ink/6 text-graphite"}`}>{t.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DescriptionList({ items, columns = 2 }: { items: [React.ReactNode, React.ReactNode][]; columns?: 1 | 2 | 3 }) {
  const grid = columns === 1 ? "" : columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3.5 ${grid}`}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[0.75rem] text-stone-deep">{k}</dt>
          <dd className="mt-0.5 text-[0.875rem] break-words text-ink">{v ?? <span className="text-stone">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Page links that keep every other search parameter. Never loads more than one page. */
export function Pagination({ page, pageSize, total, params, basePath }: { page: number; pageSize: number; total: number; params: Record<string, string | string[] | undefined>; basePath: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "page" || v === undefined) continue;
      for (const item of Array.isArray(v) ? v : [v]) q.append(k, item);
    }
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line-light px-4 py-3 text-[0.8125rem] text-stone-deep">
      <p>
        {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="wbtn wbtn-secondary wbtn-sm" rel="prev">
            Previous
          </Link>
        ) : (
          <span className="wbtn wbtn-secondary wbtn-sm" aria-disabled="true">
            Previous
          </span>
        )}
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className="wbtn wbtn-secondary wbtn-sm" rel="next">
            Next
          </Link>
        ) : (
          <span className="wbtn wbtn-secondary wbtn-sm" aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

export type Column<T> = {
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Hide on narrow screens; the detail page still has everything. */
  hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
  align?: "right";
};

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell", "2xl": "hidden 2xl:table-cell" };

/** A semantic, server-rendered table. Rows arrive already paginated and filtered by the server. */
export function DataTable<T>({ columns, rows, rowKey, caption, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; caption: string; empty: React.ReactNode }) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="wtable">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" className={`${c.hideBelow ? HIDE[c.hideBelow] : ""} ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c, i) => (
                <td key={i} className={`${c.hideBelow ? HIDE[c.hideBelow] : ""} ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function When({ at }: { at: string | null }) {
  if (!at) return <span className="text-stone">—</span>;
  return (
    <time dateTime={at} title={formatDateTime(at)} className="whitespace-nowrap">
      {relativeTime(at)}
    </time>
  );
}

export type TimelineItem = { id: string; title: React.ReactNode; body?: React.ReactNode; at: string; actor?: string | null };

export function Timeline({ items, empty = "Nothing yet." }: { items: TimelineItem[]; empty?: string }) {
  if (items.length === 0) return <p className="text-[0.8125rem] text-stone-deep">{empty}</p>;
  return (
    <ol className="relative space-y-4 border-l border-line-light pl-5">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full border-2 border-white bg-stone-deep" aria-hidden />
          <p className="text-[0.8125rem] text-ink">{item.title}</p>
          {item.body && <div className="mt-0.5 text-[0.8125rem] text-stone-deep">{item.body}</div>}
          <p className="mt-0.5 text-[0.75rem] text-stone-deep">
            {item.actor ? `${item.actor} · ` : ""}
            <When at={item.at} />
          </p>
        </li>
      ))}
    </ol>
  );
}

export function SampleNotice({ children }: { children?: React.ReactNode }) {
  return (
    <p className="mb-5 flex items-start gap-2.5 rounded-[3px] border-l-2 border-brick bg-brick/6 px-3.5 py-2.5 text-[0.8125rem] text-graphite">
      <span className="font-mono text-[0.6875rem] tracking-wider text-brick uppercase">Sample data</span>
      <span>{children ?? "This includes development sample data. It is not real and is badged everywhere it appears."}</span>
    </p>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[0.8125rem] text-stone-deep hover:text-ink">
      <span aria-hidden>←</span> {children}
    </Link>
  );
}

/** A labelled select for GET filter bars. Wrap a group in <AutoSubmit> to apply on change. */
export function FilterSelect({ name, label, value, options, any = true }: { name: string; label: string; value?: string; options: [string, string][]; any?: boolean }) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="mb-1.5 block text-[0.75rem] text-stone-deep">
        {label}
      </label>
      <select id={`f-${name}`} name={name} defaultValue={value ?? ""} className="winput min-w-36">
        {any && <option value="">Any</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
