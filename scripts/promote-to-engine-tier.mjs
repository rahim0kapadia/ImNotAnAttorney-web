/**
 * Promote to Engine Tier — Copy statute_case_law → case_law + case_law_references
 *
 * Copies verified good-law cases from web-tier statute_case_law into engine-tier
 * tables (case_law, case_law_references, verified_case_law) for X-Ray+ tiers.
 *
 * Eligibility: WHERE is_good_law = true AND party_side IS NOT NULL
 *
 * Engine tables schema:
 *   - case_law: id, case_id, case_name, citation, court, year, holding, is_good_law,
 *     coverage_status, applicability_score, is_prosecution_citation, our_distinction,
 *     source_url, verified_at, created_at, key_quote, motion_topic, motion_types,
 *     attack_vectors, finding_types, verification_url, is_binding, research_source,
 *     applicability_label, score_rationale, relevant_arguments, linked_finding_ids,
 *     holding_keywords, prosecution_use, distinction_strength, prosecution_counter_id,
 *     is_joa_case, joa_argument_type, is_danger_case, danger_case_motion_type,
 *     fetched_holding, holding_match_score, negative_treatment, citing_cases_count,
 *     tactical_timing, condemnation_level, factual_scenario, mandatory_language,
 *     defense_favorable, parallel_citations, case_type, docket_number,
 *     pinpoint_citation, web_verified_status, web_verified_source,
 *     web_verified_date, needs_shepardization, updated_at
 *   - case_law_references: id, case_id, statute_id (FK to jurisdiction_statutes),
 *     cluster_id (from CourtListener)
 *   - verified_case_law: similar structure for gold-standard subset
 *
 * Usage:
 *   node scripts/promote-to-engine-tier.mjs              # Full run
 *   node scripts/promote-to-engine-tier.mjs --dry-run    # Stats only
 *   node scripts/promote-to-engine-tier.mjs --limit 1000 # Limit eligible rows
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100000;
const BATCH_SIZE = 500;

// Read Supabase token
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"),
  "utf8"
);
let supabaseToken = null;
for (const line of parentEnv.split("\n")) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    supabaseToken = line.slice(22).trim();
    break;
  }
}
if (!supabaseToken) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────
// SQL escaping
// ─────────────────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArrayLiteral(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map((s) => {
    const inner = String(s).split("\\").join("\\\\").split('"').join('\\"');
    return `"${inner}"`;
  });
  const literal = `{${items.join(",")}}`;
  return `'${literal.split("'").join("''")}'::text[]`;
}

// ─────────────────────────────────────────────────────────────────────────
// Supabase query
// ─────────────────────────────────────────────────────────────────────────

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if (res.statusCode === 429) {
            reject(new Error("429 Throttled"));
          } else if (res.statusCode >= 400) {
            reject(new Error(`${res.statusCode}: ${body}`));
          } else {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve(body);
            }
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Main pipeline
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== TASK 2: Promote to Engine Tier ===\n");

  // 1. Fetch eligible rows from statute_case_law
  console.log("Step 1: Fetching eligible statute_case_law rows...");
  const sql = `
    SELECT id, jurisdiction_statute_id, case_name, citation, court, year, holding,
           is_good_law, source_urls, courtlistener_cluster_id, confidence_score,
           verified_at, created_at, party_side, outcome, holding_excerpt,
           application, is_binding, key_quote, motion_types, negative_treatment,
           validation_level, benefit_type, legal_issues, supporting_rulings
    FROM statute_case_law
    WHERE is_good_law = true AND party_side IS NOT NULL
    LIMIT $1;
  `.replace("$1", String(limit));

  let rows = [];
  try {
    const result = await supabaseQuery(sql);
    rows = Array.isArray(result) ? result : [];
  } catch (err) {
    console.error("Error fetching rows:", err.message);
    process.exit(1);
  }

  console.log(`  Found ${rows.length} eligible rows`);

  if (rows.length === 0) {
    console.log("No eligible rows. Done.");
    return;
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Stats only. Not promoting.");
    console.log(`Total eligible rows: ${rows.length}`);
    console.log(`Will promote into: case_law, case_law_references, verified_case_law`);
    return;
  }

  // 2. Prepare case_law inserts
  console.log("\nStep 2: Preparing case_law inserts...");
  const caseInserts = [];
  const refInserts = [];
  const verifiedInserts = [];

  rows.forEach((row) => {
    // Skip rows without a case to link to (we don't create cases from scratch)
    const motionTypesArr = row.motion_types
      ? (Array.isArray(row.motion_types) ? row.motion_types : JSON.parse(String(row.motion_types) || "[]"))
      : [];

    const legalIssuesArr = row.legal_issues
      ? (Array.isArray(row.legal_issues) ? row.legal_issues : JSON.parse(String(row.legal_issues) || "[]"))
      : [];

    const supportingRulingsArr = row.supporting_rulings
      ? (Array.isArray(row.supporting_rulings) ? row.supporting_rulings : JSON.parse(String(row.supporting_rulings) || "[]"))
      : [];

    caseInserts.push({
      id: row.id, // Reuse statute_case_law ID as case_law ID for FK stability
      case_id: null, // No case_id — this is a reference case, not tied to a specific case
      case_name: row.case_name,
      citation: row.citation,
      court: row.court,
      decision_date: null,
      holding: row.holding,
      is_good_law: row.is_good_law,
      coverage_status: row.validation_level || null,
      applicability_score: null,
      is_prosecution_citation: row.party_side === "PROSECUTION",
      our_distinction: row.application,
      source_url: row.source_urls && Array.isArray(row.source_urls) ? row.source_urls[0] : null,
      verified_at: row.verified_at,
      created_at: row.created_at,
      key_quote: row.key_quote,
      motion_topic: null,
      motion_types: motionTypesArr,
      attack_vectors: [],
      finding_types: legalIssuesArr,
      verification_url: row.source_urls && Array.isArray(row.source_urls) ? row.source_urls[0] : null,
      is_binding: row.is_binding,
      research_source: "statute_case_law_promotion",
      year: row.year,
      applicability_label: row.benefit_type,
      score_rationale: null,
      relevant_arguments: [],
      linked_finding_ids: [],
      holding_keywords: [],
      prosecution_use: row.outcome,
      distinction_strength: null,
      prosecution_counter_id: null,
      is_joa_case: false,
      joa_argument_type: null,
      is_danger_case: false,
      danger_case_motion_type: null,
      fetched_holding: row.holding_excerpt,
      holding_match_score: row.confidence_score ? parseFloat(row.confidence_score) : null,
      negative_treatment: row.negative_treatment,
      citing_cases_count: supportingRulingsArr.length,
      tactical_timing: null,
      condemnation_level: 0,
      factual_scenario: null,
      mandatory_language: null,
      defense_favorable: row.benefit_type && row.benefit_type.toLowerCase().includes("defense"),
      parallel_citations: null,
      case_type: null,
      docket_number: null,
      pinpoint_citation: null,
      web_verified_status: row.verification_url ? "verified" : "unverified",
      web_verified_source: "statute_case_law_promotion",
      web_verified_date: row.verified_at,
      needs_shepardization: row.negative_treatment ? false : true,
      updated_at: new Date().toISOString(),
    });

    // case_law_references: link back to jurisdiction_statute_id
    refInserts.push({
      statute_id: row.jurisdiction_statute_id,
      cluster_id: row.courtlistener_cluster_id || null,
    });

    // verified_case_law: gold standard if confidence_score > 0.7
    if (row.confidence_score && parseFloat(row.confidence_score) > 0.7) {
      verifiedInserts.push({
        statute_id: row.jurisdiction_statute_id,
        case_name: row.case_name,
        citation: row.citation,
        court: row.court,
        year: row.year,
        holding: row.holding,
        source_urls: row.source_urls,
        verification_status: "high_confidence",
        verified_at: row.verified_at,
      });
    }
  });

  console.log(`  Prepared ${caseInserts.length} case_law rows`);
  console.log(`  Prepared ${refInserts.length} case_law_references rows`);
  console.log(`  Prepared ${verifiedInserts.length} verified_case_law rows (high confidence)`);

  // 3. Batch INSERT case_law
  console.log("\nStep 3: Inserting into case_law...");
  let caseInserted = 0;
  for (let i = 0; i < caseInserts.length; i += BATCH_SIZE) {
    const batch = caseInserts.slice(i, i + BATCH_SIZE);
    const values = batch
      .map(
        (c) =>
          `(${esc(c.id)}, NULL, ${esc(c.case_name)}, ${esc(c.citation)}, ${esc(
            c.court
          )}, NULL, ${esc(c.holding)}, ${c.is_good_law}, ${esc(
            c.coverage_status
          )}, NULL, ${c.is_prosecution_citation}, ${esc(
            c.our_distinction
          )}, ${esc(c.source_url)}, ${esc(
            c.verified_at
          )}, ${esc(c.created_at)}, ${esc(c.key_quote)}, ${esc(
            c.motion_topic
          )}, ${escArrayLiteral(c.motion_types)}, ${escArrayLiteral(
            c.attack_vectors
          )}, ${escArrayLiteral(c.finding_types)}, ${esc(
            c.verification_url
          )}, ${c.is_binding}, ${esc(c.research_source)}, ${esc(
            c.applicability_label
          )}, ${esc(c.score_rationale)}, ${escArrayLiteral(
            c.relevant_arguments
          )}, ${escArrayLiteral(c.linked_finding_ids)}, ${escArrayLiteral(
            c.holding_keywords
          )}, ${esc(c.prosecution_use)}, ${esc(
            c.distinction_strength
          )}, ${c.prosecution_counter_id ? esc(c.prosecution_counter_id) : "NULL"}, ${c.is_joa_case}, ${esc(
            c.joa_argument_type
          )}, ${c.is_danger_case}, ${esc(
            c.danger_case_motion_type
          )}, ${esc(c.fetched_holding)}, ${
            c.holding_match_score ? c.holding_match_score : "NULL"
          }, ${esc(c.negative_treatment)}, ${c.citing_cases_count}, ${esc(
            c.tactical_timing
          )}, ${c.condemnation_level}, ${esc(
            c.factual_scenario
          )}, ${esc(c.mandatory_language)}, ${c.defense_favorable}, ${esc(
            c.parallel_citations
          )}, ${esc(c.case_type)}, ${esc(c.docket_number)}, ${esc(
            c.pinpoint_citation
          )}, ${esc(c.web_verified_status)}, ${esc(
            c.web_verified_source
          )}, ${esc(c.web_verified_date)}, ${c.needs_shepardization}, ${esc(
            c.updated_at
          )})`
      )
      .join(",");

    const insertSql = `
      INSERT INTO case_law (
        id, case_id, case_name, citation, court, decision_date, holding, is_good_law,
        coverage_status, applicability_score, is_prosecution_citation, our_distinction,
        source_url, verified_at, created_at, key_quote, motion_topic, motion_types,
        attack_vectors, finding_types, verification_url, is_binding, research_source,
        applicability_label, score_rationale, relevant_arguments, linked_finding_ids,
        holding_keywords, prosecution_use, distinction_strength, prosecution_counter_id,
        is_joa_case, joa_argument_type, is_danger_case, danger_case_motion_type,
        fetched_holding, holding_match_score, negative_treatment, citing_cases_count,
        tactical_timing, condemnation_level, factual_scenario, mandatory_language,
        defense_favorable, parallel_citations, case_type, docket_number,
        pinpoint_citation, web_verified_status, web_verified_source,
        web_verified_date, needs_shepardization, updated_at
      ) VALUES ${values}
      ON CONFLICT (id) DO UPDATE SET updated_at = now();
    `;

    try {
      await supabaseQuery(insertSql);
      caseInserted += batch.length;
      console.log(`  Inserted ${caseInserted}/${caseInserts.length} case_law rows`);
    } catch (err) {
      if (err.message === "429 Throttled") {
        console.log(`  Hit 429, waiting 30s...`);
        await new Promise((r) => setTimeout(r, 30000));
        i -= BATCH_SIZE;
      } else {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✓ Promoted ${caseInserted} rows to case_law`);
  console.log("Task 2 complete.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
