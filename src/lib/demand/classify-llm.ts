/**
 * @fileoverview LLM Classifier — re-classifies ambiguous Reddit signals via Claude Haiku.
 *
 * Only processes posts where keyword matching produced:
 *   - Zero charge type matches (unclassified)
 *   - 3+ charge type matches (ambiguous)
 *   - Urgency 3-6 (unclear severity)
 *
 * Ported from: scripts/demand/classify-with-llm.mjs
 * Cost: ~$0.01-0.05/day (Haiku, only ambiguous posts)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Constants ──────────────────────────────────────────────
const BATCH_SIZE = 20;

// ── Types ──────────────────────────────────────────────────

export interface ClassifyResult {
  ambiguous: number;
  classified: number;
  unclassified: number;
  overClassified: number;
  unclearUrgency: number;
}

interface RedditSignal {
  reddit_id: string;
  title: string;
  body_snippet: string | null;
  charge_type_slugs: string[] | null;
  urgency_score: number | null;
  classified_by: string | null;
}

interface ChargeType {
  slug: string;
  label: string;
}

interface PainPoint {
  blog_slug: string;
  title: string;
}

interface ReferenceData {
  chargeTypeSlugs: string[];
  chargeTypeLabels: Record<string, string>;
  painPointSlugs: string[];
  painPointLabels: Record<string, string>;
}

interface LLMClassification {
  charge_types?: string[];
  pain_points?: string[];
  urgency?: number;
  emotional_tone?: string;
}

// ── Load reference data ────────────────────────────────────
async function loadReferenceData(supabase: SupabaseClient): Promise<ReferenceData> {
  const { data: chargeTypes } = await supabase
    .from("charge_types")
    .select("slug, label");

  const { data: painPoints } = await supabase
    .from("content_pain_points")
    .select("blog_slug, title");

  const ctList: ChargeType[] = chargeTypes || [];
  const ppList: PainPoint[] = painPoints || [];

  return {
    chargeTypeSlugs: ctList.map((ct) => ct.slug),
    chargeTypeLabels: Object.fromEntries(ctList.map((ct) => [ct.slug, ct.label])),
    painPointSlugs: ppList.map((pp) => pp.blog_slug),
    painPointLabels: Object.fromEntries(ppList.map((pp) => [pp.blog_slug, pp.title])),
  };
}

// ── Find ambiguous posts ───────────────────────────────────
async function findAmbiguousPosts(supabase: SupabaseClient): Promise<RedditSignal[]> {
  // Fetch recent signals (last 7 days) that are keyword-classified
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("reddit_signals")
    .select("reddit_id, title, body_snippet, charge_type_slugs, urgency_score, classified_by")
    .eq("classified_by", "keyword")
    .gte("fetched_at", weekAgo)
    .order("fetched_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Error loading signals: ${error.message}`);
  }

  // Filter to ambiguous
  return (data || []).filter((post: RedditSignal) => {
    const slugCount = (post.charge_type_slugs || []).length;
    const urgency = post.urgency_score || 0;

    return slugCount === 0 || slugCount >= 3 || (urgency >= 3 && urgency <= 6);
  });
}

// ── Classify batch with Haiku ──────────────────────────────
async function classifyBatch(
  client: Anthropic,
  posts: RedditSignal[],
  refData: ReferenceData
): Promise<LLMClassification[] | null> {
  const slugList = refData.chargeTypeSlugs.join(", ");
  const painPointList = refData.painPointSlugs.join(", ");

  const prompt = `Classify these Reddit posts about criminal legal issues.
For each post, return a JSON object with:
- charge_types: array of charge type slugs from: [${slugList}]
- pain_points: array of pain point slugs from: [${painPointList}]
- urgency: integer 0-10 (10 = immediate crisis, e.g. court tomorrow)
- emotional_tone: one of [terrified, helpless, angry, confused, desperate, hopeless, hopeful, pragmatic]

Posts:
${posts
  .map(
    (p, i) =>
      `[${i}] Title: ${p.title}\nBody: ${(p.body_snippet || "").slice(0, 300)}`
  )
  .join("\n\n")}

Return ONLY a JSON array of objects, one per post, in order. No explanation.`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (msg.content[0] as { type: string; text?: string })?.text || "";
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[demand-classify] Could not parse LLM response as JSON array");
      return null;
    }
    return JSON.parse(jsonMatch[0]) as LLMClassification[];
  } catch (err) {
    console.error("[demand-classify] LLM classification error:", (err as Error).message);
    return null;
  }
}

// ── Main export ────────────────────────────────────────────

/**
 * Re-classifies ambiguous Reddit signals using Claude Haiku.
 *
 * @param supabase - Supabase admin client (service role)
 * @returns ClassifyResult with counts of processed posts
 * @throws {Error} If ANTHROPIC_API_KEY is not set
 * @throws {Error} If Supabase query fails
 */
export async function classifyWithLLM(supabase: SupabaseClient): Promise<ClassifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY env var");
  }

  const ambiguous = await findAmbiguousPosts(supabase);
  console.log(`[demand-classify] Found ${ambiguous.length} ambiguous posts`);

  // Breakdown stats
  const unclassified = ambiguous.filter((p) => (p.charge_type_slugs || []).length === 0);
  const overClassified = ambiguous.filter((p) => (p.charge_type_slugs || []).length >= 3);
  const unclearUrgency = ambiguous.filter((p) => {
    const u = p.urgency_score || 0;
    return u >= 3 && u <= 6;
  });

  console.log(`[demand-classify]   Unclassified (0 types): ${unclassified.length}`);
  console.log(`[demand-classify]   Over-classified (3+ types): ${overClassified.length}`);
  console.log(`[demand-classify]   Unclear urgency (3-6): ${unclearUrgency.length}`);

  if (!ambiguous.length) {
    return {
      ambiguous: 0,
      classified: 0,
      unclassified: 0,
      overClassified: 0,
      unclearUrgency: 0,
    };
  }

  const client = new Anthropic({ apiKey });
  const refData = await loadReferenceData(supabase);

  // Process in batches
  let classified = 0;
  for (let i = 0; i < ambiguous.length; i += BATCH_SIZE) {
    const batch = ambiguous.slice(i, i + BATCH_SIZE);
    console.log(
      `[demand-classify] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} posts`
    );

    const results = await classifyBatch(client, batch, refData);
    if (!results || results.length !== batch.length) {
      console.warn(
        `[demand-classify] Batch returned ${results?.length || 0} results for ${batch.length} posts — skipping`
      );
      continue;
    }

    // Build upsert payloads for the whole batch, then write in one round-trip
    const upsertRows: Record<string, unknown>[] = [];
    for (let j = 0; j < batch.length; j++) {
      const post = batch[j];
      const result = results[j];
      if (!result) continue;

      const row: Record<string, unknown> = {
        reddit_id: post.reddit_id,
        classified_by: "haiku",
      };

      if (result.charge_types?.length) {
        row.charge_type_slugs = result.charge_types.filter((s) =>
          refData.chargeTypeSlugs.includes(s)
        );
      }
      if (result.pain_points?.length) {
        row.pain_point_slugs = result.pain_points.filter((s) =>
          refData.painPointSlugs.includes(s)
        );
      }
      if (typeof result.urgency === "number") {
        row.urgency_score = Math.min(10, Math.max(0, result.urgency));
      }
      if (result.emotional_tone) {
        row.emotional_tone = result.emotional_tone;
      }

      upsertRows.push(row);
    }

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from("reddit_signals")
        .upsert(upsertRows, { onConflict: "reddit_id" });

      if (error) {
        console.warn(`[demand-classify]   Batch upsert error: ${error.message}`);
      } else {
        classified += upsertRows.length;
      }
    }
  }

  console.log(
    `[demand-classify] Classified ${classified}/${ambiguous.length} posts via Haiku`
  );

  return {
    ambiguous: ambiguous.length,
    classified,
    unclassified: unclassified.length,
    overClassified: overClassified.length,
    unclearUrgency: unclearUrgency.length,
  };
}
