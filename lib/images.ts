/**
 * Image manifest. To replace a photograph, overwrite the file at the same path
 * (any aspect ratio works — layouts crop with object-fit) and run
 * `npm run images:optimize`. Update the alt text here if the subject changes.
 *
 * Static imports give Next.js intrinsic dimensions (no layout shift) and an
 * automatic blur placeholder.
 */
import heroSkyline from "@/public/images/hero/hero-skyline-dusk.jpg";
import cityNight from "@/public/images/architecture/city-night.jpg";
import concreteCurve from "@/public/images/architecture/concrete-curve.jpg";
import modernistFacade from "@/public/images/architecture/modernist-facade.jpg";
import constructionDusk from "@/public/images/architecture/construction-dusk.jpg";
import cityAerialDusk from "@/public/images/architecture/city-aerial-dusk.jpg";
import homeInterior from "@/public/images/properties/home-sunlit-interior.jpg";
import residenceDusk from "@/public/images/properties/residence-dusk.jpg";

export const images = {
  hero: {
    src: heroSkyline,
    alt: "A dense city skyline silhouetted against an ember-coloured sky at dusk.",
  },
  future: {
    src: cityNight,
    alt: "A city at night seen from above, with an elevated road tracing light through the towers.",
  },
  ideaPrimary: {
    src: concreteCurve,
    alt: "Sweeping curves of a concrete building, photographed in black and white.",
  },
  ideaSecondary: {
    src: modernistFacade,
    alt: "A modernist concrete facade with deep, rounded window openings.",
  },
  pathHome: {
    src: homeInterior,
    alt: "A sunlit living room with a linen sofa, sheer curtains and a balcony overlooking apartment towers.",
  },
  pathStay: {
    src: residenceDusk,
    alt: "A contemporary glass-walled residence at dusk, its lights reflected in a rain-wet courtyard.",
  },
  pathSell: {
    src: modernistFacade,
    alt: "A modernist concrete facade with deep, rounded window openings.",
  },
  pathBuild: {
    src: constructionDusk,
    alt: "Tower cranes above a construction site with a city skyline behind, at low sun.",
  },
  pathInvest: {
    src: cityAerialDusk,
    alt: "An aerial view of a city at dusk, its streets beginning to light up.",
  },
} as const;
