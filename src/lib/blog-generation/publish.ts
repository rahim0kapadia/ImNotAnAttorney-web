/**
 * @fileoverview Blog publish step, commits an MDX file to GitHub via the
 * Contents API, then marks the draft and content gap as published, and
 * submits the new URL to IndexNow.
 *
 * Called by /api/cron/blog-publish for each qa-passed draft.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlogDraft } from "@/lib/types/blog-pipeline";

const GITHUB_OWNER = "rahim0kapadia";
const GITHUB_REPO = "ImNotAnAttorney-web";
const GITHUB_API = "https://api.github.com";
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "";
const SITE_URL = "https://imnotanattorney.com";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PublishResult {
  slug: string;
  success: boolean;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function githubHeaders(): Record<string, string> {
  return {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };
}

/**
 * Returns true if an MDX file already exists at the given slug path in the
 * repo. A 200 means "exists"; 404 means "free to use".
 */
async function slugExists(slug: string): Promise<boolean> {
  const res = await fetch(
    `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/content/blog/${slug}.mdx`,
    { headers: githubHeaders() }
  );
  return res.status === 200;
}

/**
 * Finds a free slug by appending -2, -3, … until one that does not exist in
 * the repo is found. Returns the original slug if it is already free.
 */
async function resolveUniqueSlug(base: string): Promise<string> {
  if (!(await slugExists(base))) return base;

  let n = 2;
  while (n <= 4) {
    const candidate = `${base}-${n}`;
    if (!(await slugExists(candidate))) return candidate;
    n++;
  }

  // Fallback after 3 collision attempts, timestamp suffix is unique enough
  return `${base}-${Date.now()}`;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Publishes a single qa-passed draft to GitHub and marks it published in DB.
 *
 * Steps:
 *  1. Resolve slug conflicts (append -2/-3 if needed)
 *  2. Commit the MDX via GitHub Contents API (PUT)
 *  3. Update blog_drafts: status → 'published', published_at → now
 *  4. Update content_gaps: status → 'published', has_blog_post → true
 *  5. Submit URL to IndexNow (fire-and-forget, non-fatal on failure)
 */
export async function publishDraft(
  draft: BlogDraft & { content_gaps?: { charge_type_slug: string } },
  supabase: SupabaseClient
): Promise<PublishResult> {
  try {
    // ── 1. Slug deduplication ──────────────────────────────────────────────
    const resolvedSlug = await resolveUniqueSlug(draft.slug);

    if (resolvedSlug !== draft.slug) {
      console.log(
        `[blog-publish] Slug conflict: "${draft.slug}" → "${resolvedSlug}"`
      );
      const { error: slugUpdateErr } = await supabase
        .from("blog_drafts")
        .update({ slug: resolvedSlug, updated_at: new Date().toISOString() })
        .eq("id", draft.id);

      if (slugUpdateErr) {
        throw new Error(
          `Failed to update slug in DB: ${slugUpdateErr.message}`
        );
      }
    }

    const slug = resolvedSlug;

    // ── 2. Commit MDX to GitHub ────────────────────────────────────────────
    const createRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/content/blog/${slug}.mdx`,
      {
        method: "PUT",
        headers: githubHeaders(),
        body: JSON.stringify({
          message: `blog: add ${draft.title}`,
          content: Buffer.from(draft.mdx_content).toString("base64"),
          committer: {
            name: "Atlas Blog Pipeline",
            email: "noreply@imnotanattorney.com",
          },
        }),
      }
    );

    if (createRes.status !== 201) {
      const body = await createRes.text();
      throw new Error(
        `GitHub Contents API returned ${createRes.status}: ${body}`
      );
    }

    // ── 3. Mark draft published ────────────────────────────────────────────
    const now = new Date().toISOString();

    const { error: draftErr } = await supabase
      .from("blog_drafts")
      .update({ status: "published", published_at: now, updated_at: now })
      .eq("id", draft.id);

    if (draftErr) {
      // GitHub file was committed, log but don't throw so we don't orphan
      console.error(
        `[blog-publish] Draft DB update failed for "${slug}":`,
        draftErr.message
      );
    }

    // ── 4. Mark content gap published ─────────────────────────────────────
    const { error: gapErr } = await supabase
      .from("content_gaps")
      .update({
        status: "published",
        has_blog_post: true,
        updated_at: now,
      })
      .eq("id", draft.content_gap_id);

    if (gapErr) {
      console.error(
        `[blog-publish] content_gaps update failed for gap ${draft.content_gap_id}:`,
        gapErr.message
      );
    }

    // ── 5. IndexNow submission (fire-and-forget) ───────────────────────────
    const pageUrl = `${SITE_URL}/blog/${slug}`;
    if (INDEXNOW_KEY) {
      fetch(
        `https://api.indexnow.org/indexnow?url=${encodeURIComponent(pageUrl)}&key=${INDEXNOW_KEY}`
      ).catch((err) =>
        console.warn(`[blog-publish] IndexNow submission failed for "${slug}":`, err)
      );
    } else {
      console.warn("[blog-publish] INDEXNOW_KEY not set, skipping IndexNow submission");
    }

    return { slug, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[blog-publish] Failed to publish "${draft.slug}":`, message);
    return { slug: draft.slug, success: false, error: message };
  }
}
