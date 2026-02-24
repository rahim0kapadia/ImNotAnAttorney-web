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
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();

  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/services`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/resources`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/intake`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/sample`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/score`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...blogEntries,
  ];
}
