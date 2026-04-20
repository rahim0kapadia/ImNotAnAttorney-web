/**
 * Root Layout (src/app/layout.tsx)
 *
 * The shared layout wrapper for every page on imnotanattorney.com.
 * Provides: fonts, global styles, site-wide metadata, Organization schema
 * markup, accessibility features, analytics, and the Header/Footer chrome.
 *
 * Key concerns:
 *   - Font: Geist Sans (Google Fonts) via next/font, applied as CSS variable
 *   - Dark mode: html class="dark" (hardcoded, no theme toggle)
 *   - Skip link: Accessible "Skip to content" link for keyboard/screen readers
 *   - Organization schema: JSON-LD markup for Google Knowledge Panel
 *     (name, URL, description, social profiles)
 *   - Vercel Analytics: Tracks page views + web vitals in production
 *   - Global metadata: Default title template ("%s | ImNotAnAttorney"),
 *     OG/Twitter card configuration, robots index/follow
 *
 * Layout structure:
 *   <html lang="en" class="dark">
 *     <body>
 *       <a> (skip link, sr-only until focused)
 *       <script> (Organization JSON-LD)
 *       <Header /> (nav bar)
 *       <main id="main-content"> {children} </main>
 *       <Footer /> (links, disclaimer, CAN-SPAM address)
 *       <Analytics /> (Vercel)
 *     </body>
 *   </html>
 *
 * metadataBase: https://imnotanattorney.com, all relative OG/canonical URLs
 * resolve against this. Required for Next.js metadata API.
 */
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Lato, Playfair_Display } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Analytics } from "@vercel/analytics/react";
import { CookieConsent } from "@/components/CookieConsent";
import { SITE_URL } from "@/lib/site";
import { isPartnerBrandedRoute } from "@/lib/partner-branding/route-matcher";
import { partnerBrandingEnabled } from "@/lib/partner-branding/feature-flag";
import "./globals.css";

/** Lato, primary body font per brand.md. Warm, readable for legal content. CSS var kept as --font-geist-sans for minimal blast radius. */
const bodyFont = Lato({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

/** Playfair Display, display/serif font for headlines. Adds premium typographic contrast. */
const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});


/** Viewport configuration, exported separately per Next.js 15 requirements. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Site-wide metadata defaults.
 * - metadataBase: Required for resolving relative OG image URLs
 * - title.template: Page-specific titles append " | ImNotAnAttorney"
 * - robots: index + follow for all pages (except report viewer which overrides)
 * - OG/Twitter: Default card configuration for social sharing
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ImNotAnAttorney, Know What They Know.",
    template: "%s | ImNotAnAttorney",
  },
  description:
    "Legal empowerment for criminal defendants. We research your case and generate the questions that close the gap between what you know and what everyone else in the courtroom knows.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "ImNotAnAttorney",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    site: "@ImNotAnAttorney",
  },
  robots: {
    index: true,
    follow: true,
  },
};

/**
 * RootLayout, wraps all pages with consistent chrome and global scripts.
 * The body applies Geist Sans font + antialiasing + dark mode color scheme.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading headers forces dynamic rendering, required for CSP nonce propagation
  const headerList = await headers();
  const nonce = headerList.get("x-nonce") ?? "";
  const pathname = headerList.get("x-pathname");
  const suppressGlobalChrome = partnerBrandingEnabled() && isPartnerBrandedRoute(pathname);

  return (
    <html lang="en" className="dark">
      <body
        className={`${bodyFont.variable} ${playfairDisplay.variable} antialiased bg-background text-foreground`}
      >
        {/* Skip link, accessibility: allows keyboard/screen reader users to bypass nav */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-amber-500 focus:px-4 focus:py-2 focus:text-black focus:text-sm focus:font-semibold"
        >
          Skip to content
        </a>
        {/* Organization JSON-LD schema, appears on every page for Google Knowledge Panel */}
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                "@id": `${SITE_URL}/#organization`,
                name: "ImNotAnAttorney",
                url: SITE_URL,
                description: "Defendant preparation intelligence, case-specific research and accountability questions for criminal defendants. Legal information, not legal advice.",
                logo: { "@type": "ImageObject", url: `${SITE_URL}/icon` },
                foundingDate: "2026",
                knowsAbout: [
                  "Criminal Defense",
                  "DUI Defense",
                  "Drug Trafficking Defense",
                  "Drug Possession Defense",
                  "White Collar Defense",
                  "Federal Criminal Defense",
                  "Self-Defense Claims",
                  "Sex Offense Defense",
                  "Probation Violations",
                  "Defendant Preparation Intelligence",
                  "Legal Research",
                ],
                areaServed: { "@type": "Country", name: "United States" },
                serviceType: "Legal Information Research",
                sameAs: [
                  "https://x.com/ImNotAnAttorney",
                  "https://www.instagram.com/im_not_an_attorney/",
                  "https://www.youtube.com/@imnotanattorney",
                  "https://www.facebook.com/ImnotanAttorney",
                ],
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                url: SITE_URL,
                name: "ImNotAnAttorney",
                description: "Defendant preparation intelligence, case research and accountability questions for criminal defendants.",
                publisher: { "@id": `${SITE_URL}/#organization` },
              },
            ]),
          }}
        />
        {suppressGlobalChrome ? null : <Header />}
        <main id="main-content" className="min-h-screen">{children}</main>
        {suppressGlobalChrome ? null : <Footer />}
        <Analytics />
        <CookieConsent />
      </body>
    </html>
  );
}
