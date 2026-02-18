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
        "/guides/*",
      ],
      disallow: [
        "/api/*",
        "/_next/*",
        "/404",
      ],
    },
    sitemap: "https://imnotanattorney.com/sitemap.xml",
    host: "https://imnotanattorney.com",
  };
}
