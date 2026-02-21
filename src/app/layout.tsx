import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  metadataBase: new URL("https://imnotanattorney.com"),
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
    url: "https://imnotanattorney.com",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} antialiased bg-background text-foreground`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-amber-500 focus:px-4 focus:py-2 focus:text-black focus:text-sm focus:font-semibold"
        >
          Skip to content
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "ImNotAnAttorney",
              url: "https://imnotanattorney.com",
              description: "Legal research and case analysis for criminal defendants. We provide legal information, not legal advice.",
              sameAs: ["https://x.com/ImNotAnAttorney"],
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
