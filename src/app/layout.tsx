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
import { GoogleAnalytics } from "@next/third-parties/google";
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
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": ["Organization", "LegalService"],
                "@id": `${SITE_URL}/#organization`,
                name: "ImNotAnAttorney",
                url: SITE_URL,
                description: "Defendant preparation intelligence — case-specific research and accountability questions for criminal defendants. Legal information, not legal advice.",
                logo: { "@type": "ImageObject", url: `${SITE_URL}/icon` },
                // sameAs: [] — add social profile URLs when Twitter/X account is created
                foundingDate: "2026",
                founder: {
                  "@type": "Person",
                  name: "Rahim Kapadia",
                  jobTitle: "Founder",
                  url: `${SITE_URL}/about`,
                },
                knowsAbout: [
                  "Criminal Defense",
                  "DUI Defense",
                  "Drug Trafficking Defense",
                  "Defendant Preparation Intelligence",
                  "Legal Research",
                ],
                areaServed: { "@type": "Country", name: "United States" },
                serviceType: "Legal Information Research",
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                url: SITE_URL,
                name: "ImNotAnAttorney",
                description: "Defendant preparation intelligence — case research and accountability questions for criminal defendants.",
                publisher: { "@id": `${SITE_URL}/#organization` },
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: `${SITE_URL}/blog?q={search_term_string}`,
                  },
                  "query-input": "required name=search_term_string",
                },
              },
            ]),
          }}
        />
        <Header />
        <main id="main-content" className="min-h-screen">{children}</main>
        <Footer />
        <Analytics />
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
        {/* Meta Pixel — env var guard: set NEXT_PUBLIC_META_PIXEL_ID when account is created */}
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${process.env.NEXT_PUBLIC_META_PIXEL_ID}');
fbq('track', 'PageView');`,
            }}
          />
        )}
        {/* Google Ads Tag — env var guard: set NEXT_PUBLIC_GOOGLE_ADS_ID when account is created */}
        {process.env.NEXT_PUBLIC_GOOGLE_ADS_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}`}
            />
            <script
              nonce={nonce}
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}');`,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}
