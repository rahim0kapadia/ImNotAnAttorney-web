/**
 * Per-tier generation-mode accessor.
 *
 * Reads the `tier_generation_config` table to determine which generation
 * path the dispatcher should take for a given tier (slug). A 60-second
 * in-memory TTL cache keeps hot lookups cheap; the dispatcher runs on
 * every inbound CD request, so one DB round-trip per cold entry is fine
 * but per-request would be wasteful.
 *
 * The table's PK column is `tier_slug` (NOT `tier` — an earlier orphan-
 * recovery doc had this wrong). Valid modes: 'api' | 'mechanical' |
 * 'hybrid' | 'session'. Fallback to 'api' on any read error so a DB
 * hiccup never silently flips behavior away from the Edge Function path.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type TierGenerationMode = "api" | "mechanical" | "hybrid" | "session";

const VALID_MODES: ReadonlySet<TierGenerationMode> = new Set([
  "api",
  "mechanical",
  "hybrid",
  "session",
]);

const CACHE_TTL_MS = 60_000;

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

export async function getTierGenerationMode(
  tierSlug: string,
): Promise<TierGenerationMode> {
  const now = Date.now();
  const hit = cache.get(tierSlug);
  if (hit && hit.expiresAt > now) return hit.mode;

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
        `[mode-config] read error for tier=${tierSlug}: ${error.message}; falling back to 'api'`,
      );
      cache.set(tierSlug, { mode: "api", expiresAt: now + CACHE_TTL_MS });
      return "api";
    }
    const mode = isValidMode(data?.mode) ? data!.mode : "api";
    cache.set(tierSlug, { mode, expiresAt: now + CACHE_TTL_MS });
    return mode;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[mode-config] exception for tier=${tierSlug}: ${err instanceof Error ? err.message : String(err)}; falling back to 'api'`,
    );
    cache.set(tierSlug, { mode: "api", expiresAt: now + CACHE_TTL_MS });
    return "api";
  }
}
