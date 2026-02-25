import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Score page layout — SEO metadata for the Defense Milestone Score.
 * This page is a lead magnet and should be indexed by search engines.
 */
export const metadata: Metadata = {
  title: "Free Defense Milestone Score",
  description:
    "Is your defense on track? Answer 7 questions and get your free Defense Milestone Score in 60 seconds. No email required.",
  alternates: {
    canonical: `${SITE_URL}/score`,
  },
  openGraph: {
    title: "Free Defense Milestone Score",
    description:
      "Is your defense on track? Answer 7 questions and get your free score in 60 seconds. No email required.",
    url: `${SITE_URL}/score`,
  },
};

export default function ScoreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
