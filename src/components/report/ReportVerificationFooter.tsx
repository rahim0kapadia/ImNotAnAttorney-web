/**
 * Report Verification Footer — appears below every CD / IB / X-Ray / War Room report.
 *
 * Renders the source-transparency trust signal that's landed in the DB since
 * 2026-04-21 (unbounded confidence scoring, 6-tier ladder, source_system_weights).
 *
 * This is REPORT-LEVEL (not per-citation). The per-citation badge wiring is a
 * larger Phase 2 change that requires the AI generator to emit structured
 * citations. This footer ships the trust signal without touching generation.
 *
 * UPL-safe: reports source systems only; makes no legal claims.
 */
import { createAdminClient } from "@/lib/supabase/admin";

interface Weight {
  source_system: string;
  weight: number;
  tier: "primary" | "curated" | "community";
  notes: string | null;
}

const SYSTEM_LABEL: Record<string, string> = {
  courtlistener: "CourtListener (federal + state opinions)",
  cl_disclosure: "CourtListener financial disclosures (judge holdings)",
  fjc: "Federal Judicial Center",
  ussc: "U.S. Sentencing Commission (690K federal sentences)",
  sec_edgar: "SEC EDGAR",
  official_website: "Agency official websites",
  walkerdb: "walkerdb SCOTUS oral-argument transcripts (1.8M turns)",
  oyez: "Oyez (Cornell/Chicago-Kent curated SCOTUS)",
  justia: "Justia",
  cornell_lii: "Cornell LII",
  wikidata: "Wikidata",
  wikipedia: "Wikipedia",
  ballotpedia: "Ballotpedia",
};

export default async function ReportVerificationFooter() {
  const supabase = createAdminClient();

  // Live source-system weights + live confidence-tier counts. The
  // v_entity_confidence materialized view (2026-04-22) makes per-tier
  // head-count lookups fast via idx_v_entity_confidence_confidence_level
  // (<10ms each). The plain view that preceded it timed out at 2 min, so
  // the footer had to defer counts.
  //
  // Round-2 finding F6: sum the constituent DB tiers for each UI bucket
  // exactly, not with a "close proxy". DB has 6 tiers; UI has 3 buckets
  // (round-1 L1, round-2 L7+W1 renamed to basic / cross-verified / top-tier).
  // Mapping:
  //   basic          ← standard + medium  (1-2 sources)
  //   cross-verified ← high + verified    (3-4 sources)
  //   top-tier       ← gold + platinum    (5+ sources)
  // Every UI count sums its constituent DB tiers exactly so the label and
  // the number always agree.
  const tierHeadCount = (level: string) =>
    supabase
      .from("v_entity_confidence")
      .select("entity_id", { count: "exact", head: true })
      .eq("confidence_level", level);

  const [
    weightsRes,
    platRes,
    goldRes,
    verifiedRes,
    highRes,
    mediumRes,
    standardRes,
  ] = await Promise.all([
    supabase
      .from("source_system_weights")
      .select("source_system, weight, tier, notes")
      .order("weight", { ascending: false })
      .order("source_system"),
    tierHeadCount("platinum"),
    tierHeadCount("gold"),
    tierHeadCount("verified"),
    tierHeadCount("high"),
    tierHeadCount("medium"),
    tierHeadCount("standard"),
  ]);

  const weights = (weightsRes.data ?? []) as Weight[];
  if (weights.length === 0) return null;

  const primary = weights.filter((w) => w.tier === "primary");
  const curated = weights.filter((w) => w.tier === "curated");
  const community = weights.filter((w) => w.tier === "community");

  const platinumCount = platRes.count ?? 0;
  const goldCount = goldRes.count ?? 0;
  const verifiedCount = verifiedRes.count ?? 0;
  const highCount = highRes.count ?? 0;
  const mediumCount = mediumRes.count ?? 0;
  const standardCount = standardRes.count ?? 0;
  const hasLiveCounts =
    platinumCount +
      goldCount +
      verifiedCount +
      highCount +
      mediumCount +
      standardCount >
    0;

  const renderSystem = (w: Weight) => (
    <li key={w.source_system} className="flex items-baseline gap-2">
      <span className="font-mono text-xs text-amber-400/80">{w.weight.toFixed(1)}</span>
      <span>{SYSTEM_LABEL[w.source_system] ?? w.source_system}</span>
    </li>
  );

  // Round-2 finding F6: sum the constituent DB tiers exactly — no proxies.
  // UI buckets mirror badge-transform.toUITier() (round-2 L7+W1 rename):
  //   basic          ← standard + medium    (1-2 sources)
  //   cross-verified ← high + verified      (3-4 sources)
  //   top-tier       ← gold + platinum      (5+ sources)
  const uiTopTierCount = platinumCount + goldCount;
  const uiCrossVerifiedCount = verifiedCount + highCount;
  const uiBasicCount = standardCount + mediumCount;

  return (
    <aside
      // Round-1 finding L3: REMOVED `print-hidden` — attorneys print reports
      // and need to see source methodology / UPL disclaimer on paper.
      className="mt-12 rounded-lg border border-zinc-800 bg-zinc-950/40 p-6 text-sm text-zinc-300"
      aria-label="Source verification methodology"
    >
      <h2 className="mb-3 text-base font-semibold text-amber-400">
        Source Verification
      </h2>
      <p className="mb-4 text-zinc-400">
        Every factual claim about cases, judges, statutes, and agencies in this
        report traces back to public primary or curated sources. Entities are
        cross-verified across multiple independent systems below; each tier of
        verification compounds (a source that appears on 5+ systems carries
        the highest <em>top-tier</em> confidence).
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {primary.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-400/70">
              Primary sources (govt + authoritative)
            </h3>
            <ul className="space-y-1 text-xs">{primary.map(renderSystem)}</ul>
          </div>
        )}
        {curated.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-400/70">
              Curated legal sources
            </h3>
            <ul className="space-y-1 text-xs">{curated.map(renderSystem)}</ul>
          </div>
        )}
        {community.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-400/70">
              Community references
            </h3>
            <ul className="space-y-1 text-xs">{community.map(renderSystem)}</ul>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Confidence is shown in three customer-facing tiers:{" "}
        <strong className="text-zinc-400">basic</strong> (1&ndash;2 sources) &middot;{" "}
        <strong className="text-amber-300">cross-verified</strong> (3&ndash;4 sources) &middot;{" "}
        <strong className="text-yellow-200">top-tier</strong> (5+ sources).
        {hasLiveCounts && (
          <>
            {" "}
            Currently{" "}
            <strong className="text-amber-400/80">
              {uiTopTierCount.toLocaleString()}
            </strong>{" "}
            top-tier,{" "}
            <strong className="text-amber-400/80">
              {uiCrossVerifiedCount.toLocaleString()}
            </strong>{" "}
            cross-verified, and{" "}
            <strong className="text-amber-400/80">
              {uiBasicCount.toLocaleString()}
            </strong>{" "}
            basic entities in the database.
          </>
        )}
      </p>

      {/* L6: UPL disclaimer promoted to its own line, distinct from
          methodology prose, so it reads as a standalone legal-safety
          statement rather than a trailing hedge. */}
      <p className="mt-3 text-sm font-medium text-zinc-400">
        This report provides legal INFORMATION; it does not provide legal advice.
      </p>
    </aside>
  );
}
