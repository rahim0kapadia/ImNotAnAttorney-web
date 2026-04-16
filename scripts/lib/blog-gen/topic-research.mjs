import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// topic-research.mjs, Topic enrichment for the blog generation pipeline.
//
// Ported from ImNotAnAttorney-web/src/lib/blog-generation/topic-research.ts
// (2026-04-09 blog engine port).
//
// ONE intentional behavior change: the web version reads published MDX files
// from disk via getAllPosts() (@/lib/blog). The engine has no access to the
// web repo's content/blog/ directory, so this version queries Supabase for
// `blog_drafts WHERE status='published'` instead. publish.ts is the source of
// truth for that status transition (publish.ts:133 sets status='published'
// when the MDX is committed to GitHub). Same data, different source.
//
// Fetches Reddit signals, demand trends, and related published posts for a
// given content gap before generation.

/**
 * Enriches a content gap with real signal data from Reddit, demand scoring,
 * and existing published posts.
 *
 * @param {object} gap        - The content gap row selected for generation.
 * @param {object} supabase   - Admin Supabase client for DB access.
 * @returns {Promise<object>} - TopicEnrichment shape: {topQuestions, emotionalPatterns, painPoints, trendData, relatedPosts}
 */
export async function enrichTopic(gap, supabase) {
  // ── 1. Reddit signals ──────────────────────────────────────────────────────
  const { data: signals, error: signalsError } = await supabase
    .from("reddit_signals")
    .select("title, body_snippet, urgency_score, has_question, emotional_tone, pain_point_slugs")
    .contains("charge_type_slugs", [gap.charge_type_slug])
    .order("urgency_score", { ascending: false })
    .limit(10);

  if (signalsError) {
    console.warn("[enrichTopic] reddit_signals query failed:", signalsError.message);
  }

  const rows = signals ?? [];

  const topQuestions = rows
    .filter((r) => r.has_question && r.title)
    .map((r) => r.title)
    .slice(0, 5);

  const emotionalPatterns = Array.from(
    new Set(
      rows
        .map((r) => r.emotional_tone)
        .filter((t) => Boolean(t))
    )
  );

  const painPoints = Array.from(
    new Set(
      rows.flatMap((r) => {
        const slugs = r.pain_point_slugs;
        if (!slugs) return [];
        if (Array.isArray(slugs)) return slugs;
        return [];
      })
    )
  );

  // ── 2. Demand trend data ───────────────────────────────────────────────────
  const { data: demandRows, error: demandError } = await supabase
    .from("demand_scores")
    .select("demand_score, trend_pct, window_label")
    .eq("dimension_type", "charge_type")
    .eq("dimension_slug", gap.charge_type_slug)
    .order("scored_at", { ascending: false })
    .limit(1);

  if (demandError) {
    console.warn("[enrichTopic] demand_scores query failed:", demandError.message);
  }

  const trendData =
    demandRows && demandRows.length > 0
      ? {
          demand_score: demandRows[0].demand_score,
          trend_pct: demandRows[0].trend_pct,
          window: demandRows[0].window_label,
        }
      : null;

  // ── 3. Related published posts ─────────────────────────────────────────────
  // Web version uses getAllPosts() (filesystem MDX). Engine queries Supabase
  // for drafts that have been committed to GitHub (status='published').
  //
  // Two-step query: PostgREST .eq() on a joined table (content_gaps) does NOT
  // filter parent rows, it just nullifies the nested object. So we first
  // resolve content_gap IDs for this charge type, then fetch matching drafts.
  const { data: relatedGapRows, error: relatedGapErr } = await supabase
    .from("content_gaps")
    .select("id")
    .eq("charge_type_slug", gap.charge_type_slug);

  if (relatedGapErr) {
    console.warn("[enrichTopic] related gap IDs query failed:", relatedGapErr.message);
  }

  const relatedGapIds = (relatedGapRows ?? []).map((g) => g.id);

  const { data: publishedPosts, error: postsError } = relatedGapIds.length > 0
    ? await supabase
        .from("blog_drafts")
        .select("slug, title")
        .eq("status", "published")
        .in("content_gap_id", relatedGapIds)
        .order("published_at", { ascending: false })
        .limit(5)
    : { data: [], error: null };

  if (postsError) {
    console.warn("[enrichTopic] published posts query failed:", postsError.message);
  }

  const relatedPosts = (publishedPosts ?? []).map((p) => ({
    slug: p.slug,
    title: p.title,
  }));

  // ── 4. Hub article lookup (for spoke articles) ───────────────────────────
  // If this gap is a spoke (has a pain_point_slug), find the published hub
  // article for the same charge type so the spoke can link to it.
  // Two-step: article_type lives on content_gaps, not blog_drafts.
  let hubArticle = null;
  if (gap.pain_point_slug) {
    const { data: hubGap, error: hubGapErr } = await supabase
      .from("content_gaps")
      .select("id")
      .eq("charge_type_slug", gap.charge_type_slug)
      .eq("article_type", "hub")
      .maybeSingle();

    if (hubGapErr) {
      console.warn("[enrichTopic] hub gap query failed:", hubGapErr.message);
    }

    if (hubGap) {
      const { data: hubDraft, error: hubError } = await supabase
        .from("blog_drafts")
        .select("slug, title")
        .eq("content_gap_id", hubGap.id)
        .eq("status", "published")
        .maybeSingle();

      if (hubError) {
        console.warn("[enrichTopic] hub article query failed:", hubError.message);
      }

      if (hubDraft) {
        hubArticle = { slug: hubDraft.slug, title: hubDraft.title };
      }
    }
  }

  // ── 5. Spoke articles for hub (for hub articles) ──────────────────────────
  // If this gap is a hub, find published spokes for internal linking.
  // Two-step: article_type lives on content_gaps, not blog_drafts.
  let spokeArticles = [];
  if (!gap.pain_point_slug) {
    const { data: spokeGaps, error: spokeGapErr } = await supabase
      .from("content_gaps")
      .select("id")
      .eq("charge_type_slug", gap.charge_type_slug)
      .eq("article_type", "spoke")
      .neq("id", gap.id);

    if (spokeGapErr) {
      console.warn("[enrichTopic] spoke gaps query failed:", spokeGapErr.message);
    }

    const spokeGapIds = (spokeGaps ?? []).map((g) => g.id);

    if (spokeGapIds.length > 0) {
      const { data: spokeDrafts, error: spokeErr } = await supabase
        .from("blog_drafts")
        .select("slug, title")
        .eq("status", "published")
        .in("content_gap_id", spokeGapIds)
        .limit(10);

      if (!spokeErr && spokeDrafts) {
        spokeArticles = spokeDrafts.map((d) => ({ slug: d.slug, title: d.title }));
      }
    }
  }

  return {
    topQuestions,
    emotionalPatterns,
    painPoints,
    trendData,
    relatedPosts,
    hubArticle,
    spokeArticles,
  };
}

// ============================================================
// PILLAR RESOLUTION (Content Pillar Engine C2)
// ============================================================

const PILLAR_REGISTRY_PATH = process.env.PILLAR_REGISTRY_PATH
  || 'C:/Users/email/projects/ImNotAnAttorney/system/pillar-registry.json';

let _pillarRegistryCache = null;

function loadPillarRegistry() {
  if (_pillarRegistryCache) return _pillarRegistryCache;
  try {
    const raw = readFileSync(PILLAR_REGISTRY_PATH, 'utf-8');
    _pillarRegistryCache = JSON.parse(raw);
  } catch (err) {
    console.warn(`[topic-research] Failed to load pillar registry: ${String(err)}`);
    _pillarRegistryCache = { pillars: [] };
  }
  return _pillarRegistryCache;
}

const CHARGE_TYPE_DEFAULT_PILLAR = {
  'dui': 'dui-playbook',
  'dui-first': 'dui-playbook',
  'dui-repeat': 'dui-playbook',
  'drug-possession': 'drug-test-reliability',
  'drug-trafficking': 'drug-test-reliability',
  'assault': 'arrest-report-review',
  'domestic-violence': 'collateral-consequences',
  'theft': 'plea-analyzer',
  'white-collar': 'collateral-consequences',
  'sex-offense': 'collateral-consequences',
  'sex-offense-contact': 'collateral-consequences',
  'sex-offense-digital': 'collateral-consequences',
  'weapons': 'arrest-report-review',
  'federal': 'sentencing-intelligence',
  'probation-violation': 'plea-analyzer',
  'self-defense': 'arrest-report-review',
  'other': 'plea-analyzer',
};

/**
 * Resolves the best content pillar for a given charge type and topic.
 *
 * 3-pass resolution:
 *   1. Charge-type default from CHARGE_TYPE_DEFAULT_PILLAR
 *   2. Keyword scoring against pillar targetKeywords (wins if score >= 2 AND beats default)
 *   3. Fallback to 'plea-analyzer'
 *
 * @param {string} chargeTypeSlug
 * @param {string[]} keywords
 * @param {string} title
 * @returns {object|null} Full pillar entry from the registry
 */
export function resolvePillar(chargeTypeSlug, keywords = [], title = '') {
  const registry = loadPillarRegistry();
  const pillars = registry.pillars || [];

  if (pillars.length === 0) return null;

  const corpus = (keywords.join(' ') + ' ' + title).toLowerCase();

  // Pass 1: charge-type default
  const defaultSlug = CHARGE_TYPE_DEFAULT_PILLAR[chargeTypeSlug] || null;
  const defaultEntry = defaultSlug
    ? pillars.find((p) => p.slug === defaultSlug) || null
    : null;

  // Score helper: count how many targetKeywords appear in the corpus
  function scoreEntry(entry) {
    if (!entry || !entry.targetKeywords) return 0;
    let score = 0;
    for (const kw of entry.targetKeywords) {
      if (corpus.indexOf(kw.toLowerCase()) !== -1) {
        score++;
      }
    }
    return score;
  }

  // Pass 2: keyword scoring
  const defaultScore = scoreEntry(defaultEntry);
  let bestEntry = null;
  let bestScore = 0;

  for (const pillar of pillars) {
    const score = scoreEntry(pillar);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = pillar;
    }
  }

  if (bestScore >= 2 && bestScore > defaultScore) {
    return bestEntry;
  }

  if (defaultEntry) {
    return defaultEntry;
  }

  // Pass 3: fallback
  return pillars.find((p) => p.slug === 'plea-analyzer') || pillars[0] || null;
}

const TIER_ORDER = ['case-decoder', 'intelligence-brief', 'x-ray', 'war-room', 'situation-room'];

/**
 * Returns the lowest-priced tier slug from a pillar's linkedTiers array.
 * Order: case-decoder < intelligence-brief < x-ray < war-room < situation-room.
 *
 * @param {string[]} linkedTiers
 * @returns {string}
 */
export function getLowestTier(linkedTiers) {
  if (!linkedTiers || linkedTiers.length === 0) return 'case-decoder';

  for (const tier of TIER_ORDER) {
    if (linkedTiers.includes(tier)) return tier;
  }

  return 'case-decoder';
}
