import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Score page layout — SEO metadata for the Attorney Accountability Score.
 * This page is a lead magnet and should be indexed by search engines.
 */
export const metadata: Metadata = {
  title: "Free Attorney Accountability Score — ImNotAnAttorney",
  description:
    "Is your attorney doing their job? Answer 7 questions and get your free Attorney Accountability Score in 60 seconds. No email required.",
  alternates: {
    canonical: `${SITE_URL}/score`,
  },
};

export default function ScoreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
