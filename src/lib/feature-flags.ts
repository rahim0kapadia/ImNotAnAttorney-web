/**
 * Feature flags, runtime gating for features.
 *
 * IMPORTANT: This is SEPARATE from tier.live which controls Stripe routing.
 * Feature flags control UI visibility and feature availability.
 * tier.live controls which Stripe keys process payments.
 * Never mix the two.
 */
import { createAdminClient } from "./supabase/admin";

const cache = new Map<string, { enabled: boolean; tierScope: string[] | null; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function isFeatureEnabled(flagKey: string, tier?: string): Promise<boolean> {
  const now = Date.now();
  const cached = cache.get(flagKey);

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    if (cached.tierScope) {
      if (!tier || !cached.tierScope.includes(tier)) return false;
    }
    return cached.enabled;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("is_enabled, tier_scope")
    .eq("flag_key", flagKey)
    .maybeSingle();

  if (error || !data) {
    cache.set(flagKey, { enabled: false, tierScope: null, fetchedAt: now });
    return false;
  }

  cache.set(flagKey, {
    enabled: data.is_enabled,
    tierScope: data.tier_scope,
    fetchedAt: now,
  });

  if (data.tier_scope) {
    if (!tier || !data.tier_scope.includes(tier)) return false;
  }
  return data.is_enabled;
}

export function clearFeatureFlagCache(): void {
  cache.clear();
}
