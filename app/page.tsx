import { SiteFooter } from "@/components/footer/SiteFooter";
import { Hero } from "@/components/hero/Hero";
import { MotionController } from "@/components/motion/MotionController";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { Ecosystem } from "@/components/sections/Ecosystem";
import { FinalCta } from "@/components/sections/FinalCta";
import { Future } from "@/components/sections/Future";
import { Idea } from "@/components/sections/Idea";
import { Intelligence } from "@/components/sections/Intelligence";
import { Paths } from "@/components/sections/Paths";
import { PlansAd } from "@/components/sections/PlansAd";

export default function Home() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Idea />
        <Paths />
        <Intelligence />
        <PlansAd />
        <Ecosystem />
        <Future />
        <FinalCta />
      </main>
      <SiteFooter />
      <MotionController />
    </>
  );
}
