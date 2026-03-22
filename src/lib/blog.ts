/**
 * @fileoverview Blog post system — reads MDX files from the filesystem.
 *
 * Blog posts are stored as MDX files in `content/blog/`. Each file uses
 * YAML frontmatter for metadata (title, date, tags, excerpt, author, category)
 * and MDX for the body content.
 *
 * This module handles:
 *   - Parsing MDX files with gray-matter for frontmatter extraction
 *   - Computing reading time estimates via the reading-time package
 *   - Listing all posts sorted by date (newest first)
 *   - Looking up individual posts by slug (filename without .mdx)
 *   - Finding related posts by shared category or overlapping tags
 *
 * Frontmatter schema (all optional with defaults):
 *   - title: string (defaults to slug)
 *   - date: string in YYYY-MM-DD format (defaults to today)
 *   - tags: string[] (defaults to [])
 *   - excerpt: string (defaults to "")
 *   - author: string (defaults to "ImNotAnAttorney Team")
 *   - category: string (defaults to "general-defense")
 *
 * The blog directory is resolved from process.cwd() (the Next.js project root),
 * not from __dirname, so it works correctly in both dev and production.
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

/** Absolute path to the blog content directory. */
const BLOG_DIR = path.join(process.cwd(), "content", "blog");

// ============================================================
// TYPES
// ============================================================

/** Parsed blog post with frontmatter metadata and raw MDX content. */
export interface BlogPost {
  /** URL-safe identifier derived from the filename (e.g., "motion-deadlines"). */
  slug: string;
  /** Post title from frontmatter. */
  title: string;
  /** Publication date as YYYY-MM-DD string from frontmatter. */
  date: string;
  /** Array of tag strings for categorization and related-post matching. */
  tags: string[];
  /** Short summary for listing pages and SEO meta descriptions. */
  excerpt: string;
  /** Author attribution (defaults to "ImNotAnAttorney Team"). */
  author: string;
  /** Primary category for grouping and related-post matching. */
  category: string;
  /** FAQ pairs for FAQPage schema (from frontmatter). */
  faqs: Array<{ q: string; a: string }>;
  /** HowTo steps for HowTo schema (from frontmatter). */
  howToSteps: Array<{ name: string; text: string }>;
  /** Last-modified date as YYYY-MM-DD string (falls back to date if not set). */
  lastModified: string;
  /** Human-readable reading time estimate (e.g., "5 min read"). */
  readingTime: string;
  /** Raw MDX body content (without frontmatter). */
  content: string;
}

// ============================================================
// POST RETRIEVAL
// ============================================================

/**
 * Returns all blog posts sorted by date (newest first).
 *
 * Reads every .mdx file from the blog directory, parses frontmatter,
 * computes reading time, and sorts descending by date. Returns an empty
 * array if the blog directory does not exist (e.g., fresh clone without content).
 *
 * @returns Array of all blog posts, newest first.
 */
export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));

  const posts = files.map((file) => {
    const slug = file.replace(/\.mdx$/, "");
    return getPostBySlug(slug);
  });

  return posts
    .filter((p): p is BlogPost => p !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Retrieves a single blog post by its slug (filename without .mdx extension).
 *
 * Parses the MDX file's frontmatter with gray-matter and computes reading
 * time. Missing frontmatter fields fall back to sensible defaults.
 *
 * @param slug - The URL slug / filename stem (e.g., "motion-deadlines").
 * @returns The parsed blog post, or null if the file does not exist.
 */
export function getPostBySlug(slug: string): BlogPost | null {
  // Validate slug to prevent path traversal
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) return null;

  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);

  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const stats = readingTime(content);

  return {
    slug,
    title: data.title || slug,
    date: data.date || new Date().toISOString().split("T")[0],
    tags: data.tags || [],
    excerpt: data.excerpt || "",
    author: data.author || "ImNotAnAttorney Team",
    category: data.category || "general-defense",
    faqs: data.faqs || [],
    howToSteps: data.howToSteps || [],
    lastModified: data.lastModified || data.date || new Date().toISOString().split("T")[0],
    readingTime: stats.text,
    content,
  };
}

/**
 * Finds related posts based on shared category or overlapping tags.
 *
 * A post is considered "related" if it shares the same category OR has
 * at least one tag in common with the current post. Results are taken
 * from the date-sorted list (newest first), excluding the current post.
 *
 * @param currentSlug - Slug of the post to find related content for.
 * @param limit - Maximum number of related posts to return (default: 2).
 * @returns Array of related posts, up to `limit` entries.
 */
export function getRelatedPosts(
  currentSlug: string,
  limit = 2
): BlogPost[] {
  const current = getPostBySlug(currentSlug);
  if (!current) return [];

  return getAllPosts()
    .filter((p) => p.slug !== currentSlug)
    .filter(
      (p) =>
        p.category === current.category ||
        p.tags.some((t) => current.tags.includes(t))
    )
    .slice(0, limit);
}
