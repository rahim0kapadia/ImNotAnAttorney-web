/**
 * Compute Pattern Tables — defense_theory_outcomes + motion_success_patterns
 *
 * Aggregates from classified_opinions using the join paths from spec Section 6.1.1.
 * Weights opinions by opinion_type: full=1.0, memo=0.8, order=0.5, pca=0.3.
 * NULL outcomes excluded from aggregation (spec Section 6.1.1).
 *
 * Usage:
 *   node scripts/compute-pattern-tables.mjs              # Dry-run
 *   node scripts/compute-pattern-tables.mjs --apply      # Write to DB
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, end } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");

async function main() {
  console.log("=".repeat(60));
  console.log("COMPUTE PATTERN TABLES");
  console.log("Mode: " + (applyMode ? "APPLY" : "DRY-RUN"));
  console.log("=".repeat(60));

  // ── 1. Compute defense_theory_outcomes ──────────────────────────────────
  console.log("\n--- defense_theory_outcomes ---");

  const theorySQL = `
    DELETE FROM defense_theory_outcomes;

    INSERT INTO defense_theory_outcomes (
      charge_slug, defense_theory, jurisdiction,
      attempts, successes, motion_success_rate, case_success_rate,
      best_combined_motion, sample_source_urls, computed_at
    )
    WITH opinion_weights AS (
      SELECT cluster_id,
        CASE opinion_type
          WHEN 'full' THEN 1.0
          WHEN 'memorandum' THEN 0.8
          WHEN 'order' THEN 0.5
          WHEN 'pca' THEN 0.3
          ELSE 1.0
        END AS weight,
        jurisdiction, charge_types, defense_theories,
        motion_outcomes, case_favorability, source_urls
      FROM classified_opinions
      WHERE classification_confidence IN ('verified', 'low_confidence')
    ),
    expanded AS (
      SELECT
        ow.cluster_id, ow.weight, ow.jurisdiction,
        ct.charge_slug, dt.defense_theory,
        ow.motion_outcomes, ow.case_favorability,
        ow.source_urls
      FROM opinion_weights ow,
        unnest(ow.charge_types) AS ct(charge_slug),
        unnest(ow.defense_theories) AS dt(defense_theory)
    ),
    theory_outcomes AS (
      SELECT
        e.charge_slug, e.defense_theory, e.jurisdiction, e.weight,
        e.case_favorability, e.source_urls,
        (SELECT bool_or(
          (mo->>'outcome') = 'granted' OR (mo->>'outcome') = 'reversed' OR (mo->>'outcome') = 'dismissed'
        )
        FROM jsonb_array_elements(e.motion_outcomes) AS mo
        WHERE EXISTS (
          SELECT 1 FROM charge_defense_theories cdt
          WHERE cdt.charge_slug = e.charge_slug
            AND cdt.theory_name = e.defense_theory
            AND (mo->>'motion_type') = ANY(cdt.motion_types)
        )
        ) AS motion_successful,
        (e.case_favorability >= 50) AS case_successful
      FROM expanded e
      WHERE e.motion_outcomes IS NOT NULL
    )
    SELECT
      to2.charge_slug,
      to2.defense_theory,
      to2.jurisdiction,
      count(*)::int AS attempts,
      count(*) FILTER (WHERE to2.motion_successful = true)::int AS successes,
      CASE WHEN count(*) > 0
        THEN round(count(*) FILTER (WHERE to2.motion_successful = true)::numeric / count(*)::numeric, 4)
        ELSE NULL
      END AS motion_success_rate,
      CASE WHEN count(*) FILTER (WHERE to2.case_successful IS NOT NULL) > 0
        THEN round(count(*) FILTER (WHERE to2.case_successful = true)::numeric /
          NULLIF(count(*) FILTER (WHERE to2.case_successful IS NOT NULL)::numeric, 0), 4)
        ELSE NULL
      END AS case_success_rate,
      NULL AS best_combined_motion,
      (array_agg(to2.source_urls[1]) FILTER (WHERE to2.source_urls[1] IS NOT NULL))[1:5] AS sample_source_urls,
      now() AS computed_at
    FROM theory_outcomes to2
    GROUP BY to2.charge_slug, to2.defense_theory, to2.jurisdiction
    HAVING count(*) >= 1;
  `;

  // ── 2. Compute motion_success_patterns ─────────────────────────────────
  console.log("\n--- motion_success_patterns ---");

  const motionSQL = `
    DELETE FROM motion_success_patterns;

    INSERT INTO motion_success_patterns (
      motion_type, charge_slug, jurisdiction, judge_id,
      filed_count, granted_count, denied_count, grant_rate,
      most_cited_opinion_id, sample_source_urls, computed_at
    )
    WITH opinion_weights AS (
      SELECT cluster_id,
        CASE opinion_type
          WHEN 'full' THEN 1.0
          WHEN 'memorandum' THEN 0.8
          WHEN 'order' THEN 0.5
          WHEN 'pca' THEN 0.3
          ELSE 1.0
        END AS weight,
        jurisdiction, charge_types, motion_types, motion_outcomes, source_urls
      FROM classified_opinions
      WHERE classification_confidence IN ('verified', 'low_confidence')
        AND motion_outcomes IS NOT NULL
    ),
    expanded AS (
      SELECT
        ow.cluster_id, ow.weight, ow.jurisdiction,
        ct.charge_slug,
        mo.motion_type,
        mo.outcome,
        ow.source_urls
      FROM opinion_weights ow,
        unnest(ow.charge_types) AS ct(charge_slug),
        jsonb_to_recordset(ow.motion_outcomes) AS mo(motion_type text, outcome text)
      WHERE mo.outcome IS NOT NULL
    )
    SELECT
      e.motion_type,
      e.charge_slug,
      e.jurisdiction,
      NULL::uuid AS judge_id,
      count(*)::int AS filed_count,
      count(*) FILTER (WHERE e.outcome IN ('granted', 'reversed', 'dismissed'))::int AS granted_count,
      count(*) FILTER (WHERE e.outcome IN ('denied', 'affirmed'))::int AS denied_count,
      CASE WHEN count(*) > 0
        THEN round(count(*) FILTER (WHERE e.outcome IN ('granted', 'reversed', 'dismissed'))::numeric / count(*)::numeric, 4)
        ELSE NULL
      END AS grant_rate,
      (array_agg(e.cluster_id) FILTER (WHERE e.outcome IN ('granted', 'reversed', 'dismissed')))[1] AS most_cited_opinion_id,
      (array_agg(e.source_urls[1]) FILTER (WHERE e.source_urls[1] IS NOT NULL))[1:5] AS sample_source_urls,
      now() AS computed_at
    FROM expanded e
    GROUP BY e.motion_type, e.charge_slug, e.jurisdiction
    HAVING count(*) >= 1;
  `;

  const fullSQL = theorySQL + "\n\n" + motionSQL;

  // Save SQL
  const sqlPath = path.join(PROJECT_ROOT, "data", "defense-intelligence", "compute-patterns.sql");
  fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
  fs.writeFileSync(sqlPath, fullSQL);
  console.log("SQL written to: " + sqlPath);

  if (applyMode) {
    console.log("\nApplying pattern computation...");
    try {
      await query(fullSQL);
      console.log("Pattern tables computed.");

      // Verify counts
      const theoryCnt = await query("SELECT count(*) as cnt FROM defense_theory_outcomes");
      const motionCnt = await query("SELECT count(*) as cnt FROM motion_success_patterns");
      console.log("defense_theory_outcomes: " + (theoryCnt[0]?.cnt || 0) + " rows");
      console.log("motion_success_patterns: " + (motionCnt[0]?.cnt || 0) + " rows");
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
  } else {
    console.log("Run with --apply to compute patterns.");
  }

  await end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
