import { connection } from "next/server";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { Hero } from "@/components/hero/Hero";
import { MotionController } from "@/components/motion/MotionController";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { Explore } from "@/components/sections/Explore";
import { ForPartners } from "@/components/sections/ForPartners";
import { HowWeCheck } from "@/components/sections/HowWeCheck";
import { Intelligence } from "@/components/sections/Intelligence";
import { Paths } from "@/components/sections/Paths";
import { TourShowcase } from "@/components/sections/TourShowcase";
import { Vision } from "@/components/sections/Vision";
import { homeData } from "@/lib/listings/home";

/**
 * The landing page: search first, then real listings, a tour to try, how listings are checked,
 * then what Trustbrick is. Dark and light bands alternate: hero (dark), explore (light), tours
 * (dark), how we check (light), for partners (dark), paths (light), intelligence (dark), where
 * we're going (light), footer (dark).
 */
export default async function Home() {
  // Rendered per request (the listings change), from a cache shared by all visitors.
  await connection();
  const { rows, locations } = await homeData();
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero locations={locations} />
        <Explore rows={rows} />
        <TourShowcase />
        <HowWeCheck />
        <ForPartners />
        <Paths />
        <Intelligence />
        <Vision />
      </main>
      <SiteFooter />
      <MotionController />
    </>
  );
}
