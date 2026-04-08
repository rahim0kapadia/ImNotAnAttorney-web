/**
 * Bulk Verify Cases — Match citations against local CAP data + generate SQL + batch apply
 *
 * Reads the dump JSON + cached .cap-cache/ files. For each case:
 *   1. Parse citation → reporter + volume
 *   2. Load cached CasesMetadata.json
 *   3. Match by normalized citation
 *   4. If found: UPDATE source_urls, confidence_score, validation_level, verified_at
 *   5. If NOT found + no CL cluster ID: mark validation_level = NOT_IN_DB
 *   6. If NOT found + HAS CL cluster ID: skip (verify via classify-case-law.mjs)
 *
 * Zero API calls during verification. All data is local.
 * Batch-applies the generated SQL via Supabase Management API.
 *
 * NOTE: Unlike verify-via-cap.mjs (which DELETEs unverifiable rows), this script
 * marks them as validation_level='NOT_IN_DB' — safer for bulk operations where
 * a missing CAP cache file shouldn't trigger mass deletions.
 *
 * Usage:
 *   node scripts/bulk-verify-cases.mjs --dry-run        # Generate SQL only, don't apply
 *   node scripts/bulk-verify-cases.mjs --apply           # Generate + apply to Supabase
 *   node scripts/bulk-verify-cases.mjs --limit 50        # Process first 50 rows only
 *   node scripts/bulk-verify-cases.mjs --input path.json # Custom dump file
 *   node scripts/bulk-verify-cases.mjs --output path.sql # Custom SQL output
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const CACHE_DIR = path.join(PROJECT_ROOT, ".cap-cache");
const DEFAULT_INPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "verification-updates.sql");
const BATCH_SIZE = 100;

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");
const inputIdx = args.indexOf("--input");
const inputPath = inputIdx >= 0 ? path.resolve(args[inputIdx + 1]) : DEFAULT_INPUT;
const outputIdx = args.indexOf("--output");
const outputPath = outputIdx >= 0 ? path.resolve(args[outputIdx + 1]) : DEFAULT_OUTPUT;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Reporter Map (from verify-via-cap.mjs) ──────────────────────────────────

const REPORTER_MAP = {
  "u.s.": "us", "us": "us",
  "s.ct.": "sct", "sct": "sct",
  "l.ed.": "led", "l.ed.2d": "led2d",
  "f.": "f", "f.2d": "f2d", "f.3d": "f3d", "f.4th": "f4th",
  "f.supp.": "fsupp", "f.supp.2d": "fsupp2d", "f.supp.3d": "fsupp3d",
  "so.": "so", "so.2d": "so2d", "so.3d": "so3d",
  "n.e.": "ne", "n.e.2d": "ne2d", "n.e.3d": "ne3d",
  "n.w.": "nw", "n.w.2d": "nw2d",
  "p.": "p", "p.2d": "p2d", "p.3d": "p3d",
  "s.e.": "se", "s.e.2d": "se2d",
  "s.w.": "sw", "s.w.2d": "sw2d", "s.w.3d": "sw3d",
  "a.": "a", "a.2d": "a2d", "a.3d": "a3d",
  "cal.": "cal", "cal.2d": "cal2d", "cal.3d": "cal3d", "cal.4th": "cal4th", "cal.5th": "cal5th",
  "cal.app.": "calapp", "cal.app.2d": "calapp2d", "cal.app.3d": "calapp3d",
  "cal.app.4th": "calapp4th", "cal.app.5th": "calapp5th",
  "cal.rptr.": "calrptr", "cal.rptr.2d": "calrptr2d", "cal.rptr.3d": "calrptr3d",
  "n.y.": "ny", "n.y.2d": "ny2d", "n.y.3d": "ny3d",
  "n.y.s.": "nys", "n.y.s.2d": "nys2d", "n.y.s.3d": "nys3d",
  "ill.": "ill", "ill.2d": "ill2d",
  "ill.app.": "illapp", "ill.app.2d": "illapp2d", "ill.app.3d": "illapp3d",
  "ill.dec.": "illdec",
  "tex.": "tex", "tex.crim.": "texcrim",
  "ohio st.": "ohiost", "ohio st.2d": "ohiost2d", "ohio st.3d": "ohiost3d",
  "ohio app.": "ohioapp", "ohio app.2d": "ohioapp2d", "ohio app.3d": "ohioapp3d",
  "mass.": "mass", "mass.app.": "massapp", "mass.app.ct.": "massappct",
  "wis.": "wis", "wis.2d": "wis2d",
  "minn.": "minn",
  "mich.": "mich", "mich.app.": "michapp",
  "conn.": "conn", "conn.app.": "connapp",
  "md.": "md", "md.app.": "mdapp",
  "n.j.": "nj", "n.j.super.": "njsuper",
  "pa.": "pa", "pa.super.": "pasuper", "pa.commw.": "pacommw",
  "va.": "va", "va.app.": "vaapp",
  "wash.": "wash", "wash.2d": "wash2d", "wash.app.": "washapp",
  "or.": "or", "or.app.": "orapp",
  "ga.": "ga", "ga.app.": "gaapp",
  "fla.": "fla",
  "a.d.": "ad", "a.d.2d": "ad2d", "a.d.3d": "ad3d",
  "misc.": "misc", "misc.2d": "misc2d", "misc.3d": "misc3d",
  "b.r.": "br",
  "f.appx.": "fappx",
};

// ── Citation Parser (from verify-via-cap.mjs) ───────────────────────────────

function parseCitation(citation) {
  if (!citation || typeof citation !== "string") return null;
  const parenIdx = citation.indexOf("(");
  const cleaned = (parenIdx >= 0 ? citation.slice(0, parenIdx) : citation).trim();
  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 3) return null;
  const volume = parseInt(parts[0], 10);
  if (isNaN(volume)) return null;
  const page = parseInt(parts[parts.length - 1], 10);
  if (isNaN(page)) return null;
  const reporterRaw = parts.slice(1, -1).join(" ").toLowerCase();
  let reporterSlug = REPORTER_MAP[reporterRaw];
  if (!reporterSlug) {
    const noSpace = reporterRaw.split(" ").join("");
    reporterSlug = REPORTER_MAP[noSpace];
  }
  if (!reporterSlug) {
    const stripped = reporterRaw.split(".").join("").split(" ").join("");
    reporterSlug = REPORTER_MAP[stripped];
  }
  if (!reporterSlug) return null;
  return { reporter: reporterSlug, volume, page, cite: cleaned };
}

// ── Citation Matching ───────────────────────────────────────────────────────

function normalizeCiteForCompare(s) {
  return s.split(" ").join("").toLowerCase();
}

function findInVolume(metadata, citation) {
  if (!metadata || !Array.isArray(metadata)) return null;
  const targetNorm = normalizeCiteForCompare(citation);
  for (const c of metadata) {
    if (!c.citations) continue;
    for (const cite of c.citations) {
      if (!cite.cite) continue;
      if (normalizeCiteForCompare(cite.cite) === targetNorm) {
        return c;
      }
    }
  }
  return null;
}

// ── SQL Helpers ─────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArray(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const items = arr.map(s => `"${String(s).split('"').join('""').split("'").join("''")}"` );
  return `'{${items.join(",")}}'`;
}

// Parse Postgres text[] literal string into JS array (Management API sometimes returns strings)
function parsePostgresArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== "string") return [];
  if (val === "{}") return [];
  // Strip outer braces and split on comma (simple — no nested arrays)
  const inner = val.slice(1, -1);
  const items = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"' && !inQuote) { inQuote = true; continue; }
    if (ch === '"' && inQuote) {
      if (i + 1 < inner.length && inner[i + 1] === '"') { current += '"'; i++; continue; }
      inQuote = false; continue;
    }
    if (ch === "," && !inQuote) { items.push(current); current = ""; continue; }
    current += ch;
  }
  if (current.length > 0) items.push(current);
  return items;
}

// ── Supabase Connection ─────────────────────────────────────────────────────

let supabaseToken = null;

function loadToken() {
  const parentEnv = fs.readFileSync(
    path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
  );
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.slice(22).trim();
      break;
    }
  }
  if (!supabaseToken) {
    console.error("ERROR: SUPABASE_ACCESS_TOKEN not found in parent .env.local");
    process.exit(1);
  }
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`SQL ${res.statusCode}: ${data}`));
        } else {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Volume Cache ────────────────────────────────────────────────────────────

const volumeCache = new Map(); // "reporter-volume" → parsed JSON or null

function loadVolume(reporter, volume) {
  const key = `${reporter}-${volume}`;
  if (volumeCache.has(key)) return volumeCache.get(key);

  const cacheFile = path.join(CACHE_DIR, `${reporter}-${volume}.json`);
  if (!fs.existsSync(cacheFile)) {
    volumeCache.set(key, null);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    volumeCache.set(key, data);
    return data;
  } catch {
    volumeCache.set(key, null);
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK VERIFY CASES (Local CAP Match) ===\n");

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Dump file not found: ${inputPath}`);
    console.error("Run bulk-dump-cases.mjs first.");
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const toProcess = rows.slice(0, limit);
  console.log(`Loaded ${rows.length} rows, processing ${toProcess.length}.\n`);

  const stats = {
    verified: 0,
    notInCap: 0,
    markedNotInDb: 0,
    skippedHasCl: 0,
    unparseable: 0,
    noCacheFile: 0,
    alreadyVerified: 0,
  };

  const sqlStatements = [];
  sqlStatements.push("-- Bulk CAP Verification — Generated " + new Date().toISOString());
  sqlStatements.push("-- Source: bulk-verify-cases.mjs");
  sqlStatements.push("");

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];

    // Skip rows that already have CAP verification
    const existingUrls = parsePostgresArray(row.source_urls);
    if (existingUrls.length > 0) {
      const hasCap = existingUrls.some(u => u && u.indexOf("static.case.law") >= 0);
      if (hasCap) {
        stats.alreadyVerified++;
        continue;
      }
    }

    const parsed = parseCitation(row.citation);
    if (!parsed) {
      stats.unparseable++;
      continue;
    }

    const metadata = loadVolume(parsed.reporter, parsed.volume);
    if (!metadata) {
      stats.noCacheFile++;
      // No cache file — can't verify locally
      // If it has a CL cluster ID, leave it for classify-case-law.mjs
      if (row.courtlistener_cluster_id) {
        stats.skippedHasCl++;
      } else {
        // No CAP, no CL — mark as NOT_IN_DB
        stats.markedNotInDb++;
        sqlStatements.push(
          `UPDATE statute_case_law SET validation_level = 'NOT_IN_DB' WHERE id = ${esc(row.id)};`
        );
      }
      continue;
    }

    const match = findInVolume(metadata, parsed.cite);

    if (match) {
      stats.verified++;
      // Match verify-via-cap.mjs URL format: CasesMetadata.json#case=<id>
      const caseId = match.id || "";
      const capUrl = `https://static.case.law/${parsed.reporter}/${parsed.volume}/CasesMetadata.json#case=${caseId}`;

      // Build existing source_urls array + new CAP URL
      const newUrls = [...existingUrls, capUrl];

      // Bump confidence: existing + 0.30, capped at 1.00
      const existingConf = row.confidence_score ? parseFloat(row.confidence_score) : 0;
      const safeConf = isNaN(existingConf) ? 0 : existingConf;
      const newConf = Math.min(1.0, safeConf + 0.30).toFixed(2);

      // Extract metadata from CAP match
      const capCourt = match.court ? (match.court.name || "") : "";
      const capDate = match.decision_date || "";
      const capYear = capDate ? parseInt(capDate.split("-")[0], 10) : null;

      let stmt = `UPDATE statute_case_law SET `;
      stmt += `source_urls = ${escArray(newUrls)}, `;
      stmt += `confidence_score = ${newConf}, `;
      stmt += `validation_level = 'VALID_STRONG', `;
      stmt += `verified_at = NOW()`;

      // Only overwrite case_name if existing is empty/null
      if (match.name_abbreviation && (!row.case_name || row.case_name === "Unknown")) {
        stmt += `, case_name = ${esc(match.name_abbreviation)}`;
      }
      // If we have court info from CAP and row is missing it
      if (capCourt && (!row.court || row.court === "Unknown")) {
        stmt += `, court = ${esc(capCourt)}`;
      }
      // If we have year from CAP and row is missing it
      if (capYear && !row.year) {
        stmt += `, year = ${capYear}`;
      }

      stmt += ` WHERE id = ${esc(row.id)};`;
      sqlStatements.push(stmt);
    } else {
      stats.notInCap++;
      if (row.courtlistener_cluster_id) {
        stats.skippedHasCl++;
        // Has CL data — defer to classify-case-law.mjs for verification
      } else {
        stats.markedNotInDb++;
        sqlStatements.push(
          `UPDATE statute_case_law SET validation_level = 'NOT_IN_DB' WHERE id = ${esc(row.id)};`
        );
      }
    }

    // Progress every 500 rows
    if ((i + 1) % 500 === 0) {
      process.stdout.write(`  Processed ${i + 1}/${toProcess.length}...\n`);
    }
  }

  // Write SQL file
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Filter out comment-only lines for counting
  const updateStmts = sqlStatements.filter(s => s.startsWith("UPDATE"));
  sqlStatements.push("");
  sqlStatements.push(`-- Total UPDATE statements: ${updateStmts.length}`);
  sqlStatements.push(`-- Verified (CAP match): ${stats.verified}`);
  sqlStatements.push(`-- Marked NOT_IN_DB: ${stats.markedNotInDb}`);

  fs.writeFileSync(outputPath, sqlStatements.join("\n"));

  console.log(`\n--- Verification Results ---`);
  console.log(`Verified (CAP match):    ${stats.verified}`);
  console.log(`Not in CAP (has CL):     ${stats.skippedHasCl} (deferred to classify-case-law)`);
  console.log(`Marked NOT_IN_DB:        ${stats.markedNotInDb}`);
  console.log(`Already verified:        ${stats.alreadyVerified}`);
  console.log(`Unparseable citation:    ${stats.unparseable}`);
  console.log(`No cache file:           ${stats.noCacheFile}`);
  console.log(`\nSQL file: ${outputPath}`);
  console.log(`UPDATE statements: ${updateStmts.length}`);

  if (dryRun || !applyMode) {
    console.log(`\n========================================`);
    console.log(`  NO CHANGES APPLIED TO DATABASE`);
    console.log(`========================================`);
    if (dryRun) {
      console.log(`Dry run complete. Review the SQL file before applying.`);
    } else {
      console.log(`SQL file generated. To apply:`);
      console.log(`  node scripts/bulk-verify-cases.mjs --apply`);
    }
    return;
  }

  // ── Batch Apply ─────────────────────────────────────────────────────────
  console.log(`\n--- Applying ${updateStmts.length} updates in batches of ${BATCH_SIZE} ---\n`);

  loadToken();

  let applied = 0;
  let batchErrors = 0;

  for (let i = 0; i < updateStmts.length; i += BATCH_SIZE) {
    const batch = updateStmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(updateStmts.length / BATCH_SIZE);

    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} statements applied\n`);
    } catch (e) {
      batchErrors++;
      console.error(`  Batch ${batchNum}/${totalBatches}: ERROR — ${e.message}`);

      // On 429, wait and retry once
      if (e.message.indexOf("429") >= 0) {
        console.log("  Rate limited — waiting 10s before retry...");
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n"));
          applied += batch.length;
          console.log(`  Batch ${batchNum} retry: SUCCESS`);
          batchErrors--;
        } catch (e2) {
          console.error(`  Batch ${batchNum} retry: FAILED — ${e2.message}`);
        }
      }
    }

    // Small delay between batches to avoid 429
    if (i + BATCH_SIZE < updateStmts.length) {
      await sleep(1000);
    }
  }

  console.log(`\n--- Apply Results ---`);
  console.log(`Applied:                 ${applied}`);
  console.log(`Batch errors:            ${batchErrors}`);
  console.log(`Total UPDATE statements: ${updateStmts.length}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
