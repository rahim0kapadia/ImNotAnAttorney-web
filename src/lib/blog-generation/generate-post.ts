/**
 * @fileoverview Core generation function — orchestrates topic enrichment,
 * prompt construction, Anthropic API call, MDX parsing, validation, and
 * DB insertion for a single content gap.
 *
 * Called by /api/cron/blog-generate. Returns a BlogDraft row on success.
 * Throws on validation failure or DB error so the route can mark the gap
 * as failed and release the cron lock.
 */

import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";
import { SupabaseClient } from "@supabase/supabase-js";
import { enrichTopic } from "./topic-research";
import { buildGenerationPrompt } from "./prompts";
import type {
  BlogDraft,
  BlogFrontmatter,
  ContentGapForGeneration,
} from "@/lib/types/blog-pipeline";

// ============================================================
// SLUG GENERATION
// ============================================================

/**
 * Derives a URL-safe slug from a post title.
 *
 * Uses split + filter + join — no regex on potentially large strings.
 * Lowercases, strips non-alphanumeric characters (except spaces), and
 * collapses spaces into hyphens.
 */
function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .split("")
    .map((ch) => {
      if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === " ") {
        return ch;
      }
      return "";
    })
    .join("")
    .split(" ")
    .filter((word) => word.length > 0)
    .join("-");
}

// ============================================================
// FRONTMATTER VALIDATION
// ============================================================

/**
 * Validates that all required frontmatter fields are present and non-empty.
 * Throws a descriptive error if any field is missing.
 */
function validateFrontmatter(data: Record<string, unknown>): BlogFrontmatter {
  const required = ["title", "date", "tags", "category", "excerpt", "author", "question_count", "faqs"] as const;

  for (const field of required) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      throw new Error(`Missing required frontmatter field: "${field}"`);
    }
  }

  if (!Array.isArray(data.tags) || data["tags"].length === 0) {
    throw new Error('Frontmatter "tags" must be a non-empty array');
  }

  if (!Array.isArray(data.faqs) || (data.faqs as unknown[]).length < 5) {
    throw new Error('Frontmatter "faqs" must contain at least 5 entries');
  }

  if (typeof data.question_count !== "number" || data.question_count < 1) {
    throw new Error('Frontmatter "question_count" must be a positive integer');
  }

  return {
    title: data.title as string,
    date: data.date as string,
    lastModified: (data.lastModified as string | undefined) ?? undefined,
    tags: data.tags as string[],
    category: data.category as string,
    excerpt: data.excerpt as string,
    author: data.author as string,
    question_count: data.question_count as number,
    faqs: data.faqs as Array<{ q: string; a: string }>,
    howToSteps: data.howToSteps as Array<{ name: string; text: string }> | undefined,
  };
}

// ============================================================
// WORD COUNT
// ============================================================

/**
 * Counts words in the MDX body content (after frontmatter is stripped).
 * Splits line-by-line then token-by-token — no regex on content strings.
 */
function countWords(content: string): number {
  let count = 0;
  const lines = content.split("\n");
  for (const line of lines) {
    const tokens = line.split(" ");
    for (const token of tokens) {
      if (token.length > 0) count++;
    }
  }
  return count;
}

// ============================================================
// TLDRBOX VALIDATION
// ============================================================

/**
 * Checks that the TLDRBox component appears in the MDX content.
 * Uses indexOf — no regex on content strings.
 */
function hasTLDRBox(content: string): boolean {
  return content.indexOf("<TLDRBox") !== -1;
}

// ============================================================
// PROMPT HASH
// ============================================================

/**
 * Produces a short deterministic hash of the prompt string for audit logging.
 * Uses a simple djb2-style accumulator — no crypto needed at this fidelity.
 */
function hashPrompt(prompt: string): string {
  let hash = 5381;
  for (let i = 0; i < prompt.length; i++) {
    hash = ((hash << 5) + hash) ^ prompt.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}

// ============================================================
// MAIN EXPORT
// ============================================================

/**
 * Full generation pipeline for one content gap:
 *   1. Enrich topic with Reddit signals + demand data + related posts
 *   2. Build the generation prompt
 *   3. Call Anthropic claude-opus-4-6 (8192 tokens max)
 *   4. Parse MDX frontmatter with gray-matter
 *   5. Validate frontmatter, word count, TLDRBox
 *   6. Derive slug from title
 *   7. Insert blog_draft row
 *   8. Update content_gaps.blog_draft_id + status = 'complete'
 *   9. Return the draft object
 *
 * @param gap      - The content gap selected for generation.
 * @param supabase - Admin Supabase client.
 * @returns The inserted BlogDraft row.
 * @throws If generation, parsing, validation, or DB write fails.
 */
export async function generatePost(
  gap: ContentGapForGeneration,
  supabase: SupabaseClient
): Promise<BlogDraft> {
  // ── 1. Topic enrichment ────────────────────────────────────────────────────
  const enrichment = await enrichTopic(gap, supabase);

  // ── 2. Prompt construction ─────────────────────────────────────────────────
  const prompt = buildGenerationPrompt(gap, enrichment);
  const promptHash = hashPrompt(prompt);

  // ── 3. Anthropic API call ──────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  if (!rawText.trim()) {
    throw new Error("Anthropic returned empty content");
  }

  // ── 4. Parse MDX frontmatter ───────────────────────────────────────────────
  let parsedData: Record<string, unknown>;
  let mdxContent: string;

  try {
    const parsed = matter(rawText);
    parsedData = parsed.data as Record<string, unknown>;
    mdxContent = parsed.content;
  } catch (err) {
    throw new Error(`gray-matter parse failed: ${String(err)}`);
  }

  // ── 5. Validate ────────────────────────────────────────────────────────────
  const frontmatter = validateFrontmatter(parsedData);

  const wordCount = countWords(mdxContent);
  if (wordCount < 1500 || wordCount > 3000) {
    throw new Error(
      `Word count out of range: ${wordCount} words (expected 1500-3000)`
    );
  }

  if (!hasTLDRBox(mdxContent)) {
    throw new Error("Generated MDX is missing required <TLDRBox> component");
  }

  // ── 6. Derive slug ─────────────────────────────────────────────────────────
  const slug = slugFromTitle(frontmatter.title);

  if (!slug) {
    throw new Error(`Could not derive slug from title: "${frontmatter.title}"`);
  }

  // ── 7. Insert blog_drafts row ──────────────────────────────────────────────
  const { data: draftRow, error: insertError } = await supabase
    .from("blog_drafts")
    .insert({
      content_gap_id: gap.id,
      slug,
      title: frontmatter.title,
      mdx_content: rawText,
      frontmatter,
      generation_model: "claude-opus-4-6",
      generation_prompt_hash: promptHash,
      humanizer_score: null,
      humanizer_details: null,
      a1_result: null,
      a1_details: null,
      upl_result: null,
      upl_details: null,
      qa_attempts: 0,
      qa_passed_at: null,
      published_at: null,
      version: 1,
      status: "draft",
    })
    .select()
    .single();

  if (insertError || !draftRow) {
    throw new Error(
      `Failed to insert blog_draft: ${insertError?.message ?? "no row returned"}`
    );
  }

  // ── 8. Update content_gaps ─────────────────────────────────────────────────
  const { error: gapUpdateError } = await supabase
    .from("content_gaps")
    .update({
      blog_draft_id: draftRow.id,
    })
    .eq("id", gap.id);

  if (gapUpdateError) {
    // Non-fatal — draft was created successfully; log and continue
    console.warn(
      `[generatePost] content_gaps update failed for gap ${gap.id}:`,
      gapUpdateError.message
    );
  }

  // ── 9. Return draft ────────────────────────────────────────────────────────
  return draftRow as BlogDraft;
}
