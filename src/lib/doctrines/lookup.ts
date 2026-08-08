/**
 * TICKET-10: Doctrine spotlight lookup helper.
 *
 * Surface used by Intelligence Brief, X-Ray, and Charge Authority Pack
 * render paths to fetch the top-N most-relevant doctrine quotes for a
 * given doctrine + state + (optional) charge.
 *
 * Anti-hallucination invariant: every row carries source_url + verbatim
 * quote_text from cl_opinion_bodies. Callers MUST display source_url
 * alongside the quote -- never paraphrase, never strip the URL.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DOCTRINE_BY_SLUG, type Doctrine } from './taxonomy';

export interface DoctrineSpotlight {
  id: number;
  doctrineSlug: string;
  doctrine: Doctrine | null;
  stateCode: string | null;
  jurisdiction: string | null;
  citationCount: number;
  relevanceScore: number;
  quoteText: string;
  sourceUrl: string;
  opinionId: string;
  clusterId: string;
}

interface DoctrineQuoteRow {
  id: number;
  doctrine_slug: string;
  state_code: string | null;
  jurisdiction: string | null;
  citation_count: number;
  relevance_score: number;
  quote_text: string;
  source_url: string;
  opinion_id: string;
  cluster_id: string;
}

function rowToSpotlight(r: DoctrineQuoteRow): DoctrineSpotlight {
  return {
    id: r.id,
    doctrineSlug: r.doctrine_slug,
    doctrine: DOCTRINE_BY_SLUG.get(r.doctrine_slug) ?? null,
    stateCode: r.state_code,
    jurisdiction: r.jurisdiction,
    citationCount: r.citation_count,
    relevanceScore: r.relevance_score,
    quoteText: r.quote_text,
    sourceUrl: r.source_url,
    opinionId: r.opinion_id,
    clusterId: r.cluster_id,
  };
}

/**
 * Fetch the top-N highest-relevance doctrine quotes for one doctrine in
 * one state. Used by the IB doctrine-spotlight section per case.
 *
 * Falls back to federal-only quotes (state_code IS NULL) when zero
 * state-scoped rows exist -- common in early ingest when only federal
 * appellate opinions have populated for the doctrine.
 *
 * @param supabase  service-role client
 * @param state     2-letter US state postal code (e.g. 'FL')
 * @param doctrineSlug  taxonomy slug from src/lib/doctrines/taxonomy
 * @param topN      max rows to return (default 3)
 */
export async function getDoctrineSpotlights(
  supabase: SupabaseClient,
  state: string,
  doctrineSlug: string,
  topN: number = 3,
): Promise<DoctrineSpotlight[]> {
  if (!state || state.length !== 2) return [];
  if (!DOCTRINE_BY_SLUG.has(doctrineSlug)) return [];

  // Try state-scoped first.
  const { data: stateScoped, error: e1 } = await supabase
    .from('doctrine_opinion_quotes')
    .select('id, doctrine_slug, state_code, jurisdiction, citation_count, relevance_score, quote_text, source_url, opinion_id, cluster_id')
    .eq('doctrine_slug', doctrineSlug)
    .eq('state_code', state.toUpperCase())
    .order('relevance_score', { ascending: false })
    .limit(topN);

  if (e1) {
    // Surface the underlying error to the caller so render paths can
    // fall back to "no spotlight available for this doctrine" copy
    // instead of crashing the whole IB render.
    throw new Error(`getDoctrineSpotlights[state=${state}] failed: ${e1.message}`);
  }
  if (stateScoped && stateScoped.length > 0) {
    return (stateScoped as DoctrineQuoteRow[]).map(rowToSpotlight);
  }

  // Fallback: federal opinions (state_code IS NULL) for this doctrine.
  const { data: fed, error: e2 } = await supabase
    .from('doctrine_opinion_quotes')
    .select('id, doctrine_slug, state_code, jurisdiction, citation_count, relevance_score, quote_text, source_url, opinion_id, cluster_id')
    .eq('doctrine_slug', doctrineSlug)
    .is('state_code', null)
    .order('relevance_score', { ascending: false })
    .limit(topN);

  if (e2) {
    throw new Error(`getDoctrineSpotlights[fed-fallback] failed: ${e2.message}`);
  }
  return ((fed as DoctrineQuoteRow[]) ?? []).map(rowToSpotlight);
}

/**
 * Multi-doctrine variant: fetch spotlights for an array of doctrine
 * slugs in one round trip. Returns a Map keyed by doctrine_slug.
 *
 * Used by IB to fan out across the doctrines relevant to a charge
 * (e.g. DUI -> reasonable-suspicion + probable-cause + miranda-warnings).
 */
export async function getDoctrineSpotlightsBatch(
  supabase: SupabaseClient,
  state: string,
  doctrineSlugs: string[],
  topN: number = 3,
): Promise<Map<string, DoctrineSpotlight[]>> {
  if (!state || state.length !== 2 || doctrineSlugs.length === 0) return new Map();
  const validSlugs = doctrineSlugs.filter((s) => DOCTRINE_BY_SLUG.has(s));
  if (validSlugs.length === 0) return new Map();

  // Pull rank-N per doctrine via a window function. Two queries cheaper
  // than N round trips.
  const { data, error } = await supabase
    .from('doctrine_opinion_quotes')
    .select('id, doctrine_slug, state_code, jurisdiction, citation_count, relevance_score, quote_text, source_url, opinion_id, cluster_id')
    .in('doctrine_slug', validSlugs)
    .eq('state_code', state.toUpperCase())
    .order('relevance_score', { ascending: false })
    // Over-fetch then trim per-doctrine in JS. PostgREST has no
    // PARTITION BY support, but the alternative (N parallel queries)
    // burns the rate limit. Cap at topN * doctrines * 2 for headroom.
    .limit(topN * validSlugs.length * 2);

  if (error) {
    throw new Error(`getDoctrineSpotlightsBatch failed: ${error.message}`);
  }

  const out = new Map<string, DoctrineSpotlight[]>();
  for (const slug of validSlugs) out.set(slug, []);
  for (const r of (data as DoctrineQuoteRow[]) ?? []) {
    const bucket = out.get(r.doctrine_slug);
    if (bucket && bucket.length < topN) {
      bucket.push(rowToSpotlight(r));
    }
  }
  return out;
}

/**
 * Coverage probe: how many quotes exist for a given doctrine + state?
 * Used by the render path to decide whether to surface the section
 * at all (zero-quote sections get hidden, not rendered as "no data").
 */
export async function countDoctrineQuotes(
  supabase: SupabaseClient,
  state: string,
  doctrineSlug: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('doctrine_opinion_quotes')
    .select('id', { count: 'exact', head: true })
    .eq('doctrine_slug', doctrineSlug)
    .eq('state_code', state.toUpperCase());
  if (error) return 0;
  return count ?? 0;
}
