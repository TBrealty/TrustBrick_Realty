import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { PlansPromo } from "@/components/subscriptions/PlansPromo";
import { site } from "@/lib/site";
import "./globals.css";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: site.name,
    title: site.title,
    description: site.description,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2eee6" },
    { media: "(prefers-color-scheme: dark)", color: "#12151b" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // globals.css makes in-page anchor scrolling smooth; this tells Next to switch it off during
      // route changes, so arriving on a page lands at the top instantly instead of gliding elsewhere.
      data-scroll-behavior="smooth"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Scroll reveals only hide content once we know JS is running, and a chosen theme is
          applied before the first paint. Without a choice the CSS answers prefers-color-scheme,
          so there is nothing to wait for and nothing flashes.
        */}
        <Script id="js-flag" strategy="beforeInteractive">
          {"document.documentElement.classList.add('js');try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}"}
        </Script>
      </head>
      <body>
        {children}
        {/* Once after each log-in: the plans pop-up. */}
        <PlansPromo />
      </body>
    </html>
  );
}
