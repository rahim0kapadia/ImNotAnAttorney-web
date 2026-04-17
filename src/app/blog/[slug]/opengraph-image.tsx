/**
 * blog/[slug]/opengraph-image.tsx — Dynamic per-post Open Graph image.
 *
 * Uses the shared renderOgImage() template so every post inherits the
 * premium brand design automatically. Pre-generated at build time via
 * generateStaticParams so Vercel serverless doesn't try to read
 * content/blog/ at request time.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { getAllPosts, getPostBySlug } from "@/lib/blog";

export const alt = "ImNotAnAttorney — Criminal Defense Research";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  const rawTitle = (post?.title || "ImNotAnAttorney").trim();
  // Cap at ~42 chars so each half fits at 88px Playfair within 1040px column.
  const trimmed =
    rawTitle.length > 42
      ? rawTitle.slice(0, rawTitle.lastIndexOf(" ", 40)).replace(/[:,.\s]+$/, "") + "…"
      : rawTitle;
  const mid = Math.floor(trimmed.length / 2);
  const forwardBreak = trimmed.indexOf(" ", mid);
  const backwardBreak = trimmed.lastIndexOf(" ", mid);
  const breakAt = forwardBreak > 0 ? forwardBreak : backwardBreak;
  const title =
    breakAt > 0 && trimmed.length > 18
      ? `${trimmed.slice(0, breakAt)}\n${trimmed.slice(breakAt + 1)}`
      : trimmed;

  const rawExcerpt = (post?.excerpt || "").trim();
  // Keep subtitle tight enough to fit under the hero without overflowing the card.
  const subtitle =
    rawExcerpt.length > 100
      ? rawExcerpt.slice(0, rawExcerpt.lastIndexOf(" ", 98)) + "…"
      : rawExcerpt || undefined;

  return renderOgImage({
    title,
    subtitle,
    category: "Field Report",
  });
}
