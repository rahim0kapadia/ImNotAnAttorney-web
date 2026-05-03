/**
 * TICKET-12: parenthetical lookup helper.
 *
 * "What later judges said about this case." For every cited authority in
 * an X-Ray report (or JRC's Relevant Court Opinions section), surface the
 * top-N parentheticals from `v_parentheticals_for_case`.
 *
 * Anti-hallucination invariant (Architecture #13): every returned record
 * carries:
 *   - `describing_text` stored verbatim from cl_parentheticals.text
 *   - `source_url` = deterministic CL deep link to the describing opinion
 * Nothing in this module synthesizes, paraphrases, or rewrites text.
 *
 * Identity bridge: callers in app code typically hold an `entities_cases`
 * `canonical_id` (uuid). Use `getParentheticalsForCanonicalId` which
 * resolves canonical_id -> CL cluster_id via entity_sources first. Code
 * that already holds a cluster_id (e.g. JRC's classified_opinions row)
 * can call `getParentheticalsForClusterId` directly.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface Parenthetical {
  parenthetical_id: string;
  described_cluster_id: string;
  describing_text: string;
  describing_case_name: string | null;
  describing_case_name_short: string | null;
  describing_date_filed: string | null;
  describing_citation_count: number | null;
  source_url: string;
}

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

/**
 * Clamp limit to [1, MAX_LIMIT]. Defensive against caller-supplied 0,
 * negative, NaN, or unbounded values that could blow up PostgREST URLs.
 */
function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  if (limit < 1) return 1;
  if (limit > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(limit);
}

/**
 * Fetch top-N parentheticals for a CL cluster_id.
 * Returns [] on error or no matches — never throws.
 */
export async function getParentheticalsForClusterId(
  clusterId: string,
  limit: number = DEFAULT_LIMIT
): Promise<Parenthetical[]> {
  if (!clusterId || typeof clusterId !== "string") return [];
  const n = clampLimit(limit);
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("v_parentheticals_for_case")
      .select(
        "parenthetical_id, described_cluster_id, describing_text, describing_case_name, describing_case_name_short, describing_date_filed, describing_citation_count, source_url"
      )
      .eq("described_cluster_id", clusterId)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(n);
    if (error || !data) return [];
    return data as Parenthetical[];
  } catch {
    return [];
  }
}

/**
 * Fetch top-N parentheticals for an entities_cases canonical_id (uuid).
 * Resolves canonical_id -> CL cluster_id via entity_sources, then delegates
 * to getParentheticalsForClusterId.
 *
 * Returns [] when the case has no CourtListener provenance row OR the
 * cluster has no parentheticals OR any error.
 */
export async function getParentheticalsForCanonicalId(
  canonicalId: string,
  limit: number = DEFAULT_LIMIT
): Promise<Parenthetical[]> {
  if (!canonicalId || typeof canonicalId !== "string") return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("entity_sources")
      .select("source_ref")
      .eq("entity_id", canonicalId)
      .eq("entity_type", "case")
      .eq("source_system", "courtlistener")
      .limit(1);
    if (error || !data || data.length === 0) return [];
    const clusterId = data[0]?.source_ref;
    if (!clusterId) return [];
    return getParentheticalsForClusterId(clusterId, limit);
  } catch {
    return [];
  }
}

/**
 * Batch fetch — given N canonical_ids, return a Map<canonicalId, Parenthetical[]>.
 * Used by the cite-tag transformer (one report can have 50+ cases) to avoid
 * N+1 round trips. Single PostgREST round trip for the bridge, single round
 * trip for the parentheticals.
 */
export async function getParentheticalsForCanonicalIds(
  canonicalIds: string[],
  limitPerCase: number = DEFAULT_LIMIT
): Promise<Map<string, Parenthetical[]>> {
  const result = new Map<string, Parenthetical[]>();
  const ids = Array.from(
    new Set((canonicalIds ?? []).filter((s) => typeof s === "string" && s.length > 0))
  );
  if (ids.length === 0) return result;
  const n = clampLimit(limitPerCase);
  try {
    const supabase = createAdminClient();
    // Bridge: canonical_id -> cluster_id
    const { data: sources } = await supabase
      .from("entity_sources")
      .select("entity_id, source_ref")
      .in("entity_id", ids)
      .eq("entity_type", "case")
      .eq("source_system", "courtlistener");
    if (!sources || sources.length === 0) return result;
    const clusterToCanonical = new Map<string, string>();
    const clusterIds: string[] = [];
    for (const s of sources) {
      if (!s.source_ref || !s.entity_id) continue;
      clusterToCanonical.set(s.source_ref, s.entity_id);
      clusterIds.push(s.source_ref);
    }
    if (clusterIds.length === 0) return result;
    // Pull parentheticals for all clusters in one round trip, then bucket
    // client-side. We fetch n*K rows (K=clusterIds.length) so the per-case
    // top-N invariant holds after bucketing.
    const { data: rows } = await supabase
      .from("v_parentheticals_for_case")
      .select(
        "parenthetical_id, described_cluster_id, describing_text, describing_case_name, describing_case_name_short, describing_date_filed, describing_citation_count, source_url, relevance_score"
      )
      .in("described_cluster_id", clusterIds)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(n * clusterIds.length);
    if (!rows) return result;
    for (const row of rows as Array<Parenthetical & { relevance_score: number }>) {
      const cid = clusterToCanonical.get(row.described_cluster_id);
      if (!cid) continue;
      const arr = result.get(cid) ?? [];
      if (arr.length < n) {
        // Strip relevance_score from the public Parenthetical shape.
        const { relevance_score: _ignore, ...pub } = row;
        void _ignore;
        arr.push(pub);
        result.set(cid, arr);
      }
    }
    return result;
  } catch {
    return result;
  }
}
