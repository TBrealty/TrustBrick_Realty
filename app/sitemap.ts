import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site.url, changeFrequency: "monthly", priority: 1 },
    ...["/buy", "/rent", "/pg", "/stays", "/invest"].map((path) => ({ url: `${site.url}${path}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...["/buy/guide", "/buy/emi-calculator", "/buy/costs", "/rent/guide", "/rent/move-in-costs", "/pg/checklist", "/pg/compare", "/invest/yield-calculator", "/invest/guide", "/stays/guide", "/stays/split-cost", "/legal-verification", "/legal-verification/apply", "/legal-verification/documents"].map((path) => ({ url: `${site.url}${path}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${site.url}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site.url}/contact`, changeFrequency: "yearly", priority: 0.4 },
  ];
}
