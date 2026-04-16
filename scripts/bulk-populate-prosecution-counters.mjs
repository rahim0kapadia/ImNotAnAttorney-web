/**
 * Bulk Populate Prosecution Counters
 *
 * Populates prosecution_counters table with counter-argument case law.
 *
 * For each jurisdiction_statute_id that has prosecution-side case law marked
 * is_good_law, we create a prosecution_counter record grouping the top defense
 * cases that counter that statute.
 *
 * Prosecution Counters schema:
 *   - id (uuid, PK)
 *   - case_id (uuid, FK to cases, NULL for now, filled in P1.1 with motion_type)
 *   - motion_id (uuid, FK, NULL for now)
 *   - state_argument (text, prosecution's statutory argument)
 *   - state_case_law (jsonb, array of prosecution case law)
 *   - strength_rating (text, WEAK/MODERATE/STRONG)
 *   - defense_counter (text, defense counter-argument, populated later)
 *   - created_at
 *
 * Logic (P0 partial):
 *   1. Query statute_case_law WHERE party_side = 'PROSECUTION' AND is_good_law = true
 *   2. Group by jurisdiction_statute_id
 *   3. For each statute, find defense cases (party_side = NULL or opposite)
 *   4. INSERT prosecution_counter with the top 5 defense cases as jsonb array
 *   5. case_id and motion_id stay NULL until P1.1 (motion_type linking)
 *
 * This is PARTIAL, will be re-run after motion_types are populated.
 *
 * Usage:
 *   node scripts/bulk-populate-prosecution-counters.mjs              # Full run
 *   node scripts/bulk-populate-prosecution-counters.mjs --dry-run    # Stats only
 *   node scripts/bulk-populate-prosecution-counters.mjs --limit 200  # Limit statutes
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

function escJsonb(obj) {
  if (!obj) return "'{}'::jsonb";
  const json = JSON.stringify(obj);
  return `'${json.split("'").join("''")}'::jsonb`;
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
  console.log("=== TASK 3: Bulk Populate Prosecution Counters ===\n");

  // 1. Fetch prosecution-side case law grouped by statute
  console.log("Step 1: Fetching prosecution-side case law...");
  const prosecSql = `
    SELECT
      jurisdiction_statute_id,
      array_agg(JSON_BUILD_OBJECT(
        'id', id,
        'case_name', case_name,
        'citation', citation,
        'court', court,
        'year', year,
        'holding', holding,
        'is_good_law', is_good_law,
        'confidence_score', confidence_score,
        'outcome', outcome
      ) ORDER BY is_good_law DESC, confidence_score DESC NULLS LAST) as prosecution_cases
    FROM statute_case_law
    WHERE party_side = 'PROSECUTION' AND is_good_law = true
    GROUP BY jurisdiction_statute_id
    LIMIT $1;
  `.replace("$1", String(limit));

  let prosecutionRows = [];
  try {
    const result = await supabaseQuery(prosecSql);
    prosecutionRows = Array.isArray(result) ? result : [];
  } catch (err) {
    console.error("Error fetching prosecution cases:", err.message);
    process.exit(1);
  }

  console.log(`  Found ${prosecutionRows.length} statutes with prosecution cases`);

  // 2. For each statute, fetch defense cases (counters)
  console.log("\nStep 2: Fetching defense-side counters...");
  const counterMap = new Map();
  for (const row of prosecutionRows) {
    const defenseSql = `
      SELECT JSON_BUILD_OBJECT(
        'id', id,
        'case_name', case_name,
        'citation', citation,
        'court', court,
        'year', year,
        'holding', holding,
        'is_good_law', is_good_law,
        'confidence_score', confidence_score,
        'benefit_type', benefit_type
      )::text as case_json
      FROM statute_case_law
      WHERE jurisdiction_statute_id = ${esc(row.jurisdiction_statute_id)}
        AND (party_side IS NULL OR party_side = 'DEFENSE')
        AND is_good_law = true
      ORDER BY is_good_law DESC, confidence_score DESC NULLS LAST
      LIMIT 5;
    `;

    try {
      const result = await supabaseQuery(defenseSql);
      const defenseCases = Array.isArray(result)
        ? result.map((r) => JSON.parse(r.case_json))
        : [];

      counterMap.set(row.jurisdiction_statute_id, {
        prosecution_cases: row.prosecution_cases,
        defense_cases: defenseCases,
      });
    } catch (err) {
      console.log(
        `  Warning: Failed to fetch defenses for statute ${row.jurisdiction_statute_id}: ${err.message}`
      );
    }
  }

  console.log(`  Built counter map for ${counterMap.size} statutes`);

  // 3. Build prosecution counter inserts
  console.log("\nStep 3: Preparing prosecution_counter inserts...");
  const inserts = [];

  for (const [statuteId, counterData] of counterMap) {
    const prosecutionCases = counterData.prosecution_cases || [];
    const defenseCases = counterData.defense_cases || [];

    if (prosecutionCases.length === 0) continue;

    // Determine strength based on number and quality of defense cases
    let strength = "STRONG";
    if (defenseCases.length < 2) strength = "MODERATE";
    if (defenseCases.length < 1) strength = "WEAK";

    inserts.push({
      id: null, // Auto-gen
      case_id: null, // P1.1
      motion_id: null, // P1.1
      state_argument:
        prosecutionCases.length > 0
          ? `Based on ${prosecutionCases.length} prosecution case${prosecutionCases.length > 1 ? "s" : ""}`
          : "Prosecution statutory argument",
      state_case_law: prosecutionCases,
      strength_rating: strength,
      defense_counter: defenseCases.length > 0
        ? `Counter-argued by ${defenseCases.length} defense case${defenseCases.length > 1 ? "s" : ""}`
        : "No specific counter cases identified yet", // Required field
    });
  }

  console.log(`  Prepared ${inserts.length} prosecution_counter rows`);

  if (dryRun) {
    console.log("\n[DRY RUN] Stats only. Not inserting.");
    console.log(`Total prosecution counters to insert: ${inserts.length}`);
    console.log(`STRENGTH breakdown:`);
    const weakCount = inserts.filter((i) => i.strength_rating === "WEAK").length;
    const modCount = inserts.filter((i) => i.strength_rating === "MODERATE")
      .length;
    const strongCount = inserts.filter((i) => i.strength_rating === "STRONG")
      .length;
    console.log(`  WEAK: ${weakCount}`);
    console.log(`  MODERATE: ${modCount}`);
    console.log(`  STRONG: ${strongCount}`);
    return;
  }

  // 4. Batch INSERT
  console.log("\nStep 4: Inserting prosecution counters in batches...");
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE);
    const values = batch
      .map(
        (p) =>
          `(gen_random_uuid(), NULL, NULL, ${esc(
            p.state_argument
          )}, ${escJsonb(p.state_case_law)}, ${esc(
            p.strength_rating
          )}, ${esc(p.defense_counter)}, now())`
      )
      .join(",");

    const insertSql = `
      INSERT INTO prosecution_counters (
        id, case_id, motion_id, state_argument, state_case_law,
        strength_rating, defense_counter, created_at
      ) VALUES ${values}
      ON CONFLICT DO NOTHING;
    `;

    try {
      await supabaseQuery(insertSql);
      inserted += batch.length;
      console.log(`  Inserted ${inserted}/${inserts.length} counters`);
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

  console.log(`\n✓ Inserted ${inserted} prosecution counters`);
  console.log("Task 3 complete.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
