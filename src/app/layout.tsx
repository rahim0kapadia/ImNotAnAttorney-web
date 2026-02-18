import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
  alternates: {
    canonical: "https://imnotanattorney.com",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "ImNotAnAttorney",
              url: "https://imnotanattorney.com",
              description: "Legal research and case analysis for criminal defendants. We provide legal information, not legal advice.",
              sameAs: [],
            }),
          }}
        />
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
