/**
 * Tier 9 data-driven report generation, public API.
 *
 * These products query pre-computed Tier 9 database tables (43K+ rows)
 * instead of calling Claude. No AI cost per generation.
 *
 * Usage:
 *   import { generateTier9Report, isTier9Slug } from "@/lib/tier9-reports";
 */

export { generateTier9Report } from "./generate";
export { isTier9Slug, TIER9_SLUGS } from "./constants";
export {
  queryPrecedentWatchlist,
  renderPrecedentWatchlist,
  buildVelocitySnapshot,
  UPL_BANNED_PHRASES as PRECEDENT_WATCHLIST_UPL_BANNED_PHRASES,
  type PrecedentWatchlistInput,
  type PrecedentWatchlistData,
  type WatchlistRow,
} from "./precedent-watchlist";
