/**
 * @file /my-case/[token]/layout.tsx — Layout for customer case progress portal.
 *
 * Sets noindex/nofollow to prevent search engine indexing of private case data.
 * The actual metadata title is overridden by generateMetadata in page.tsx.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Case Progress — ImNotAnAttorney",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
