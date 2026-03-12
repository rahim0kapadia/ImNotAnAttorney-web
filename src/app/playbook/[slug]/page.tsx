/**
 * Dynamic playbook sales page route.
 *
 * Renders the PlaybookSalesPage component with charge-specific config.
 * Replaces per-charge static pages (dui-first-offense/page.tsx etc.)
 *
 * URL: /playbook/dui-first-offense, /playbook/drug-possession, etc.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getPlaybookConfig,
  allPlaybookSlugs,
} from "@/lib/playbook-configs";
import { TIER_CORE } from "@/lib/tiers";
import type { TierSlug } from "@/lib/tiers";
import { SITE_URL } from "@/lib/site";
import PlaybookSalesPage from "@/components/PlaybookSalesPage";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return allPlaybookSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const config = getPlaybookConfig(slug);
  if (!config) return {};

  const tier = TIER_CORE[config.slug as TierSlug];
  const title = `${tier.name} — ${tier.priceDisplay} Instant Download | ImNotAnAttorney`;

  return {
    title,
    description: config.seoDescription,
    alternates: {
      canonical: `${SITE_URL}/playbook/${slug}`,
    },
    openGraph: {
      title: `${tier.name} — ${tier.priceDisplay} Instant Download`,
      description: config.seoDescription,
      url: `${SITE_URL}/playbook/${slug}`,
      type: "website",
    },
  };
}

export default async function PlaybookPage({ params }: PageProps) {
  const { slug } = await params;
  const config = getPlaybookConfig(slug);

  if (!config) {
    notFound();
  }

  const tier = TIER_CORE[config.slug as TierSlug];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: SITE_URL,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Playbooks",
                item: `${SITE_URL}/services`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: tier.name,
              },
            ],
          }),
        }}
      />
      <PlaybookSalesPage config={config} />
    </>
  );
}
