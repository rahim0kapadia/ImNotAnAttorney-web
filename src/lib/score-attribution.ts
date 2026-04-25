/**
 * @fileoverview /score attribution classification.
 *
 * Maps incoming utm_source values + referrer hosts onto the bounded
 * `attribution_source` enum used by score_completions. Pure functions
 * for unit-test friendliness.
 *
 * The CHECK constraint in supabase/migrations/20260426a_tt_checkpoint_tracking.sql
 * enforces the same allowlist at the DB boundary; this lib short-circuits
 * insert errors by returning a known-good value or NULL.
 */

export type AttributionSource =
  | "youtube"
  | "x"
  | "twitter_x"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "reddit"
  | "quora"
  | "google"
  | "bing"
  | "organic"
  | "direct"
  | "other";

export const ALLOWED_ATTRIBUTION_SOURCES: ReadonlyArray<AttributionSource> = [
  "youtube",
  "x",
  "twitter_x",
  "tiktok",
  "instagram",
  "facebook",
  "reddit",
  "quora",
  "google",
  "bing",
  "organic",
  "direct",
  "other",
] as const;

const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_ATTRIBUTION_SOURCES);

/**
 * Map a referrer hostname onto an attribution_source bucket.
 *
 * Hostname-only mapping; full URL would leak path PII. Uses suffix
 * matching so subdomains (m.youtube.com, www.tiktok.com) classify
 * correctly. Unknown hosts return "other"; missing host returns NULL.
 */
export function classifyReferrerHost(host: string | null): AttributionSource | null {
  if (!host) return null;
  const h = host.toLowerCase();
  if (/(?:^|\.)youtube\.com$/.test(h) || h === "youtu.be") return "youtube";
  if (/(?:^|\.)twitter\.com$/.test(h) || h === "t.co" || /(?:^|\.)x\.com$/.test(h)) return "x";
  if (/(?:^|\.)tiktok\.com$/.test(h)) return "tiktok";
  if (/(?:^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(?:^|\.)facebook\.com$/.test(h) || /(?:^|\.)fb\.com$/.test(h) || /(?:^|\.)fb\.me$/.test(h)) return "facebook";
  if (/(?:^|\.)reddit\.com$/.test(h) || /(?:^|\.)redd\.it$/.test(h)) return "reddit";
  if (/(?:^|\.)quora\.com$/.test(h)) return "quora";
  if (/(?:^|\.)google\.[a-z.]+$/.test(h)) return "google";
  if (/(?:^|\.)bing\.com$/.test(h)) return "bing";
  return "other";
}

/**
 * Normalize a `utm_source` query-param value onto our enum.
 *
 * `youtube` / `yt` / `youtube_shorts` all map to "youtube"; `x` / `twitter`
 * map to "x". Defensive: only return values inside the allowed set.
 */
export function classifyUtmSource(utmSource: string | null): AttributionSource | null {
  if (!utmSource) return null;
  const v = utmSource.trim().toLowerCase().replace(/-/g, "_");
  if (v === "yt" || v === "youtube" || v === "youtube_shorts" || v === "shorts") return "youtube";
  if (v === "x" || v === "twitter" || v === "twitter_x" || v === "twit") return "x";
  if (v === "tt" || v === "tiktok") return "tiktok";
  if (v === "ig" || v === "instagram") return "instagram";
  if (v === "fb" || v === "facebook" || v === "meta") return "facebook";
  if (v === "reddit") return "reddit";
  if (v === "quora") return "quora";
  if (v === "google") return "google";
  if (v === "bing") return "bing";
  if (v === "organic") return "organic";
  if (v === "direct") return "direct";
  if (ALLOWED_SET.has(v)) return v as AttributionSource;
  return "other";
}

/**
 * Pick the most authoritative attribution source.
 *
 * Priority: explicit body.attributionSource (frontend-provided,
 * post-validation) > utm_source > referrer host. Returns NULL only when
 * none of the three carry a usable signal — caller stores NULL in
 * score_completions.attribution_source which is allowed by the schema.
 */
export function classifyAttributionSource(opts: {
  bodyAttributionSource: string | null;
  bodyUtmSource: string | null;
  referrerHost: string | null;
}): AttributionSource | null {
  const explicit = opts.bodyAttributionSource
    ? classifyUtmSource(opts.bodyAttributionSource)
    : null;
  if (explicit) return explicit;
  const utm = opts.bodyUtmSource ? classifyUtmSource(opts.bodyUtmSource) : null;
  if (utm) return utm;
  return classifyReferrerHost(opts.referrerHost);
}

/**
 * Extract the bare host from a Referer header value. Strips port,
 * userinfo, and path. Returns NULL if header is empty or malformed.
 *
 * `URL` parsing is wrapped in try/catch because Referer can include
 * any string the browser feels like sending.
 */
export function parseReferrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    if (!u.hostname) return null;
    if (u.hostname.length > 253) return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}
