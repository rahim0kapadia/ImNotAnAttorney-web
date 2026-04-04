/**
 * blog/page.tsx -- Blog index page with category filtering.
 *
 * Displays all published blog posts as a 2-column grid of BlogCard components,
 * with optional filtering by category via the `?category=` query parameter.
 *
 * Categories: DUI, Drug Cases, White Collar, General Defense, or All (no filter).
 * Category filter pills are rendered via a client component (BlogCategoryFilter)
 * that uses useRouter for instant client-side navigation without full page reload.
 *
 * Data source: `getAllPosts()` from `src/lib/blog.ts` reads MDX frontmatter from
 * the `content/blog/` directory at build time. Posts are sorted by date (newest first).
 *
 * SEO: Static metadata with canonical URL. No dynamic OG image for the index page --
 * the root opengraph-image.tsx is used instead.
 *
 * A LeadCapture component is rendered below the post grid for email collection.
 *
 * Empty state: If no posts match the selected category, a "No posts in this category
 * yet" message is shown.
 */
import { getAllPosts } from "@/lib/blog";
import { BlogCard } from "@/components/BlogCard";
import { BlogCategoryFilter } from "@/components/BlogCategoryFilter";
import { LeadCapture } from "@/components/LeadCapture";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";
import { SITE_URL } from "@/lib/site";
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criminal Defense Blog",
  description:
    "In-depth legal research and defense strategies for criminal defendants — the information that closes the gap between what you know and what everyone else in the courtroom knows.",
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const allPosts = getAllPosts();
  const posts = category
    ? allPosts.filter(
        (p) => p.category.toLowerCase() === category.toLowerCase()
      )
    : allPosts;

  return (
    <div className="px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Criminal Defense Blog — What Defendants Need to Know Before Court",
            description:
              "In-depth legal research and defense strategies for criminal defendants — the information that closes the gap between what you know and what everyone else in the courtroom knows.",
            url: `${SITE_URL}/blog`,
            isPartOf: { "@id": `${SITE_URL}/#website` },
            author: {
              "@type": "Organization",
              name: "ImNotAnAttorney",
              url: "https://imnotanattorney.com",
              sameAs: [
                "https://www.reddit.com/r/imnotanattorney/",
                "https://x.com/ImNotAnAttorney",
              ],
            },
          }),
        }}
      />
      <div className="mx-auto max-w-4xl">
        <FadeInUp>
          <h1 className="font-display text-3xl font-bold text-white md:text-4xl">Criminal Defense Blog — What Defendants Need to Know Before Court</h1>
          <p className="mt-3 text-zinc-400">
            Legal information that actually helps. No jargon, no fluff.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            97% of criminal cases end in plea deals (Bureau of Justice Statistics). In most of those cases, nobody gave the defendant the questions before it was too late. That&apos;s what this blog is for. Every article below is built on documented defense methodologies from attorneys like Lawrence Taylor (DUI defense), Barry Scheck (forensic evidence), and Gerry Spence (jury persuasion) &mdash; applied to the situations defendants actually face.
          </p>
        </FadeInUp>

        {/* Category filters — client component for instant filtering */}
        <Suspense fallback={<div className="mt-8 h-8" />}>
          <BlogCategoryFilter />
        </Suspense>

        {/* Posts */}
        <StaggerContainer className="mt-8 grid gap-6 md:grid-cols-2">
          {posts.map((post) => (
            <StaggerItem key={post.slug}>
              <BlogCard
                title={post.title}
                excerpt={post.excerpt}
                slug={post.slug}
                date={post.date}
                tags={post.tags}
                readingTime={post.readingTime}
              />
            </StaggerItem>
          ))}
        </StaggerContainer>

        {posts.length === 0 && (
          <div className="py-12 text-center text-zinc-400">
            No posts in this category yet. Check back soon.
          </div>
        )}

        {/* Lead capture */}
        <div className="mt-16">
          <LeadCapture ungated />
        </div>
      </div>
    </div>
  );
}
