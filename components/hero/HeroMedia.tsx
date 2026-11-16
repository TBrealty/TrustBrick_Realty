import Image from "next/image";
import { images } from "@/lib/images";
import { HeroVideo } from "./HeroVideo";

/**
 * The hero's picture: a still (the film's first frame) in the first paint, with its blurred
 * placeholder before it, then the film fading in over it where it plays (HeroVideo). The frame
 * eases in once (CSS only), so nothing waits for JavaScript.
 */
export function HeroMedia() {
  return (
    <div data-parallax="0.15" className="absolute inset-0 will-change-transform">
      <div className="hero-settle absolute inset-0">
        <Image src={images.hero.src} alt={images.hero.alt} fill preload quality={80} sizes="100vw" placeholder="blur" className="object-cover" />
        <HeroVideo />
      </div>
    </div>
  );
}
