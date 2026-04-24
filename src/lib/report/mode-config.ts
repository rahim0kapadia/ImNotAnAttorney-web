/**
 * Per-tier generation-mode accessor.
 *
 * Reads the `tier_generation_config` table to determine which generation
 * path the dispatcher should take for a given tier (slug). A 60-second
 * in-memory TTL cache keeps hot lookups cheap; the dispatcher runs on
 * every inbound request, so one DB round-trip per cold entry is fine
 * but per-request would be wasteful.
 *
 * The table's PK column is `tier_slug` (NOT `tier` — an earlier orphan-
 * recovery doc had this wrong). Valid modes: 'api' | 'mechanical' |
 * 'session'. The `hybrid` (parallel Haiku-per-slot) mode was removed
 * 2026-04-24 per zero-hallucination mandate — Haiku is too small a
 * model to trust at a customer-facing legal-content layer. The
 * verified-opus replacement path (mechanical data pull with source_urls
 * → Opus writes voice around pre-verified facts → operator approves)
 * is queued for a separate rebuild.
 *
 * Fallback to 'session' on any read error, bad value, or thrown
 * exception. An earlier revision fell back to 'api' on the assumption
 * that the Edge Function was trusted baseline; the team has since
 * flipped that assumption. Session-mode pauses for operator review
 * rather than running the automated Edge Function when the config row
 * is inaccessible.
 *
 * Cache: bounded at MAX_CACHE_SIZE entries so an unexpected caller
 * passing arbitrary slugs cannot exhaust memory. FIFO eviction is
 * fine here because real callers pass a handful of literal strings.
 *
 * CONSUMERS (kept deliberately narrow so a surprise caller doesn't
 * slip into a generation path that doesn't respect the flag):
 *   - src/app/api/generate/case-decoder/route.ts
 *   - src/app/api/generate/intelligence-brief/route.ts
 * Adding this import to any other dispatcher requires reviewing the
 * session-mode + mechanical-mode branch semantics in
 * src/lib/report/dispatch-session.ts.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type TierGenerationMode = "api" | "mechanical" | "session";

/**
 * Compile-time enumeration of tier slugs the dispatcher layer understands.
 * Adding a new tier to this union is the contract change that forces
 * reviewers to extend the dispatcher's mode-branch logic.
 */
export type DispatcherTierSlug = "case-decoder" | "intelligence-brief";

const VALID_MODES: ReadonlySet<TierGenerationMode> = new Set([
  "api",
  "mechanical",
  "session",
]);

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_SIZE = 64;

interface CacheEntry {
  mode: TierGenerationMode;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Test-only. Clears the in-memory cache so unit tests don't leak state.
 */
export function __resetModeConfigCacheForTests(): void {
  cache.clear();
}

function isValidMode(v: unknown): v is TierGenerationMode {
  return typeof v === "string" && VALID_MODES.has(v as TierGenerationMode);
}

/**
 * Sanitize `tierSlug` for log interpolation. Prevents newline-injection
 * poisoning of log streams if a future caller accepts user input.
 */
function logSafeSlug(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function setCache(key: string, entry: CacheEntry): void {
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, entry);
}

export async function getTierGenerationMode(
  tierSlug: DispatcherTierSlug,
): Promise<TierGenerationMode> {
  const now = Date.now();
  const hit = cache.get(tierSlug);
  if (hit && hit.expiresAt > now) return hit.mode;

  const safe = logSafeSlug(tierSlug);

  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("tier_generation_config")
      .select("mode")
      .eq("tier_slug", tierSlug)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[mode-config] read error for tier=${safe}: ${error.message}; falling back to 'session'`,
      );
      setCache(tierSlug, { mode: "session", expiresAt: now + CACHE_TTL_MS });
      return "session";
    }
    // Unknown, null, or 'hybrid' (removed value still in DB) → fall back to
    // 'session' so we never silently run the removed Haiku path on a stale row.
    const mode = isValidMode(data?.mode) ? data!.mode : "session";
    setCache(tierSlug, { mode, expiresAt: now + CACHE_TTL_MS });
    return mode;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[mode-config] exception for tier=${safe}: ${err instanceof Error ? err.message : String(err)}; falling back to 'session'`,
    );
    setCache(tierSlug, { mode: "session", expiresAt: now + CACHE_TTL_MS });
    return "session";
  }
}
