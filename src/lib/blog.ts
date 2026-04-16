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
 *   - Tiered gate enforcement on .qa-state sidecar files:
 *       SAFETY gates (humanizer, anti-hallucination) block rendering — posts
 *       with fabricated data or AI-pattern detection failures never reach readers.
 *       QUALITY gates (slop, UPL, DNA) are tracked and logged but non-blocking,
 *       enabling progressive quality improvement without killing the blog.
 *     Run `node scripts/qa-existing-post.mjs --all` to rebuild sidecar state.
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
 *
 * QA gate environment variables:
 *   - BLOG_QA_BYPASS=1  Local dev only — allow all posts through without gate
 *                       enforcement. Logs a loud warning. Never set in prod.
 *
 * LLM gates run session-native via /blog-pipeline skill. Humanizer gate
 * (pure JS) runs via qa-existing-post.mjs. Safety gates must pass for
 * rendering; quality gates log warnings but don't block. Rebuild humanizer
 * sidecars with:
 *
 *     node scripts/qa-existing-post.mjs --all
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

/** Absolute path to the blog content directory. */
const BLOG_DIR = path.join(process.cwd(), "content", "blog");

/** Absolute path to the QA sidecar state directory. */
const QA_STATE_DIR = path.join(BLOG_DIR, ".qa-state");

/**
 * Ordered list of the 5 QA gate names. Must match the order used by
 * scripts/qa-existing-post.mjs and the sidecar JSON schema.
 */
const QA_GATE_NAMES = [
  "humanizer",
  "anti_hallucination",
  "slop",
  "upl",
  "dna",
] as const;

/**
 * Safety gates — must pass for a post to render. These catch content that
 * could directly harm defendants (fabricated legal data, AI-pattern detection).
 *
 * Quality gates (slop, upl, dna) are tracked in the sidecar and logged as
 * warnings but do NOT block rendering. This allows progressive quality
 * improvement without killing the blog.
 *
 * To tighten: move gate names from QUALITY_GATES into SAFETY_GATES once
 * all posts pass them.
 */
const SAFETY_GATES: readonly QaGateName[] = [
  "humanizer",
  "anti_hallucination",
] as const;

const QUALITY_GATES: readonly QaGateName[] = [
  "slop",
  "upl",
  "dna",
] as const;

type QaGateName = (typeof QA_GATE_NAMES)[number];

interface QaGateRecord {
  /** True if the gate returned a definitive pass. */
  passed: boolean;
  /**
   * `"checked"` — gate actually ran to completion.
   * `"unchecked"` — gate could not run (error, timeout, parse failure, etc.).
   * Always paired with a `reason`.
   */
  status?: "checked" | "unchecked";
  /** Free-text reason when `status === "unchecked"`. */
  reason?: string;
}

interface QaSidecar {
  slug: string;
  last_checked: string;
  all_passed: boolean;
  gates: Partial<Record<QaGateName, QaGateRecord>>;
}

/** In-process cache so we parse each sidecar JSON at most once per boot. */
const qaSidecarCache = new Map<string, QaSidecar | null>();

/** Loud-warning tracker so we don't spam identical log lines. */
const qaWarningsEmitted = new Set<string>();

function readQaSidecar(slug: string): QaSidecar | null {
  if (qaSidecarCache.has(slug)) return qaSidecarCache.get(slug) ?? null;

  const filePath = path.join(QA_STATE_DIR, `${slug}.json`);
  if (!fs.existsSync(filePath)) {
    qaSidecarCache.set(slug, null);
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as QaSidecar;
    qaSidecarCache.set(slug, parsed);
    return parsed;
  } catch {
    qaSidecarCache.set(slug, null);
    return null;
  }
}

function warnOnce(key: string, message: string): void {
  if (qaWarningsEmitted.has(key)) return;
  qaWarningsEmitted.add(key);
   
  console.warn(message);
}

/**
 * Returns `true` if a post is safe to render under the current QA policy.
 *
 * Tiered enforcement:
 *   1. BLOG_QA_BYPASS=1 → always allow (dev only, logs a warning).
 *   2. No sidecar file → block (post was never audited).
 *   3. All SAFETY_GATES pass (checked + passed) → allow.
 *   4. Otherwise → block (logs failing safety gates).
 *
 * Quality gates (slop, upl, dna) are logged as warnings when they fail
 * but do NOT block rendering. This allows progressive quality improvement.
 */
function isAllowedUnderQaPolicy(slug: string): boolean {
  if (process.env.BLOG_QA_BYPASS === "1") {
    warnOnce(
      "bypass",
      "[blog-qa] WARNING: BLOG_QA_BYPASS=1 — every post is rendering without gate enforcement. Dev use only."
    );
    return true;
  }

  const sidecar = readQaSidecar(slug);
  if (!sidecar) {
    warnOnce(
      `missing:${slug}`,
      `[blog-qa] BLOCKED: ${slug} — no .qa-state sidecar. Run: node scripts/qa-existing-post.mjs content/blog/${slug}.mdx`
    );
    return false;
  }

  // All gates pass — no warnings needed.
  if (sidecar.all_passed === true) return true;

  // Check safety gates — these block rendering.
  const failingSafetyGates = SAFETY_GATES.filter((name) => {
    const g = sidecar.gates[name];
    if (!g) return true;
    return g.passed !== true || g.status !== "checked";
  });

  // Log quality gate warnings (non-blocking).
  const failingQualityGates = QUALITY_GATES.filter((name) => {
    const g = sidecar.gates[name];
    if (!g) return true;
    return g.passed !== true || g.status !== "checked";
  });
  if (failingQualityGates.length > 0) {
    warnOnce(
      `quality:${slug}`,
      `[blog-qa] QUALITY: ${slug} — failing quality gates: ${failingQualityGates.join(", ")} (non-blocking)`
    );
  }

  if (failingSafetyGates.length > 0) {
    warnOnce(
      `fail:${slug}`,
      `[blog-qa] BLOCKED: ${slug} — failing safety gates: ${failingSafetyGates.join(", ")}`
    );
    return false;
  }

  return true;
}

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
  /** Content pillar slug for product CTA matching (from frontmatter). */
  pillarSlug: string;
  /** Product slugs linked to this pillar (from frontmatter). */
  linkedProducts: string[];
  /** Free entry point URL for this pillar (from frontmatter). */
  freeEntryPoint: string;
  /** Lowest-priced tier slug for paid CTA (from frontmatter). */
  ctaTier: string;
}

// ============================================================
// POST RETRIEVAL
// ============================================================

/**
 * Returns all blog posts sorted by date (newest first).
 *
 * Reads every .mdx file from the blog directory, parses frontmatter,
 * computes reading time, and sorts descending by date. Posts that have not
 * passed every QA gate are filtered out — see the QA gate environment
 * variable documentation at the top of this file for override policy.
 * Returns an empty array if the blog directory does not exist (e.g., fresh
 * clone without content).
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
 * time. Missing frontmatter fields fall back to sensible defaults. Hard-gated
 * on the .qa-state sidecar — returns null for any post that is not allowed
 * under the current QA policy (see `isAllowedUnderQaPolicy`).
 *
 * @param slug - The URL slug / filename stem (e.g., "motion-deadlines").
 * @returns The parsed blog post, or null if the file does not exist or is
 *   blocked by the QA gate.
 */
export function getPostBySlug(slug: string): BlogPost | null {
  // Validate slug to prevent path traversal
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) return null;

  if (!isAllowedUnderQaPolicy(slug)) return null;

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
    pillarSlug: data.pillarSlug || "",
    linkedProducts: data.linkedProducts || [],
    freeEntryPoint: data.freeEntryPoint || "",
    ctaTier: data.ctaTier || "",
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
