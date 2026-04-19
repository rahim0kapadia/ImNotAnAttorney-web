import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Score page layout — SEO metadata + WebApplication JSON-LD for the
 * "Masked Researcher's First Read" (formerly Defense Milestone Score).
 * This page is a lead magnet and should be indexed by search engines.
 *
 * `alternateName` retains the technical name for SEO continuity — queries
 * like "Defense Milestone Score" still match.
 */
export const metadata: Metadata = {
  title: "Is Your Attorney Working Your Case? | Masked Researcher's First Read",
  description:
    "Answer 10 questions. Our masked researchers return a one-page memo on whether your criminal defense attorney is meeting the milestones that matter, in 60 seconds, free, no email required.",
  alternates: {
    canonical: `${SITE_URL}/score`,
  },
  openGraph: {
    title: "Is Your Attorney Working Your Case? | Masked Researcher's First Read",
    description:
      "Answer 10 questions. Our masked researchers return a one-page memo on whether your criminal defense attorney is meeting the milestones that matter, in 60 seconds, free, no email required.",
    url: `${SITE_URL}/score`,
  },
};

export default function ScoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Masked Researcher's First Read",
            alternateName: "Defense Milestone Score",
            description:
              "Free 10-question assessment delivered as a leaked-internal-memo-style First Read on whether your criminal defense attorney is meeting key case milestones.",
            url: `${SITE_URL}/score`,
            applicationCategory: "UtilityApplication",
            operatingSystem: "Any",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />
      {children}
    </>
  );
}
