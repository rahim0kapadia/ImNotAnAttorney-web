/**
 * sitemap.ts -- Auto-generated XML sitemap for search engine crawlers.
 *
 * Produces a sitemap at `/sitemap.xml` that includes:
 *   - Static pages: homepage, blog index, services, resources, about, intake, sample,
 *     score, contact, terms, privacy.
 *   - Dynamic pages: All blog posts from `content/blog/` (via `getAllPosts()`).
 *
 * Priority values:
 *   - 1.0: Homepage
 *   - 0.9: Services
 *   - 0.8: Blog index, intake, sample, score
 *   - 0.7: Individual blog posts
 *   - 0.6: Resources
 *   - 0.5: About
 *   - 0.4: Contact
 *   - 0.3: Terms, Privacy
 *
 * Blog post `lastModified` dates come from MDX frontmatter. Static page dates
 * use `new Date()` (build time).
 *
 * Referenced by `robots.ts` which points crawlers to `/sitemap.xml`.
 */
import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { allPlaybookSlugs } from "@/lib/playbook-configs";
import { allStateSlugs } from "@/data/state-dui-laws";
import { allStateDrugLawsSlugs } from "@/data/state-drug-laws";
import { allStateAssaultLawsSlugs } from "@/data/state-assault-laws";
import { allStateDvLawsSlugs } from "@/data/state-dv-laws";
import { productsByCategory } from "@/lib/products";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();

  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.lastModified || post.date),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const playbookEntries: MetadataRoute.Sitemap = allPlaybookSlugs().map(
    (slug) => ({
      url: `${SITE_URL}/playbook/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })
  );

  // Content guides, dynamic routes under /guides/[slug] driven by the
  // standalone product catalog. Only active content products are included.
  const guideEntries: MetadataRoute.Sitemap = productsByCategory("content").map(
    (guide) => ({
      url: `${SITE_URL}/guides/${guide.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })
  );

  // Audit P1 #8 (2026-04-26): standalone services pages were missing from the
  // sitemap. /services/[slug] renders all 4 ProductCategory values; emit
  // sitemap entries for all active research, bundle, and calculator products.
  // PR-163 review F2: dedupe — these slugs already have dedicated routes at
  // /<slug> below; do not also emit /services/<slug> for them.
  const DEDICATED_ROUTE_SLUGS = new Set([
    "judge-report-card",
    "officer-background-check",
    "similar-cases-analyzer",
    // Apex Fix #1 (2026-04-26): 3 newly-built dedicated landings — also
    // dedupe their `/services/<slug>` entries so the canonical URL is the
    // top-level dedicated route.
    "motion-success-report",
    "federal-jury-instruction-brief",
    "federal-sentencing-distribution",
  ]);
  const serviceProductEntries: MetadataRoute.Sitemap = (
    [
      ...productsByCategory("research"),
      ...productsByCategory("bundle"),
      ...productsByCategory("calculator"),
    ]
  )
    .filter((p) => !DEDICATED_ROUTE_SLUGS.has(p.slug))
    .map((p) => ({
      url: `${SITE_URL}/services/${p.slug}`,
      // PR-163 review F8: stable date matching the literal-date pattern of
      // static entries; `new Date()` rebuilt every render and meant nothing
      // to crawlers.
      lastModified: new Date("2026-04-26"),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date("2026-03-20"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date("2026-03-20"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/score`,
      lastModified: new Date("2026-03-20"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    ...playbookEntries,
    ...guideEntries,
    ...serviceProductEntries,
    {
      url: `${SITE_URL}/playbooks`,
      lastModified: new Date("2026-03-24"),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/services`,
      lastModified: new Date("2026-03-11"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/resources`,
      lastModified: new Date("2026-03-11"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date("2026-03-20"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/intake`,
      lastModified: new Date("2026-02-15"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/sample`,
      lastModified: new Date("2026-03-11"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/research/defense-score-data`,
      lastModified: new Date("2026-03-21"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/editorial-policy`,
      lastModified: new Date("2026-03-20"),
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: new Date("2026-02-15"),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date("2026-02-15"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date("2026-02-15"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...blogEntries,
    // Free Plea Deal Analyzer (primary acquisition wedge)
    {
      url: `${SITE_URL}/plea-analyzer`,
      lastModified: new Date("2026-04-11"),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    },
    // Start (crisis entry)
    {
      url: `${SITE_URL}/start`,
      lastModified: new Date("2026-04-04"),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    },
    // DUI checklist resource
    {
      url: `${SITE_URL}/dui-checklist`,
      lastModified: new Date("2026-04-04"),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    // Sample X-Ray report
    {
      url: `${SITE_URL}/sample-xray`,
      lastModified: new Date("2026-04-04"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    // Family landing page
    {
      url: `${SITE_URL}/family`,
      lastModified: new Date("2026-03-20"),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    // DUI defense hub page
    {
      url: `${SITE_URL}/dui-defense`,
      lastModified: new Date("2026-03-20"),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    // State-specific DUI defense pages (50 states)
    ...allStateSlugs().map((slug) => ({
      url: `${SITE_URL}/dui-defense/${slug}`,
      lastModified: new Date("2026-03-20"),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // Drug possession defense hub + 50 state pages
    {
      url: `${SITE_URL}/drug-possession-defense`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.75,
    },
    ...allStateDrugLawsSlugs().map((slug) => ({
      url: `${SITE_URL}/drug-possession-defense/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // Assault defense hub + 50 state pages
    {
      url: `${SITE_URL}/assault-defense`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.75,
    },
    ...allStateAssaultLawsSlugs().map((slug) => ({
      url: `${SITE_URL}/assault-defense/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // Domestic violence defense hub + 49 state pages (NV missing from DB)
    {
      url: `${SITE_URL}/domestic-violence-defense`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.75,
    },
    ...allStateDvLawsSlugs().map((slug) => ({
      url: `${SITE_URL}/domestic-violence-defense/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // Tier 9 standalone data products
    {
      url: `${SITE_URL}/judge-report-card`,
      lastModified: new Date("2026-04-11"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/officer-background-check`,
      lastModified: new Date("2026-04-11"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/similar-cases-analyzer`,
      lastModified: new Date("2026-04-11"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    // Apex Fix #1 (2026-04-26) — 3 newly-built dedicated Tier 9 landings.
    {
      url: `${SITE_URL}/motion-success-report`,
      lastModified: new Date("2026-04-26"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/federal-jury-instruction-brief`,
      lastModified: new Date("2026-04-26"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/federal-sentencing-distribution`,
      lastModified: new Date("2026-04-26"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    // district-court-intelligence + arrest-survival-kit have dedicated routes
    // too; they're auto-included via productsByCategory("research") above as
    // /services/<slug> until promoted to DEDICATED_ROUTE_SLUGS in a future
    // pass (out of scope for Fix #1).
    // Partner program pages
    {
      url: `${SITE_URL}/partners`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/partners/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];
}
