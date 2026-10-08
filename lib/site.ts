/**
 * Central site configuration. Links that point at future product surfaces are
 * collected here so they can be wired to real routes without touching layouts.
 */
export const site = {
  name: "Trustbrick",
  legalName: "Trustbrick Realty and Fintech Company Pvt. Ltd.",
  tagline: "Real estate, built on trust.",
  title: "Trustbrick — Real Estate, Built on Trust",
  description:
    "Trustbrick is building a smarter, more connected way to discover, evaluate and experience real estate.",
  // Set NEXT_PUBLIC_SITE_URL in production so canonical and Open Graph URLs resolve correctly.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

// Contact and legal destinations are placeholders until those pages exist.
export const links = {
  getStarted: "#get-started",
  login: "/login",
  signup: "/signup",
  account: "/account/profile",
  profile: "/account/profile",
  bookmarks: "/account/bookmarks",
  trips: "/account/trips",
  messages: "/account/messages",
  about: "/about",
  contact: "/contact",
  privacy: "#privacy",
  terms: "#terms",
} as const;

export const footerNav = [
  { label: "Buy", href: "/buy" },
  { label: "Rent", href: "/rent" },
  { label: "PGs", href: "/pg" },
  { label: "Home Stay", href: "/stays" },
  { label: "Invest", href: "/invest" },
  { label: "Legal Verification", href: "/legal-verification" },
  { label: "Plans", href: "/plans" },
  { label: "About", href: links.about },
  { label: "Contact us", href: links.contact },
] as const;

/** What Trustbrick offers, for the landing page's Services menu and the mobile menu. */
export const SERVICES = [
  { href: "/buy", label: "Buy", hint: "Homes for sale, including new launches" },
  { href: "/rent", label: "Rent", hint: "Apartments, studios and houses to rent" },
  { href: "/pg", label: "PGs", hint: "Paying-guest rooms and co-living, per bed" },
  { href: "/stays", label: "Home Stay", hint: "Whole homes and rooms by the night" },
  { href: "/invest", label: "Invest", hint: "New launches, commercial spaces and plots" },
] as const;

/** Not a place to find, so it sits apart from SERVICES in the menus. */
export const LEGAL_VERIFICATION = { href: "/legal-verification", label: "Legal Verification", hint: "Legal opinions & Documents for Verification" } as const;

export const FOR_OWNERS = [
  { href: "/become-a-host", label: "List your home", hint: "Host guests by the night" },
  { href: "/become-an-agent", label: "Become an agent", hint: "List and manage properties for clients" },
] as const;
