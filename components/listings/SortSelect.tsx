"use client";

import { useSearchParams } from "next/navigation";
import { useId } from "react";
import { type Sort, SORT_LABELS, SORTS } from "@/lib/listings/filters";
import { useBrowse } from "./BrowseTransition";

export function SortSelect({ value }: { value: Sort }) {
  const id = useId();
  const searchParams = useSearchParams();
  const { navigate } = useBrowse();

  return (
    <div className="flex items-center gap-2.5">
      <label htmlFor={id} className="text-[0.875rem] whitespace-nowrap text-stone-deep">
        Sort by
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams);
          if (e.target.value === "newest") params.delete("sort");
          else params.set("sort", e.target.value);
          navigate(params);
        }}
        className="h-10 rounded-[2px] border border-line-light bg-paper px-2.5 text-[0.875rem] focus:border-ink focus:outline-none"
      >
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {SORT_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
