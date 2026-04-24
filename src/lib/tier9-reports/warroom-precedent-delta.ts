/**
 * War Room $4,997 / Situation Room $9,997 per-case monthly precedent-delta
 * module (E3).
 *
 * Builds the per-case rising + falling precedent snapshot that the monthly
 * cron /api/cron/warroom-monthly-precedent-delta emails to each active War
 * Room customer. Narrower than M3 Precedent Watchlist ($47 charge-level) —
 * filtered to the specific case's chargeType + jurisdiction so the customer
 * sees only what matters for THEIR prosecution, not a national headline.
 *
 * Tier monotonicity (HARD):
 *   - Monthly cadence + per-case narrowing → exceeds M3 weekly charge-level
 *   - Steady-state citation activity → stays BELOW Situation Room $9,997
 *     trial-phase priority data (SR gets 72hr cadence + trial intel; WR gets
 *     monthly pre-trial precedent drift).
 *
 * UPL (HARD):
 *   - Phrasing: "citation velocity has shifted / risen / fallen" — never
 *     "you should cite X" or "we recommend".
 *   - Every row carries a CourtListener source_url; URL-less rows suppressed.
 *   - Banned phrases checked at test time: {@link UPL_BANNED_PHRASES}.
 *
 * Expert: Andre Chaperon email-sequence trust-engine — only send when the
 * picture actually changed. Over-notification erodes trust faster than
 * under-notification loses attention.
 *
 * Source: docs/plans/2026-04-23-data-to-product-autonomous-execution.md E3
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { RISING_JURISDICTION_FILTER, CHARGE_FILTER_MIN_ROWS } from "@/lib/derivations/constants";

// ============================================================
// Constants (exported for cron to pin)
// ============================================================

// Rank-delta threshold for "significant shift." Below this, plus no new
// entries in the top-N, the cron skips the send.
export const RANK_DELTA_THRESHOLD = 3;

// Top-N sizes the monthly snapshot fixes.
export const RISING_TOP_N = 10;
export const FALLING_TOP_N = 5;

// Candidate pool pulled from citation_velocity_criminal before charge-
// filtering. Matches sizing of rising-precedent-alerts (Sprint 6c).
const RISING_CANDIDATE_POOL = 30;
const FALLING_CANDIDATE_POOL = 20;

// Minimum count for the charge-filtered rising + falling sets before we
// prefer charge-filtered over national fallback.
const MIN_CHARGE_FILTERED_ROWS = CHARGE_FILTER_MIN_ROWS;

// Minimum days between monthly-cron sends on the same order. Set to 28 so
// a run on day-of-month N lands within +/- 2 days of day N next month and
// never double-fires when a month has 31 days.
export const MIN_CADENCE_DAYS = 28;

// ============================================================
// UPL blocklist — asserted in tests
// ============================================================

// Re-exported from canonical source — wave-pristine-r1 WARNING #3.
// `consult your attorney` is now part of the canonical 11-phrase list,
// so this re-export remains a superset-safe drop-in.
export { UPL_BANNED_PHRASES, scanForUplPhrases } from "@/lib/charge-slug-maps";

// ============================================================
// Types
// ============================================================

export interface SnapshotEntry {
  cited_opinion_id: number;
  velocity: number;
  rank: number;
}

export interface DeltaRow {
  cited_opinion_id: number;
  cluster_id: number | null;
  case_name: string;
  jurisdiction: string;
  date_filed: string | null;
  citation_count: number;
  velocity: number;
  velocity_tier: string;
  source_url: string;
  direction: "up" | "down";
  rank: number;
}

export interface PerCaseDeltaInput {
  chargeType: string | null;          // resolved from case intake
  state?: string | null;              // resolved from case intake (2-letter)
}

export interface PerCaseDeltaResult {
  chargeType: string | null;
  state: string | null;
  rising: DeltaRow[];
  falling: DeltaRow[];
  chargeFilterApplied: boolean;
  limitations: string[];
}

export interface ShiftReport {
  shouldSend: boolean;
  newEntries: SnapshotEntry[];
  shifts: Array<{ cited_opinion_id: number; oldRank: number; newRank: number }>;
  exits: SnapshotEntry[];              // in old snapshot but not in new
  isBaseline: boolean;                 // true if no prior snapshot existed
}

// ============================================================
// Query — per-case narrowing
// ============================================================

function escapeIlike(s: string): string {
  return s.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Resolve the set of cluster_ids mapped to a given chargeType via the
 * `charge_type_top_authorities` lookup. Empty set = no charge filter.
 */
async function getChargeClusterSet(
  supabase: ReturnType<typeof createAdminClient>,
  chargeType: string,
): Promise<Set<string>> {
  const chargeSlug = escapeIlike(chargeType);
  const { data } = await supabase
    .from("charge_type_top_authorities")
    .select("cluster_id")
    .ilike("charge_type", `${chargeSlug}%`)
    .limit(200);
  return new Set((data ?? []).map((r) => String(r.cluster_id)));
}

function mapRow(
  r: Record<string, unknown>,
  direction: "up" | "down",
  rank: number,
): DeltaRow | null {
  const src = (r.source_url as string | null) ?? "";
  if (!src) return null;
  return {
    cited_opinion_id: Number(r.cited_opinion_id),
    cluster_id: r.cluster_id != null ? Number(r.cluster_id) : null,
    case_name: String(r.case_name ?? ""),
    jurisdiction: String(r.jurisdiction ?? ""),
    date_filed: (r.date_filed as string | null) ?? null,
    citation_count: Number(r.citation_count ?? 0),
    velocity: Number(r.velocity ?? 0),
    velocity_tier: String(r.velocity_tier ?? ""),
    source_url: src,
    direction,
    rank,
  };
}

/**
 * Query rising + falling precedents narrowed to the case's charge type.
 *
 * Falls back to national top-N if fewer than {@link MIN_CHARGE_FILTERED_ROWS}
 * charge-filtered rows surface (with a limitation note). Stays jurisdiction-
 * bounded to appellate + supreme courts via {@link RISING_JURISDICTION_FILTER}
 * so civil-procedure citations don't dominate criminal-substantive results.
 */
export async function queryPerCaseDelta(
  input: PerCaseDeltaInput,
): Promise<PerCaseDeltaResult> {
  const supabase = createAdminClient();
  const limitations: string[] = [];
  const chargeType = input.chargeType;
  const state = (input.state ?? "").trim().toUpperCase() || null;

  // ---------- Rising pool ----------
  const { data: risingAll, error: risingErr } = await supabase
    .from("citation_velocity_criminal")
    .select(
      "cited_opinion_id, cluster_id, case_name, jurisdiction, date_filed, citation_count, velocity, velocity_tier, source_url",
    )
    .eq("rising_flag", true)
    .in("jurisdiction", [...RISING_JURISDICTION_FILTER])
    .order("velocity", { ascending: false })
    .limit(RISING_CANDIDATE_POOL);
  if (risingErr) {
    limitations.push("Rising-precedent query failed; rising set unavailable this cycle.");
  }

  // ---------- Falling pool ----------
  const { data: fallingAll, error: fallingErr } = await supabase
    .from("citation_velocity_criminal")
    .select(
      "cited_opinion_id, cluster_id, case_name, jurisdiction, date_filed, citation_count, velocity, velocity_tier, source_url",
    )
    .eq("velocity_tier", "fading")
    .in("jurisdiction", [...RISING_JURISDICTION_FILTER])
    .order("citation_count", { ascending: false })
    .limit(FALLING_CANDIDATE_POOL);
  if (fallingErr) {
    limitations.push("Falling-precedent query failed; falling set unavailable this cycle.");
  }

  // ---------- Charge-filter via charge_type_top_authorities ----------
  const chargeClusterSet = chargeType
    ? await getChargeClusterSet(supabase, chargeType)
    : new Set<string>();
  const hasChargeFilter = chargeClusterSet.size >= MIN_CHARGE_FILTERED_ROWS;

  function pickTopN(
    pool: Array<Record<string, unknown>>,
    count: number,
    direction: "up" | "down",
  ): { rows: DeltaRow[]; chargeFilterApplied: boolean } {
    // Drop rows without source_url (UPL HARD).
    const filtered: Array<Record<string, unknown>> = [];
    for (const r of pool) {
      const src = (r.source_url as string | null) ?? "";
      if (src.length > 0) filtered.push(r);
    }
    if (hasChargeFilter) {
      const byCharge = filtered.filter(
        (r) => r.cluster_id != null && chargeClusterSet.has(String(r.cluster_id)),
      );
      if (byCharge.length >= MIN_CHARGE_FILTERED_ROWS) {
        const rows: DeltaRow[] = [];
        for (const r of byCharge.slice(0, count)) {
          const row = mapRow(r, direction, rows.length + 1);
          if (row) rows.push(row);
        }
        return { rows, chargeFilterApplied: true };
      }
    }
    const rows: DeltaRow[] = [];
    for (const r of filtered.slice(0, count)) {
      const row = mapRow(r, direction, rows.length + 1);
      if (row) rows.push(row);
    }
    return { rows, chargeFilterApplied: false };
  }

  const risingResult = pickTopN(risingAll ?? [], RISING_TOP_N, "up");
  const fallingResult = pickTopN(fallingAll ?? [], FALLING_TOP_N, "down");

  const chargeFilterApplied =
    risingResult.chargeFilterApplied || fallingResult.chargeFilterApplied;

  if (!chargeFilterApplied && chargeClusterSet.size > 0) {
    limitations.push(
      `Fewer than ${MIN_CHARGE_FILTERED_ROWS} charge-specific precedents matched for "${chargeType}"; showing national top ${RISING_TOP_N} rising + top ${FALLING_TOP_N} fading across all criminal-defense opinions.`,
    );
  } else if (chargeType && chargeClusterSet.size === 0) {
    limitations.push(
      `No charge-specific authority cluster cached for "${chargeType}"; showing national criminal-defense top ${RISING_TOP_N} rising + top ${FALLING_TOP_N} fading.`,
    );
  }

  return {
    chargeType,
    state,
    rising: risingResult.rows,
    falling: fallingResult.rows,
    chargeFilterApplied,
    limitations,
  };
}

// ============================================================
// Snapshot helpers (stored in orders.warroom_precedent_delta_state)
// ============================================================

/**
 * Reduce a rising-set to a compact snapshot for storage in
 * `orders.warroom_precedent_delta_state.last_snapshot`. Cron diffs the next
 * run against this to decide whether to send.
 */
export function buildSnapshot(rising: DeltaRow[]): SnapshotEntry[] {
  return rising.map((r) => ({
    cited_opinion_id: r.cited_opinion_id,
    velocity: r.velocity,
    rank: r.rank,
  }));
}

/**
 * Compute the delta between the stored snapshot and the newly-computed one.
 *
 * Rules:
 *   - If no prior snapshot exists (first-ever run), return `isBaseline=true`
 *     and `shouldSend=true` so the customer gets a baseline email describing
 *     the current top-10 (with no deltas called out).
 *   - Otherwise, emit `shouldSend=true` when EITHER:
 *     * the new snapshot has an entry whose cited_opinion_id was not in the
 *       previous snapshot (new entry into top-N), OR
 *     * an entry in BOTH snapshots moved by >= RANK_DELTA_THRESHOLD.
 *   - `exits` lists entries dropped out of top-N entirely (informational).
 */
export function detectSignificantShift(
  oldSnap: SnapshotEntry[] | null | undefined,
  newSnap: SnapshotEntry[],
): ShiftReport {
  if (!oldSnap || oldSnap.length === 0) {
    return {
      shouldSend: true,
      newEntries: newSnap.slice(),
      shifts: [],
      exits: [],
      isBaseline: true,
    };
  }
  const oldByIdRank = new Map<number, number>();
  for (const e of oldSnap) oldByIdRank.set(e.cited_opinion_id, e.rank);
  const newIds = new Set<number>();
  for (const e of newSnap) newIds.add(e.cited_opinion_id);

  const newEntries: SnapshotEntry[] = [];
  const shifts: Array<{ cited_opinion_id: number; oldRank: number; newRank: number }> = [];
  for (const e of newSnap) {
    const oldRank = oldByIdRank.get(e.cited_opinion_id);
    if (oldRank === undefined) {
      newEntries.push(e);
    } else if (Math.abs(e.rank - oldRank) >= RANK_DELTA_THRESHOLD) {
      shifts.push({ cited_opinion_id: e.cited_opinion_id, oldRank, newRank: e.rank });
    }
  }
  const exits: SnapshotEntry[] = [];
  for (const e of oldSnap) {
    if (!newIds.has(e.cited_opinion_id)) exits.push(e);
  }
  const shouldSend = newEntries.length > 0 || shifts.length > 0;
  return { shouldSend, newEntries, shifts, exits, isBaseline: false };
}

// ============================================================
// Cadence check (exported for cron + tests)
// ============================================================

/**
 * Returns whether enough time has elapsed since the last send to consider
 * another monthly tick. `lastSentAt=null` = never sent = allow.
 */
export function cadenceAllowsSend(
  lastSentAt: string | null | undefined,
  nowMs: number = Date.now(),
  minDays: number = MIN_CADENCE_DAYS,
): boolean {
  if (!lastSentAt) return true;
  const last = Date.parse(lastSentAt);
  if (!Number.isFinite(last)) return true;
  return (nowMs - last) / 86_400_000 >= minDays;
}

// ============================================================
// Safe-URL guard (reused in cron — HARD UPL rule 13)
// ============================================================

export function isSafeHttpsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return /^https:\/\//i.test(url.trim());
}
