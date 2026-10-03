import type { Metadata } from "next";
import Link from "next/link";
import { BrowsePage } from "@/components/listings/BrowsePage";
import { ServicePage } from "@/components/navigation/ServicePage";
import { parseFilters, type RawSearchParams } from "@/lib/listings/filters";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Home Stay — Trustbrick",
  description: "Whole homes and private rooms by the night, from hosts Trustbrick has checked. Choose your dates, request to book, and pay the host at the property.",
};

const shell = SERVICE_SHELLS.stay!;

export default async function StaysPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const current = shell.sectionFor(parseFilters("stay", await searchParams));
  return (
    <ServicePage shell={shell} current={current}>
      <BrowsePage kind="stay" searchParams={searchParams} />
      <aside className="shell pb-20">
        <div className="flex flex-wrap items-center justify-between gap-4 border border-line-light bg-paper px-6 py-5">
          <p className="text-[0.9375rem]">
            <span className="font-medium">Have a spare room or a holiday home?</span>{" "}
            <span className="text-stone-deep">Host guests on Trustbrick. It&apos;s free to list.</span>
          </p>
          <Link href="/become-a-host" className="btn btn-dark">
            <span>Become a host</span>
          </Link>
        </div>
      </aside>
    </ServicePage>
  );
}
