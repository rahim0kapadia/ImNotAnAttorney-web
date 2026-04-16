/**
 * Enrich case_feature_vectors with outcome, party_side, and motion_types
 * from CourtListener cluster detail + opinion text.
 *
 * For each unenriched cluster_id:
 *   1. GET /api/rest/v4/clusters/{id}/ → case_name_full (party_side), posture/disposition (outcome)
 *   2. GET first sub_opinion → opinion text → outcome (if still null), motion_types
 *   3. Batch-update features jsonb in Supabase
 *
 * Usage:
 *   node scripts/enrich-case-vectors.mjs                          # Dry run (count unenriched)
 *   node scripts/enrich-case-vectors.mjs --apply                  # Full run
 *   node scripts/enrich-case-vectors.mjs --apply --limit 10       # Test with 10
 *   node scripts/enrich-case-vectors.mjs --apply --skip-opinions  # Cluster detail only (faster, ~3h)
 *   node scripts/enrich-case-vectors.mjs --apply --offset 5000    # Resume from offset
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const skipOpinions = args.includes("--skip-opinions");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const offsetIdx = args.indexOf("--offset");
const OFFSET = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1], 10) : 0;
const BATCH_SIZE = 50;
const REQUEST_DELAY_MS = 1000; // 1 req/sec, slower but avoids CL rate limit 429s

// ── Env ─────────────────────────────────────────────────────────────────────
function loadEnv(filepath) {
  if (!fs.existsSync(filepath)) return;
  for (const line of fs.readFileSync(filepath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv(path.join(PROJECT_ROOT, ".env.local"));
loadEnv(path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"));

const CL_TOKEN = process.env.COURTLISTENER_TOKEN;
const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CL_TOKEN) throw new Error("Missing COURTLISTENER_TOKEN");
if (!SUPABASE_TOKEN) throw new Error("Missing SUPABASE_ACCESS_TOKEN");
if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

// ── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clFetch(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Token ${CL_TOKEN}` },
      });
      if (res.status === 429) {
        const wait = 15000 + attempt * 5000;
        console.log(`  Rate limited, waiting ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      if (res.status === 502 || res.status === 503) {
        await sleep(5000);
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) {
        console.error(`  CL ${res.status} for ${url}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      if (attempt < retries - 1) {
        await sleep(3000);
        continue;
      }
      console.error(`  Fetch error: ${e.message}`);
      return null;
    }
  }
  return null;
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_TOKEN}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          if (res.statusCode >= 400)
            reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
          else {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("'").join("''") + "'";
}

function escJsonb(obj) {
  if (!obj) return "NULL";
  const json = JSON.stringify(obj);
  return "'" + json.split("'").join("''") + "'::jsonb";
}

// ── Extraction Logic ────────────────────────────────────────────────────────

/**
 * Extract party_side from case_name_full, case_name, headmatter, or opinion text.
 *
 * Sources (in priority order):
 * 1. case_name_full, "Defendant Below, Appellant" (often empty)
 * 2. headmatter, HTML with party roles
 * 3. case_name, "State v. X" pattern (tells us it's criminal, not who appealed)
 * 4. opinion text, "defendant appeals", "state cross-appeals", etc.
 */
function extractPartySide(caseNameFull, caseName, headmatter, opinionText) {
  // Try case_name_full first (most explicit)
  for (const source of [caseNameFull, headmatter]) {
    if (!source) continue;
    const upper = source.toUpperCase();
    const parts = upper.split(/\bV\.\b|\bVS\.\b/);
    if (parts.length < 2) continue;

    const firstHalf = parts[0];
    const secondHalf = parts.slice(1).join(" ");

    if (firstHalf.includes("APPELLANT") && firstHalf.includes("DEFENDANT"))
      return "defendant";
    if (secondHalf.includes("APPELLANT") && secondHalf.includes("DEFENDANT"))
      return "defendant";
    if (
      firstHalf.includes("APPELLANT") &&
      (firstHalf.includes("STATE") ||
        firstHalf.includes("PEOPLE") ||
        firstHalf.includes("COMMONWEALTH") ||
        firstHalf.includes("UNITED STATES"))
    )
      return "prosecution";
    if (firstHalf.includes("PETITIONER") && !firstHalf.includes("STATE"))
      return "defendant";
    if (secondHalf.includes("PETITIONER") && !secondHalf.includes("STATE"))
      return "defendant";
  }

  // Try opinion text for explicit appeal language
  if (opinionText) {
    const head = opinionText.slice(0, 5000).toLowerCase();
    if (/\bdefendant[\s-]*appellant\b/.test(head)) return "defendant";
    if (/\bdefendant\s+appeals\b/.test(head)) return "defendant";
    if (/\bthe\s+defendant\s+appeal/i.test(head)) return "defendant";
    if (/\bstate[\s-]*appellant\b/.test(head)) return "prosecution";
    if (/\bstate\s+appeals\b/.test(head)) return "prosecution";
    if (/\bstate\s+cross-appeals?\b/.test(head)) return "prosecution";
    if (/\bpeople[\s-]*appellant\b/.test(head)) return "prosecution";
    if (/\bcommonwealth[\s-]*appellant\b/.test(head)) return "prosecution";
  }

  // Fallback: case_name pattern, "State/People/Commonwealth v. X" → defendant is subject
  // Can't determine who APPEALED, but we know the defendant's side
  if (caseName) {
    const upper = caseName.toUpperCase();
    if (/^(PEOPLE|STATE|COMMONWEALTH|UNITED STATES)\s/.test(upper))
      return "defendant";
    if (/\bV\.\s*(STATE|PEOPLE|COMMONWEALTH)\b/.test(upper))
      return "defendant";
  }

  return null;
}

/**
 * Extract outcome from posture, disposition, or opinion text.
 */
const OUTCOME_PATTERNS = [
  { pattern: /\baffirmed\s+in\s+part\b/i, outcome: "affirmed-in-part" },
  { pattern: /\breversed\s+in\s+part\b/i, outcome: "reversed-in-part" },
  {
    pattern: /\breversed\s+and\s+remanded\b/i,
    outcome: "reversed-and-remanded",
  },
  { pattern: /\bvacated\s+and\s+remanded\b/i, outcome: "vacated-and-remanded" },
  { pattern: /\breversed\b/i, outcome: "reversed" },
  { pattern: /\baffirmed\b/i, outcome: "affirmed" },
  { pattern: /\bremanded\b/i, outcome: "remanded" },
  { pattern: /\bvacated\b/i, outcome: "vacated" },
  { pattern: /\bdismissed\b/i, outcome: "dismissed" },
  { pattern: /\bmodified\b/i, outcome: "modified" },
];

function extractOutcome(posture, disposition, opinionText) {
  // Try posture first (most authoritative)
  for (const source of [posture, disposition]) {
    if (!source) continue;
    for (const { pattern, outcome } of OUTCOME_PATTERNS) {
      if (pattern.test(source)) return outcome;
    }
  }

  // Try end of opinion text (last 2000 chars where disposition usually lives)
  if (opinionText) {
    const tail = opinionText.slice(-2000);
    for (const { pattern, outcome } of OUTCOME_PATTERNS) {
      if (pattern.test(tail)) return outcome;
    }
  }

  return null;
}

/**
 * Extract motion types from opinion text.
 */
const MOTION_PATTERNS = [
  { pattern: /motion\s+to\s+suppress/i, type: "suppression" },
  { pattern: /motion\s+to\s+dismiss/i, type: "dismissal" },
  { pattern: /motion\s+for\s+summary\s+judgment/i, type: "summary-judgment" },
  { pattern: /motion\s+for\s+new\s+trial/i, type: "new-trial" },
  { pattern: /motion\s+to\s+exclude/i, type: "exclusion" },
  { pattern: /motion\s+in\s+limine/i, type: "in-limine" },
  { pattern: /motion\s+to\s+compel/i, type: "compel-discovery" },
  { pattern: /motion\s+to\s+sever/i, type: "severance" },
  {
    pattern: /motion\s+for\s+directed\s+verdict/i,
    type: "directed-verdict",
  },
  {
    pattern: /motion\s+for\s+reconsideration/i,
    type: "reconsideration",
  },
  {
    pattern: /motion\s+to\s+withdraw/i,
    type: "withdrawal",
  },
  {
    pattern: /motion\s+for\s+judgment\s+of\s+acquittal/i,
    type: "judgment-of-acquittal",
  },
  { pattern: /motion\s+to\s+strike/i, type: "strike" },
  { pattern: /motion\s+for\s+continuance/i, type: "continuance" },
  { pattern: /plea\s+(bargain|agreement|deal|negotiat)/i, type: "plea-bargain" },
];

function extractMotionTypes(opinionText) {
  if (!opinionText) return [];
  const found = new Set();
  for (const { pattern, type } of MOTION_PATTERNS) {
    if (pattern.test(opinionText)) found.add(type);
  }
  return [...found].sort();
}

/**
 * Extract benefit_type from outcome + party_side.
 */
function extractBenefitType(outcome, partySide) {
  if (!outcome) return null;

  const defWins = ["reversed", "reversed-and-remanded", "reversed-in-part", "vacated", "vacated-and-remanded", "dismissed"];
  const prosWins = ["affirmed"];

  if (defWins.includes(outcome)) return "defendant-favorable";
  if (prosWins.includes(outcome)) {
    // Affirmed can favor defendant if prosecution appealed
    if (partySide === "prosecution") return "defendant-favorable";
    return "prosecution-favorable";
  }
  if (outcome === "affirmed-in-part") return "mixed";
  if (outcome === "remanded") return "neutral";
  if (outcome === "modified") return "mixed";
  return null;
}

/**
 * Strip HTML tags from opinion text.
 */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== CASE FEATURE VECTOR ENRICHMENT ===\n");
  console.log(`Mode: ${applyMode ? "APPLY" : "DRY RUN"}`);
  console.log(`Skip opinions: ${skipOpinions}`);
  if (LIMIT < Infinity) console.log(`Limit: ${LIMIT}`);
  if (OFFSET > 0) console.log(`Offset: ${OFFSET}`);

  // Step 1: Fetch unenriched cluster_ids
  // Target: bulk-csv-no-match (bulk CSV couldn't find them) OR never enriched
  console.log("\nFetching unenriched cluster_ids...");

  const allClusterIds = [];
  let dbOffset = 0;
  while (true) {
    const res = await fetch(
      `https://${PROJECT_REF}.supabase.co/rest/v1/case_feature_vectors?select=cluster_id,features&or=(features->>enrichment_source.eq.bulk-csv-no-match,features->>enriched_at.is.null)&order=cluster_id&offset=${dbOffset}&limit=1000`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!res.ok) {
      console.error("DB fetch error:", res.status, await res.text());
      break;
    }
    const rows = await res.json();
    for (const r of rows) allClusterIds.push(r.cluster_id);
    if (rows.length < 1000) break;
    dbOffset += 1000;
  }

  console.log(`Unenriched clusters: ${allClusterIds.length}`);

  // Apply offset and limit
  const clusterIds = allClusterIds.slice(OFFSET, OFFSET + LIMIT);
  console.log(
    `Processing: ${clusterIds.length} (offset ${OFFSET}, limit ${LIMIT === Infinity ? "none" : LIMIT})`
  );

  if (!applyMode) {
    console.log("\nDry run complete. Use --apply to enrich.");
    return;
  }

  if (clusterIds.length === 0) {
    console.log("Nothing to enrich.");
    return;
  }

  // Step 2: Enrich each cluster
  const stats = {
    processed: 0,
    outcomes: 0,
    partySides: 0,
    motionsFound: 0,
    clusterErrors: 0,
    opinionErrors: 0,
    dbErrors: 0,
  };
  const pendingUpdates = [];
  const startTime = Date.now();

  for (let i = 0; i < clusterIds.length; i++) {
    const clusterId = clusterIds[i];

    // Fetch cluster detail
    const cluster = await clFetch(
      `https://www.courtlistener.com/api/rest/v4/clusters/${clusterId}/`
    );
    await sleep(REQUEST_DELAY_MS);

    if (!cluster) {
      stats.clusterErrors++;
      // Still mark as attempted so we don't retry forever
      pendingUpdates.push({
        cluster_id: clusterId,
        enrichment: { enriched_at: new Date().toISOString(), enrichment_error: "cluster_fetch_failed" },
      });
      continue;
    }

    // Extract from cluster
    let outcome = extractOutcome(cluster.posture, cluster.disposition, null);
    let motionTypes = [];
    let plainText = "";

    // Fetch first opinion for text-based extraction
    if (!skipOpinions && cluster.sub_opinions?.length > 0) {
      const opData = await clFetch(cluster.sub_opinions[0]);
      await sleep(REQUEST_DELAY_MS);

      if (opData) {
        const rawText =
          opData.xml_harvard ||
          opData.html_with_citations ||
          opData.html ||
          opData.html_lawbox ||
          opData.html_columbia ||
          opData.html_anon_2020 ||
          opData.plain_text ||
          "";
        plainText = stripHtml(rawText);

        if (!outcome) {
          outcome = extractOutcome(null, null, plainText);
        }
        motionTypes = extractMotionTypes(plainText);
      } else {
        stats.opinionErrors++;
      }
    }

    // Extract party_side using all available sources (after opinion fetch)
    const partySide = extractPartySide(
      cluster.case_name_full,
      cluster.case_name,
      cluster.headmatter ? stripHtml(cluster.headmatter) : null,
      plainText
    );
    const benefitType = extractBenefitType(outcome, partySide);

    // Track stats
    if (outcome) stats.outcomes++;
    if (partySide) stats.partySides++;
    if (motionTypes.length > 0) stats.motionsFound++;
    stats.processed++;

    pendingUpdates.push({
      cluster_id: clusterId,
      enrichment: {
        outcome: outcome || null,
        party_side: partySide || null,
        motion_types: motionTypes,
        benefit_type: benefitType || null,
        enriched_at: new Date().toISOString(),
      },
    });

    // Batch update DB
    if (pendingUpdates.length >= BATCH_SIZE || i === clusterIds.length - 1) {
      const stmts = pendingUpdates.map((u) => {
        const merge = JSON.stringify(u.enrichment);
        return `UPDATE case_feature_vectors SET features = COALESCE(features, '{}'::jsonb) || '${merge.split("'").join("''")}'::jsonb WHERE cluster_id = ${esc(u.cluster_id)};`;
      });

      try {
        await supabaseQuery(stmts.join("\n"));
      } catch (e) {
        stats.dbErrors++;
        console.error(`  DB batch error: ${e.message.slice(0, 200)}`);
      }
      pendingUpdates.length = 0;
      await sleep(200);
    }

    // Progress log every 100
    if (stats.processed % 100 === 0 || i === clusterIds.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (stats.processed / (elapsed || 1)).toFixed(1);
      const eta = (((clusterIds.length - i) / (rate || 1)) / 60).toFixed(0);
      console.log(
        `  [${stats.processed}/${clusterIds.length}] outcomes:${stats.outcomes} party:${stats.partySides} motions:${stats.motionsFound} errors:${stats.clusterErrors + stats.opinionErrors} | ${rate}/s ETA:${eta}min`
      );
    }
  }

  // Final summary
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n${"=".repeat(50)}`);
  console.log("ENRICHMENT SUMMARY");
  console.log(`${"=".repeat(50)}`);
  console.log(`Processed:      ${stats.processed}`);
  console.log(`Outcomes found: ${stats.outcomes} (${((stats.outcomes / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`Party sides:    ${stats.partySides} (${((stats.partySides / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`With motions:   ${stats.motionsFound} (${((stats.motionsFound / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`Cluster errors: ${stats.clusterErrors}`);
  console.log(`Opinion errors: ${stats.opinionErrors}`);
  console.log(`DB errors:      ${stats.dbErrors}`);
  console.log(`Time:           ${totalTime} minutes`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
