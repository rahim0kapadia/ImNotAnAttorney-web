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
 * metadataBase: https://imnotanattorney.com — all relative OG/canonical URLs
 * resolve against this. Required for Next.js metadata API.
 */
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Playfair_Display } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Analytics } from "@vercel/analytics/react";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

/** Geist Sans — primary font. Loaded via next/font/google for zero-CLS font loading. */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/** Playfair Display — display/serif font for headlines. Adds premium typographic contrast. */
const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});


/** Viewport configuration — exported separately per Next.js 15 requirements. */
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
    default: "ImNotAnAttorney — We Research. You Ask.",
    template: "%s | ImNotAnAttorney",
  },
  description:
    "Legal empowerment for criminal defendants. We research your case and generate the questions that hold your attorney accountable. We provide legal information, not legal advice.",
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
 * RootLayout — wraps all pages with consistent chrome and global scripts.
 * The body applies Geist Sans font + antialiasing + dark mode color scheme.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading headers forces dynamic rendering — required for CSP nonce propagation
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${playfairDisplay.variable} antialiased bg-background text-foreground`}
      >
        {/* Skip link — accessibility: allows keyboard/screen reader users to bypass nav */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-amber-500 focus:px-4 focus:py-2 focus:text-black focus:text-sm focus:font-semibold"
        >
          Skip to content
        </a>
        {/* Organization JSON-LD schema — appears on every page for Google Knowledge Panel */}
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "@id": `${SITE_URL}/#organization`,
              name: "ImNotAnAttorney",
              url: SITE_URL,
              description: "Legal research and case analysis for criminal defendants. We provide legal information, not legal advice.",
              logo: { "@type": "ImageObject", url: `${SITE_URL}/icon` },

              foundingDate: "2026",
              founder: {
                "@type": "Person",
                name: "Rahim Kapadia",
                jobTitle: "Founder",
              },
              knowsAbout: [
                "Criminal Defense",
                "DUI Defense",
                "Drug Trafficking Defense",
                "Attorney Accountability",
                "Legal Research",
              ],
              areaServed: { "@type": "Country", name: "United States" },
            }),
          }}
        />
        <Header />
        <main id="main-content" className="min-h-screen">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
