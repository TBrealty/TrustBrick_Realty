import Image from "next/image";
import { images } from "@/lib/images";

/**
 * The hero photograph. Its blurred placeholder is in the first paint and the photograph replaces
 * it when it arrives; the frame settles once (CSS only), so nothing waits for JavaScript.
 */
export function HeroMedia() {
  return (
    <div data-parallax="0.15" className="absolute inset-0 will-change-transform">
      <div className="hero-settle absolute inset-0">
        <Image
          src={images.hero.src}
          alt={images.hero.alt}
          fill
          preload
          quality={80}
          sizes="100vw"
          placeholder="blur"
          className="object-cover object-[58%_62%]"
        />
      </div>
    </div>
  );
}
