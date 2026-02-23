import type { MetadataRoute } from "next";

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
    sitemap: "https://imnotanattorney.com/sitemap.xml",
    host: "https://imnotanattorney.com",
  };
}
