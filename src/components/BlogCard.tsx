/**
 * BlogCard -- Preview card for a blog post, used in the blog index and related-posts sections.
 *
 * Renders a semantic `<article>` element with:
 *   - Date and reading time in a meta row
 *   - Post title as an `<h2>` wrapped in a Next.js Link to `/blog/{slug}`
 *   - Excerpt text, truncated to 2 lines via `line-clamp-2`
 *   - Tag pills rendered as non-clickable `<span>` elements
 *
 * The entire card has a hover border transition; the title gets amber highlight on hover
 * via the `group` / `group-hover` Tailwind pattern.
 *
 * Data source: Post metadata comes from `src/lib/blog.ts` which reads MDX frontmatter
 * from `content/blog/`. The `readingTime` field is computed at build time.
 *
 * @param props.title       - Post title (displayed as-is, no truncation applied here).
 * @param props.excerpt     - Short description, visually truncated to 2 lines via CSS.
 * @param props.slug        - URL slug used to build the `/blog/{slug}` link.
 * @param props.date        - Human-readable date string (e.g. "February 20, 2026").
 * @param props.tags        - Array of tag labels rendered as pills.
 * @param props.readingTime - Reading time string (e.g. "5 min read").
 */
import Link from "next/link";

interface BlogCardProps {
  title: string;
  excerpt: string;
  slug: string;
  date: string;
  tags: string[];
  readingTime: string;
}

export function BlogCard({
  title,
  excerpt,
  slug,
  date,
  tags,
  readingTime,
}: BlogCardProps) {
  return (
    <article className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-700">
      <div className="mb-3 flex items-center gap-3">
        <time className="text-xs text-zinc-400">{date}</time>
        <span className="text-xs text-zinc-400">&bull;</span>
        <span className="text-xs text-zinc-400">{readingTime}</span>
      </div>
      <Link href={`/blog/${slug}`}>
        <h2 className="text-lg font-bold text-white transition-colors group-hover:text-amber-400">
          {title}
        </h2>
      </Link>
      <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{excerpt}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-400"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}
