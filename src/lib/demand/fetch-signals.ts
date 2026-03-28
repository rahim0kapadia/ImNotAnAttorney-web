/**
 * Reddit Signal Fetcher — core logic for fetching criminal defense posts.
 * Ported from scripts/demand/fetch-reddit-signals.mjs
 *
 * Accepts a Supabase admin client as a parameter so it can run inside
 * a Next.js API route without re-creating the client internally.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SEARCH_TERMS,
  SUBREDDIT_CHARGE_FILTER,
  classifyPost,
  type PainPoint,
  type PostClassification,
} from '@/lib/demand/classify-signal';

const USER_AGENT = 'ImNotAnAttorneyBot/1.0 (legal demand intelligence)';
const DELAY_MS = 1500;   // 1.5s between requests — well under Reddit's 60/min
const LIMIT = 25;        // posts per query (matches original default)
const TIME_WINDOW = 'week';

// ── Types ──────────────────────────────────────────────────

export interface SignalRow {
  reddit_id: string;
  subreddit: string;
  title: string;
  body_snippet: string | null;
  author: string | null;
  score: number;
  num_comments: number;
  post_url: string;
  permalink: string;
  reddit_created_at: string;
  search_query: string | null;
  fetched_at: string;
  // classification fields spread from PostClassification
  charge_type_slugs: string[];
  pain_point_slugs: string[];
  has_question: boolean;
  urgency_score: number;
  emotional_tone: string | null;
  geographic_mentions: string[];
  price_sensitivity: boolean;
  price_mentions: string[];
  classified_by: 'keyword';
}

export interface DemandResult {
  requestCount: number;
  totalPosts: number;
  withChargeTypes: number;
  withQuestions: number;
  highUrgency: number;
  priceSensitive: number;
  upsertedCount: number;
  discoveredCandidates: number;
}

interface RedditPost {
  name: string;
  subreddit: string;
  title: string;
  selftext?: string;
  author?: string;
  score?: number;
  num_comments?: number;
  permalink: string;
  created_utc: number;
}

// ── Helpers ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchReddit(url: string, retries = 3): Promise<unknown | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (res.status === 429 || res.status === 503) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`[demand-fetch] Rate limited (${res.status}), backing off ${backoff}ms…`);
        await sleep(backoff);
        continue;
      }

      if (!res.ok) {
        console.warn(`[demand-fetch] HTTP ${res.status} for ${url}`);
        return null;
      }

      return await res.json();
    } catch (err) {
      if (attempt === retries) {
        console.warn(`[demand-fetch] Fetch failed after ${retries} attempts: ${(err as Error).message}`);
        return null;
      }
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  return null;
}

// ── DB helpers ─────────────────────────────────────────────

async function loadSubreddits(supabase: SupabaseClient): Promise<string[]> {
  const { data: coreSubs, error } = await supabase
    .from('subreddits')
    .select('name');

  if (error) {
    throw new Error(`Error loading subreddits: ${error.message}`);
  }

  const { data: discovered } = await supabase
    .from('discovered_subreddits')
    .select('subreddit')
    .eq('status', 'approved');

  // Strip "r/" prefix (DB stores with prefix)
  const subs: string[] = (coreSubs || []).map((s: { name: string }) => s.name.replace(/^r\//, ''));

  if (discovered?.length) {
    for (const d of discovered as { subreddit: string }[]) {
      if (!subs.includes(d.subreddit)) {
        subs.push(d.subreddit);
      }
    }
  }

  return subs;
}

async function loadPainPoints(supabase: SupabaseClient): Promise<PainPoint[]> {
  const { data, error } = await supabase
    .from('content_pain_points')
    .select('blog_slug, target_keyword');

  if (error) {
    console.warn('[demand-fetch] Could not load pain points:', error.message);
    return [];
  }

  return (data || []).map((pp: { blog_slug: string; target_keyword: string }) => ({
    slug: pp.blog_slug,
    target_keyword: pp.target_keyword,
  }));
}

// ── Charge type helpers ────────────────────────────────────

function getChargeTypesForSub(sub: string): string[] {
  const filter = SUBREDDIT_CHARGE_FILTER[sub];
  if (filter === null || filter === undefined) {
    return Object.keys(SEARCH_TERMS);
  }
  return filter;
}

// ── Reddit fetch helpers ───────────────────────────────────

async function fetchSearch(sub: string, query: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&restrict_sr=true&limit=${LIMIT}&sort=new&t=${TIME_WINDOW}`;
  const data = fetchReddit(url);
  const json = await data as { data?: { children?: { data: RedditPost }[] } } | null;
  if (!json?.data?.children) return [];
  return json.data.children.map(c => c.data);
}

async function fetchListing(sub: string, sort: 'hot' | 'new' = 'hot'): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${sub}/${sort}.json?limit=${LIMIT}&t=${TIME_WINDOW}`;
  const json = await fetchReddit(url) as { data?: { children?: { data: RedditPost }[] } } | null;
  if (!json?.data?.children) return [];
  return json.data.children.map(c => c.data);
}

// ── Row builder ────────────────────────────────────────────

function toSignalRow(
  post: RedditPost,
  searchQuery: string | null,
  classification: PostClassification
): SignalRow {
  return {
    reddit_id: post.name,
    subreddit: post.subreddit,
    title: post.title,
    body_snippet: (post.selftext || '').slice(0, 1000) || null,
    author: post.author || null,
    score: post.score || 0,
    num_comments: post.num_comments || 0,
    post_url: `https://www.reddit.com${post.permalink}`,
    permalink: post.permalink,
    reddit_created_at: new Date(post.created_utc * 1000).toISOString(),
    search_query: searchQuery || null,
    fetched_at: new Date().toISOString(),
    ...classification,
  };
}

// ── Subreddit discovery ────────────────────────────────────

async function discoverSubreddits(supabase: SupabaseClient): Promise<number> {
  // Only run discovery when a charge type has demand_score >= 8 (7-day window)
  const { data: hotTypes } = await supabase
    .from('demand_scores')
    .select('dimension_slug')
    .eq('dimension_type', 'charge_type')
    .eq('window_label', '7d')
    .gte('demand_score', 8);

  if (!hotTypes?.length) {
    console.log('[demand-fetch] No hot charge types for subreddit discovery');
    return 0;
  }

  const chargeTypesToSearch = hotTypes.map((t: { dimension_slug: string }) => t.dimension_slug);

  // Load existing known subreddits to avoid duplicates
  const { data: existing } = await supabase.from('subreddits').select('name');
  const { data: discovered } = await supabase.from('discovered_subreddits').select('subreddit');

  const known = new Set<string>([
    ...(existing || []).map((s: { name: string }) => s.name.replace(/^r\//, '').toLowerCase()),
    ...(discovered || []).map((s: { subreddit: string }) => s.subreddit.toLowerCase()),
  ]);

  const candidates: {
    subreddit: string;
    display_name: string;
    subscribers: number;
    description: string | null;
    discovered_via_charge_type: string;
    relevance_score: number;
    status: string;
    last_checked_at: string;
  }[] = [];

  for (const slug of chargeTypesToSearch) {
    const terms = SEARCH_TERMS[slug] || [];
    const query = terms[0];
    if (!query) continue;

    const url = `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(query)}&limit=10`;
    const json = await fetchReddit(url) as {
      data?: { children?: { data: {
        display_name?: string;
        subscribers?: number;
        over18?: boolean;
        public_description?: string;
      } }[] }
    } | null;
    await sleep(DELAY_MS);

    if (!json?.data?.children) continue;

    for (const child of json.data.children) {
      const sub = child.data;
      const name = (sub.display_name || '').toLowerCase();

      if (known.has(name)) continue;
      if ((sub.subscribers || 0) < 1000) continue;
      if (sub.over18 && !name.includes('legal')) continue;

      candidates.push({
        subreddit: name,
        display_name: sub.display_name || name,
        subscribers: sub.subscribers || 0,
        description: (sub.public_description || '').slice(0, 500) || null,
        discovered_via_charge_type: slug,
        relevance_score: Math.min(10, Math.round(Math.log10(sub.subscribers || 1) * 2)),
        status: 'candidate',
        last_checked_at: new Date().toISOString(),
      });
      known.add(name);
    }
  }

  if (!candidates.length) return 0;

  const { error } = await supabase
    .from('discovered_subreddits')
    .upsert(candidates, { onConflict: 'subreddit' });

  if (error) {
    console.error('[demand-fetch] Error saving discovered subreddits:', error.message);
    return 0;
  }

  return candidates.length;
}

// ── Main export ────────────────────────────────────────────

/**
 * Fetch Reddit signals and upsert them to the reddit_signals table.
 *
 * @param supabase - Admin Supabase client (service role)
 * @returns Summary stats for the cron route response
 */
export async function fetchRedditSignals(supabase: SupabaseClient): Promise<DemandResult> {
  const painPoints = await loadPainPoints(supabase);
  const subs = await loadSubreddits(supabase);

  const allPosts = new Map<string, SignalRow>(); // reddit_id → row (dedup)
  let requestCount = 0;

  for (const sub of subs) {
    const chargeGroups = getChargeTypesForSub(sub);

    // Search by charge type terms (first 2 terms per group to limit requests)
    for (const slug of chargeGroups) {
      const terms = SEARCH_TERMS[slug];
      if (!terms?.length) continue;

      for (const term of terms.slice(0, 2)) {
        const posts = await fetchSearch(sub, term);
        requestCount++;

        for (const post of posts) {
          if (allPosts.has(post.name)) continue;
          const classification = classifyPost(post, painPoints);
          allPosts.set(post.name, toSignalRow(post, term, classification));
        }

        await sleep(DELAY_MS);
      }
    }

    // Also fetch hot and new listings (general, no query)
    for (const sort of ['hot', 'new'] as const) {
      const posts = await fetchListing(sub, sort);
      requestCount++;

      for (const post of posts) {
        if (allPosts.has(post.name)) continue;
        const classification = classifyPost(post, painPoints);
        allPosts.set(post.name, toSignalRow(post, null, classification));
      }

      await sleep(DELAY_MS);
    }
  }

  const rows = [...allPosts.values()];

  // Upsert to DB in batches of 50
  let upsertedCount = 0;

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { data, error } = await supabase
      .from('reddit_signals')
      .upsert(batch, { onConflict: 'reddit_id' })
      .select('reddit_id');

    if (error) {
      console.error(`[demand-fetch] Error upserting batch ${Math.floor(i / 50) + 1}:`, error.message);
      continue;
    }
    upsertedCount += data?.length || 0;
  }

  // Weekly subreddit discovery (Sundays only)
  let discoveredCandidates = 0;
  const dayOfWeek = new Date().getDay(); // 0 = Sunday
  if (dayOfWeek === 0) {
    discoveredCandidates = await discoverSubreddits(supabase);
  }

  return {
    requestCount,
    totalPosts: rows.length,
    withChargeTypes: rows.filter(r => r.charge_type_slugs?.length > 0).length,
    withQuestions: rows.filter(r => r.has_question).length,
    highUrgency: rows.filter(r => r.urgency_score >= 7).length,
    priceSensitive: rows.filter(r => r.price_sensitivity).length,
    upsertedCount,
    discoveredCandidates,
  };
}
