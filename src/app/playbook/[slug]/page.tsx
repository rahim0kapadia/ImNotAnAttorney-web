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
import DuiPlaybookCountySidebar from "@/components/DuiPlaybookCountySidebar";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ state?: string; county?: string }>;
}

/** Slugs eligible for the FARS county sidebar (DUI variants only). */
const DUI_PLAYBOOK_SLUGS = new Set<string>([
  "dui-first-offense",
  "dui-second-offense",
  "felony-dui",
]);

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
  const title = `${tier.name}, ${tier.priceDisplay} Instant Download`;

  return {
    title,
    description: config.seoDescription,
    alternates: {
      canonical: `${SITE_URL}/playbook/${slug}`,
    },
    openGraph: {
      title: `${tier.name}, ${tier.priceDisplay} Instant Download`,
      description: config.seoDescription,
      url: `${SITE_URL}/playbook/${slug}`,
      type: "website",
    },
  };
}

export default async function PlaybookPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const config = getPlaybookConfig(slug);

  if (!config) {
    notFound();
  }

  const tier = TIER_CORE[config.slug as TierSlug];

  // TICKET-11: optional FARS county sidebar for DUI variants when
  // ?state=X&county=Y are present. Sidebar self-renders null when
  // params absent or county doesn't resolve.
  const sp = searchParams ? await searchParams : undefined;
  const showCountySidebar = DUI_PLAYBOOK_SLUGS.has(slug);

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
                item: `${SITE_URL}/playbooks`,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: tier.name,
            description: config.seoDescription,
            url: `${SITE_URL}/playbook/${slug}`,
            image: `${SITE_URL}/playbook/${slug}/opengraph-image`,
            brand: {
              "@type": "Brand",
              name: "ImNotAnAttorney",
            },
            offers: {
              "@type": "Offer",
              price: tier.price / 100,
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?tier=${config.slug}`,
              seller: {
                "@type": "Organization",
                name: "ImNotAnAttorney",
              },
              shippingDetails: {
                "@type": "OfferShippingDetails",
                deliveryTime: {
                  "@type": "ShippingDeliveryTime",
                  businessDays: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0 },
                },
                shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "USD" },
              },
              hasMerchantReturnPolicy: {
                "@type": "MerchantReturnPolicy",
                applicableCountry: "US",
                returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
                merchantReturnDays: 30,
                returnMethod: "https://schema.org/ReturnByMail",
                returnFees: "https://schema.org/FreeReturn",
              },
            },
            category: "Legal Research",
          }),
        }}
      />
      <PlaybookSalesPage config={config} />
      {showCountySidebar ? (
        <div className="mx-auto max-w-3xl px-4 pb-12">
          <DuiPlaybookCountySidebar state={sp?.state} county={sp?.county} />
        </div>
      ) : null}
    </>
  );
}
