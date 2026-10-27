import { connection } from "next/server";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { Hero } from "@/components/hero/Hero";
import { MotionController } from "@/components/motion/MotionController";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { Explore } from "@/components/sections/Explore";
import { Intelligence } from "@/components/sections/Intelligence";
import { Paths } from "@/components/sections/Paths";
import { PlansAd } from "@/components/sections/PlansAd";
import { Vision } from "@/components/sections/Vision";
import { homeData } from "@/lib/listings/home";

/**
 * The landing page: search first, then real listings, then what Trustbrick is. Dark and light
 * bands alternate: hero (dark), explore (light), plans (dark), paths (light), intelligence (dark),
 * where we're going (light), footer (dark).
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
        <PlansAd />
        <Paths />
        <Intelligence />
        <Vision />
      </main>
      <SiteFooter />
      <MotionController />
    </>
  );
}
