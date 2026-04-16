/**
 * Enrich case_feature_vectors from LOCAL BULK CSV files, no API calls.
 *
 * Phase 1: Stream opinion-clusters bz2 (2.3GB) → extract case_name_full, posture,
 *          disposition, headmatter for matching cluster_ids → party_side + outcome
 * Phase 2: Stream opinions-filtered.csv (1.1GB) → extract outcome (if still null)
 *          and motion_types from opinion text
 * Phase 3: Batch-update features jsonb in Supabase
 *
 * Gotchas (from cl-bulk-data-defensive rule):
 *   - CL CSVs quote ALL values, strip quotes before matching
 *   - relax_quotes: true, relax_column_count: true (legal text has unescaped quotes)
 *   - ONE streamer at a time (no concurrent CSV streams, OOM on Windows)
 *   - try-catch around for-await to collect partial data on crash
 *
 * Usage:
 *   node scripts/enrich-from-bulk.mjs                    # Dry run
 *   node scripts/enrich-from-bulk.mjs --apply            # Full run
 *   node scripts/enrich-from-bulk.mjs --apply --phase 1  # Clusters only
 *   node scripts/enrich-from-bulk.mjs --apply --phase 2  # Opinions only
 *   node --max-old-space-size=8192 scripts/enrich-from-bulk.mjs --apply  # If OOM
 */

import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const CLUSTERS_CSV = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinion-clusters.csv");
const CLUSTERS_BZ2 = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinion-clusters-2026-03-31.csv.bz2");
const OPINIONS_FILTERED = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-filtered.csv");

const BATCH_SIZE = 100;

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const phaseIdx = args.indexOf("--phase");
const onlyPhase = phaseIdx >= 0 ? parseInt(args[phaseIdx + 1], 10) : 0; // 0 = both

// ── Env ─────────────────────────────────────────────────────────────────────
function loadEnv(filepath) {
  if (!fs.existsSync(filepath)) return;
  for (const line of fs.readFileSync(filepath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).join ? t.slice(eq + 1) : t.substring(eq + 1);
    val = val.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv(path.join(PROJECT_ROOT, ".env.local"));
loadEnv(path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"));

const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_TOKEN) throw new Error("Missing SUPABASE_ACCESS_TOKEN");
if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

// ── DB Helpers ──────────────────────────────────────────────────────────────
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
          if (res.statusCode >= 400) reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
          else {
            try { resolve(JSON.parse(data)); }
            catch { resolve(data); }
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

// ── Extraction Logic (reused from enrich-case-vectors.mjs) ──────────────────

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

/** Strip surrounding quotes that CL bulk CSVs add to ALL values */
function unquote(val) {
  if (!val) return val;
  if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
  return val;
}

const OUTCOME_PATTERNS = [
  { pattern: /\baffirmed\s+in\s+part\b/i, outcome: "affirmed-in-part" },
  { pattern: /\breversed\s+in\s+part\b/i, outcome: "reversed-in-part" },
  { pattern: /\breversed\s+and\s+remanded\b/i, outcome: "reversed-and-remanded" },
  { pattern: /\bvacated\s+and\s+remanded\b/i, outcome: "vacated-and-remanded" },
  { pattern: /\breversed\b/i, outcome: "reversed" },
  { pattern: /\baffirmed\b/i, outcome: "affirmed" },
  { pattern: /\bremanded\b/i, outcome: "remanded" },
  { pattern: /\bvacated\b/i, outcome: "vacated" },
  { pattern: /\bdismissed\b/i, outcome: "dismissed" },
  { pattern: /\bmodified\b/i, outcome: "modified" },
];

function extractOutcome(posture, disposition, opinionText) {
  for (const source of [posture, disposition]) {
    if (!source) continue;
    for (const { pattern, outcome } of OUTCOME_PATTERNS) {
      if (pattern.test(source)) return outcome;
    }
  }
  if (opinionText) {
    const tail = opinionText.slice(-2000);
    for (const { pattern, outcome } of OUTCOME_PATTERNS) {
      if (pattern.test(tail)) return outcome;
    }
  }
  return null;
}

function extractPartySide(caseNameFull, caseName, headmatter, opinionText) {
  for (const source of [caseNameFull, headmatter]) {
    if (!source) continue;
    const upper = source.toUpperCase();
    const parts = upper.split(/\bV\.\b|\bVS\.\b/);
    if (parts.length < 2) continue;
    const firstHalf = parts[0];
    const secondHalf = parts.slice(1).join(" ");
    if (firstHalf.includes("APPELLANT") && firstHalf.includes("DEFENDANT")) return "defendant";
    if (secondHalf.includes("APPELLANT") && secondHalf.includes("DEFENDANT")) return "defendant";
    if (firstHalf.includes("APPELLANT") && (firstHalf.includes("STATE") || firstHalf.includes("PEOPLE") || firstHalf.includes("COMMONWEALTH") || firstHalf.includes("UNITED STATES"))) return "prosecution";
    if (firstHalf.includes("PETITIONER") && !firstHalf.includes("STATE")) return "defendant";
    if (secondHalf.includes("PETITIONER") && !secondHalf.includes("STATE")) return "defendant";
  }
  if (opinionText) {
    const head = opinionText.slice(0, 5000).toLowerCase();
    if (/\bdefendant[\s-]*appellant\b/.test(head)) return "defendant";
    if (/\bdefendant\s+appeals\b/.test(head)) return "defendant";
    if (/\bthe\s+defendant\s+appeal/.test(head)) return "defendant";
    if (/\bstate[\s-]*appellant\b/.test(head)) return "prosecution";
    if (/\bstate\s+appeals\b/.test(head)) return "prosecution";
    if (/\bstate\s+cross-appeals?\b/.test(head)) return "prosecution";
    if (/\bpeople[\s-]*appellant\b/.test(head)) return "prosecution";
    if (/\bcommonwealth[\s-]*appellant\b/.test(head)) return "prosecution";
  }
  if (caseName) {
    const upper = caseName.toUpperCase();
    if (/^(PEOPLE|STATE|COMMONWEALTH|UNITED STATES)\s/.test(upper)) return "defendant";
    if (/\bV\.\s*(STATE|PEOPLE|COMMONWEALTH)\b/.test(upper)) return "defendant";
  }
  return null;
}

const MOTION_PATTERNS = [
  { pattern: /motion\s+to\s+suppress/i, type: "suppression" },
  { pattern: /motion\s+to\s+dismiss/i, type: "dismissal" },
  { pattern: /motion\s+for\s+summary\s+judgment/i, type: "summary-judgment" },
  { pattern: /motion\s+for\s+new\s+trial/i, type: "new-trial" },
  { pattern: /motion\s+to\s+exclude/i, type: "exclusion" },
  { pattern: /motion\s+in\s+limine/i, type: "in-limine" },
  { pattern: /motion\s+to\s+compel/i, type: "compel-discovery" },
  { pattern: /motion\s+to\s+sever/i, type: "severance" },
  { pattern: /motion\s+for\s+directed\s+verdict/i, type: "directed-verdict" },
  { pattern: /motion\s+for\s+reconsideration/i, type: "reconsideration" },
  { pattern: /motion\s+to\s+withdraw/i, type: "withdrawal" },
  { pattern: /motion\s+for\s+judgment\s+of\s+acquittal/i, type: "judgment-of-acquittal" },
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

function extractBenefitType(outcome, partySide) {
  if (!outcome) return null;
  const defWins = ["reversed", "reversed-and-remanded", "reversed-in-part", "vacated", "vacated-and-remanded", "dismissed"];
  const prosWins = ["affirmed"];
  if (defWins.includes(outcome)) return "defendant-favorable";
  if (prosWins.includes(outcome)) {
    if (partySide === "prosecution") return "defendant-favorable";
    return "prosecution-favorable";
  }
  if (outcome === "affirmed-in-part") return "mixed";
  if (outcome === "remanded") return "neutral";
  if (outcome === "modified") return "mixed";
  return null;
}

// ── Phase 1: Stream opinion-clusters CSV ────────────────────────────────────
async function phase1(targetIds, enrichments) {
  // Prefer decompressed CSV (fast); fall back to bzcat on bz2 (slow)
  const useDecompressed = fs.existsSync(CLUSTERS_CSV);
  const source = useDecompressed ? CLUSTERS_CSV : CLUSTERS_BZ2;
  console.log(`\n=== PHASE 1: Streaming opinion-clusters (${useDecompressed ? "decompressed CSV" : "bz2 via bzcat, SLOW, decompress first!"}) ===`);

  if (!fs.existsSync(source)) {
    console.error("Missing:", source, ", decompress with: bzcat opinion-clusters-2026-03-31.csv.bz2 > opinion-clusters.csv");
    return;
  }

  let inputStream;
  if (useDecompressed) {
    inputStream = fs.createReadStream(CLUSTERS_CSV);
  } else {
    const bz = spawn("bzcat", [CLUSTERS_BZ2]);
    inputStream = bz.stdout;
  }

  const parser = inputStream.pipe(
    parse({
      columns: true,
      escape: "\\",
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      cast: false,
    })
  );

  let scanned = 0;
  let matched = 0;

  try {
    for await (const record of parser) {
      scanned++;
      const clusterId = unquote(record.id);
      if (!targetIds.has(clusterId)) continue;

      matched++;
      const caseNameFull = unquote(record.case_name_full) || "";
      const caseName = unquote(record.case_name) || "";
      const posture = unquote(record.posture) || "";
      const disposition = unquote(record.disposition) || "";
      const headmatter = unquote(record.headmatter) || "";

      const outcome = extractOutcome(posture, disposition, null);
      const partySide = extractPartySide(
        caseNameFull,
        caseName,
        headmatter ? stripHtml(headmatter) : null,
        null
      );

      if (!enrichments.has(clusterId)) enrichments.set(clusterId, {});
      const e = enrichments.get(clusterId);
      if (outcome) e.outcome = outcome;
      if (partySide) e.party_side = partySide;

      if (matched % 5000 === 0) {
        console.log(`  Phase 1: scanned ${(scanned / 1000).toFixed(0)}K, matched ${matched}/${targetIds.size}`);
      }

      // Early exit if we found all targets
      if (matched >= targetIds.size) {
        console.log("  Phase 1: All targets found, stopping early.");
        bzcat.kill();
        break;
      }
    }
  } catch (err) {
    console.error(`  Phase 1 CSV error at row ${scanned}: ${err.message.slice(0, 200)}`);
    console.log(`  Partial data collected: ${matched} matches before error`);
  }

  const withOutcome = [...enrichments.values()].filter(e => e.outcome).length;
  const withParty = [...enrichments.values()].filter(e => e.party_side).length;
  console.log(`  Phase 1 done: scanned ${(scanned / 1000).toFixed(0)}K rows, matched ${matched}`);
  console.log(`  Outcomes from metadata: ${withOutcome}, Party sides: ${withParty}`);
}

// ── Phase 2: Stream opinions-filtered.csv ───────────────────────────────────
async function phase2(targetIds, enrichments) {
  console.log("\n=== PHASE 2: Streaming opinions-filtered.csv (1.1GB) ===");

  if (!fs.existsSync(OPINIONS_FILTERED)) {
    console.error("Missing:", OPINIONS_FILTERED);
    return;
  }

  const fileStream = fs.createReadStream(OPINIONS_FILTERED);
  const parser = fileStream.pipe(
    parse({
      columns: true,
      escape: "\\",
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      cast: false,
    })
  );

  let scanned = 0;
  let matched = 0;
  // Track which cluster_ids we've already processed (opinions CSV may have multiple per cluster)
  const seenClusters = new Set();

  try {
    for await (const record of parser) {
      scanned++;
      const clusterId = unquote(record.cluster_id);
      if (!targetIds.has(clusterId)) continue;
      if (seenClusters.has(clusterId)) continue; // first opinion per cluster only
      seenClusters.add(clusterId);
      matched++;

      // Get text from whichever field is populated
      const rawText =
        unquote(record.xml_harvard) ||
        unquote(record.html_with_citations) ||
        unquote(record.html) ||
        unquote(record.html_lawbox) ||
        unquote(record.html_columbia) ||
        unquote(record.html_anon_2020) ||
        unquote(record.plain_text) ||
        "";

      if (!rawText) continue;
      const plainText = stripHtml(rawText);

      if (!enrichments.has(clusterId)) enrichments.set(clusterId, {});
      const e = enrichments.get(clusterId);

      // Extract outcome from text if not already set from Phase 1
      if (!e.outcome) {
        const outcome = extractOutcome(null, null, plainText);
        if (outcome) e.outcome = outcome;
      }

      // Extract party_side from text if not already set
      if (!e.party_side) {
        const partySide = extractPartySide(null, null, null, plainText);
        if (partySide) e.party_side = partySide;
      }

      // Extract motion_types (always from text)
      const motions = extractMotionTypes(plainText);
      if (motions.length > 0) e.motion_types = motions;

      if (matched % 5000 === 0) {
        console.log(`  Phase 2: scanned ${(scanned / 1000).toFixed(0)}K, matched ${matched}/${targetIds.size}`);
      }
    }
  } catch (err) {
    console.error(`  Phase 2 CSV error at row ${scanned}: ${err.message.slice(0, 200)}`);
    console.log(`  Partial data collected: ${matched} matches before error`);
  }

  const withOutcome = [...enrichments.values()].filter(e => e.outcome).length;
  const withMotions = [...enrichments.values()].filter(e => e.motion_types?.length > 0).length;
  console.log(`  Phase 2 done: scanned ${(scanned / 1000).toFixed(0)}K rows, matched ${matched}`);
  console.log(`  Total outcomes: ${withOutcome}, With motions: ${withMotions}`);
}

// ── Phase 3: Batch update DB ────────────────────────────────────────────────
async function phase3(enrichments) {
  console.log(`\n=== PHASE 3: Updating ${enrichments.size} vectors in DB ===`);

  const entries = [...enrichments.entries()];
  let applied = 0;
  let errors = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(([clusterId, e]) => {
      // Compute benefit_type
      const benefitType = extractBenefitType(e.outcome || null, e.party_side || null);
      const merge = {
        outcome: e.outcome || null,
        party_side: e.party_side || null,
        motion_types: e.motion_types || [],
        benefit_type: benefitType,
        enriched_at: new Date().toISOString(),
        enrichment_source: "bulk-csv",
      };
      const json = JSON.stringify(merge);
      return `UPDATE case_feature_vectors SET features = COALESCE(features, '{}'::jsonb) || '${json.split("'").join("''")}'::jsonb WHERE cluster_id = '${String(clusterId).split("'").join("''")}';`;
    });

    try {
      await supabaseQuery(stmts.join("\n"));
      applied += batch.length;
    } catch (e) {
      errors++;
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${e.message.slice(0, 200)}`);
    }

    if ((applied % 5000 === 0 && applied > 0) || i + BATCH_SIZE >= entries.length) {
      console.log(`  Applied: ${applied}/${entries.length}, errors: ${errors}`);
    }
  }

  return { applied, errors };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== BULK CSV ENRICHMENT ===\n");
  console.log(`Mode: ${applyMode ? "APPLY" : "DRY RUN"}`);
  if (onlyPhase) console.log(`Phase: ${onlyPhase} only`);
  const startTime = Date.now();

  // Load target cluster_ids (unenriched)
  console.log("Loading unenriched cluster_ids from DB...");
  const targetIds = new Set();
  let dbOffset = 0;
  while (true) {
    const res = await fetch(
      `https://${PROJECT_REF}.supabase.co/rest/v1/case_feature_vectors?select=cluster_id&features->>enrichment_source=is.null&order=cluster_id&offset=${dbOffset}&limit=1000`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!res.ok) {
      console.error("DB error:", res.status);
      break;
    }
    const rows = await res.json();
    for (const r of rows) targetIds.add(String(r.cluster_id));
    if (rows.length < 1000) break;
    dbOffset += 1000;
  }

  console.log(`Target cluster_ids: ${targetIds.size}`);

  if (!applyMode) {
    console.log("\nDry run. Use --apply to enrich.");
    return;
  }

  // Enrichments map: cluster_id → { outcome, party_side, motion_types }
  const enrichments = new Map();

  // Phase 1: Cluster metadata (sequential, one CSV at a time per gotcha rule)
  if (onlyPhase === 0 || onlyPhase === 1) {
    await phase1(targetIds, enrichments);
  }

  // Phase 2: Opinion text (sequential, after Phase 1 completes)
  if (onlyPhase === 0 || onlyPhase === 2) {
    await phase2(targetIds, enrichments);
  }

  // Phase 3: DB updates
  const { applied, errors } = await phase3(enrichments);

  // Also mark un-matched cluster_ids as attempted (so we don't re-scan)
  const unmatched = [...targetIds].filter(id => !enrichments.has(id));
  if (unmatched.length > 0) {
    console.log(`\nMarking ${unmatched.length} unmatched cluster_ids as attempted...`);
    for (let i = 0; i < unmatched.length; i += BATCH_SIZE) {
      const batch = unmatched.slice(i, i + BATCH_SIZE);
      const stmts = batch.map(id => {
        const merge = JSON.stringify({ enriched_at: new Date().toISOString(), enrichment_source: "bulk-csv-no-match" });
        return `UPDATE case_feature_vectors SET features = COALESCE(features, '{}'::jsonb) || '${merge.split("'").join("''")}'::jsonb WHERE cluster_id = '${String(id).split("'").join("''")}';`;
      });
      try {
        await supabaseQuery(stmts.join("\n"));
      } catch (e) {
        console.error(`  Unmatched batch error: ${e.message.slice(0, 200)}`);
      }
    }
  }

  // Summary
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const withOutcome = [...enrichments.values()].filter(e => e.outcome).length;
  const withParty = [...enrichments.values()].filter(e => e.party_side).length;
  const withMotions = [...enrichments.values()].filter(e => e.motion_types?.length > 0).length;

  console.log(`\n${"=".repeat(50)}`);
  console.log("BULK ENRICHMENT SUMMARY");
  console.log(`${"=".repeat(50)}`);
  console.log(`Target clusters:  ${targetIds.size}`);
  console.log(`Matched in CSVs:  ${enrichments.size}`);
  console.log(`Unmatched:        ${unmatched.length}`);
  console.log(`Outcomes:         ${withOutcome} (${((withOutcome / targetIds.size) * 100).toFixed(1)}%)`);
  console.log(`Party sides:      ${withParty} (${((withParty / targetIds.size) * 100).toFixed(1)}%)`);
  console.log(`With motions:     ${withMotions} (${((withMotions / targetIds.size) * 100).toFixed(1)}%)`);
  console.log(`DB applied:       ${applied}`);
  console.log(`DB errors:        ${errors}`);
  console.log(`Time:             ${totalTime} minutes`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
