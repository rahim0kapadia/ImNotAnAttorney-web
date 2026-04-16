/**
 * blog/[slug]/opengraph-image.tsx -- Dynamic per-post Open Graph image.
 *
 * Generates a unique 1200x630 PNG OG image for each blog post, using the post's
 * title as the main headline. Falls back to "ImNotAnAttorney" if the slug is invalid.
 *
 * Layout: Brand name top-left, post title centered (large text, max 900px width),
 * site URL + tagline at the bottom. Dark gradient background matching site theme.
 *
 * This runs at BUILD TIME for statically generated blog posts (via generateStaticParams
 * in the sibling page.tsx). The image is cached and served as a static asset.
 *
 * Data source: `getPostBySlug()` from `src/lib/blog.ts`.
 *
 * Note: Unlike the root opengraph-image.tsx, this does NOT use the Edge runtime --
 * it runs in the default Node.js runtime at build time.
 */
import { ImageResponse } from "next/og";
import { getAllPosts, getPostBySlug } from "@/lib/blog";

export const alt = "ImNotAnAttorney, Criminal Defense Research Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Pre-generate OG images for every blog post at build time.
 *
 * Without this, Next.js treats the OG image as a dynamic serverless function.
 * On Vercel, the serverless runtime doesn't bundle the `content/blog/` directory,
 * so `fs.readFileSync()` in `getPostBySlug()` fails with ENOENT -> HTTP 500.
 *
 * By exporting `generateStaticParams` (matching the sibling `page.tsx`), Next.js
 * renders every OG image during `next build` and serves them as static assets.
 */
export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const title = post?.title || "ImNotAnAttorney";

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #09090b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#f59e0b",
            fontWeight: 700,
          }}
        >
          <span style={{ color: "#ffffff" }}>Im</span>
          <span style={{ color: "#f59e0b" }}>Not</span>
          <span style={{ color: "#ffffff" }}>AnAttorney</span>
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.2,
            maxWidth: 900,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 18,
            color: "#71717a",
          }}
        >
          imnotanattorney.com &bull; Know What They Know.
        </div>
      </div>
    ),
    { ...size }
  );
}
