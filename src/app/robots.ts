/**
 * robots.ts -- Search engine crawl rules served at `/robots.txt`.
 *
 * Allowed paths: Public content pages (homepage, blog, services, resources, about,
 * intake, terms, privacy, guides, score).
 *
 * Disallowed paths:
 *   - /api/*       -- API routes (not for indexing)
 *   - /_next/*     -- Next.js internal assets
 *   - /404         -- Error page
 *   - /checkout*   -- Payment flow (contains dynamic Stripe sessions)
 *   - /upload      -- Authenticated file upload page
 *   - /report/*    -- Paid customer reports (private)
 *   - /unsubscribe -- Email unsubscribe handler
 *
 * Points to the XML sitemap at https://imnotanattorney.com/sitemap.xml.
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/blog",
        "/blog/*",
        "/services",
        "/resources",
        "/about",
        "/intake",
        "/terms",
        "/privacy",
        "/guides/*",
        "/score",
      ],
      disallow: [
        "/api/*",
        "/_next/*",
        "/404",
        "/checkout",
        "/checkout/*",
        "/upload",
        "/report/*",
        "/unsubscribe",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
