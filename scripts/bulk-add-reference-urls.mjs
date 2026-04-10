/**
 * Bulk Add Reference URLs — TRUE BULK PATTERN
 *
 * Replaces add-reference-urls.mjs's per-row UPDATE loop with a single
 * UPDATE ... FROM (VALUES ...) per batch. ~5x faster.
 *
 * For each statute_case_law row missing scholar.google URL:
 *   1. Construct Justia / Google Scholar / CourtListener search / FindLaw URLs
 *      from the citation + case_name (deterministic, no API calls)
 *   2. Append them to source_urls[] in a single multi-row UPDATE per batch
 *
 * Usage:
 *   node scripts/bulk-add-reference-urls.mjs                # All rows missing URLs
 *   node scripts/bulk-add-reference-urls.mjs --dry-run      # Stats only
 *   node scripts/bulk-add-reference-urls.mjs --limit 1000   # Process first N
 *   node scripts/bulk-add-reference-urls.mjs --batch 500    # Override batch size
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
const batchIdx = args.indexOf("--batch");
const BATCH_SIZE = batchIdx >= 0 ? parseInt(args[batchIdx + 1], 10) : 500;

// Read token
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
);
let supabaseToken = null;
for (const line of parentEnv.split("\n")) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    supabaseToken = line.slice(22).trim();
    break;
  }
}
if (!supabaseToken) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

// ── SQL escaping (no regex) ─────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArrayLiteral(arr) {
  // Build a PostgreSQL array literal: '{"url1","url2"}'
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map((s) => {
    // Inside the array literal: escape backslashes, then double-quotes
    const inner = String(s).split('\\').join('\\\\').split('"').join('\\"');
    return `"${inner}"`;
  });
  const literal = `{${items.join(",")}}`;
  // Wrap in single quotes; double any single-quotes inside
  return `'${literal.split("'").join("''")}'::text[]`;
}

// ── Supabase ────────────────────────────────────────────────────────────────

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve([]); }
        } else {
          reject(new Error(`SQL ${res.statusCode}: ${body.slice(0, 300)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Citation parsing + URL construction (no regex on file contents) ─────────

function parseCitation(citation) {
  if (!citation) return null;
  const parenIdx = citation.indexOf("(");
  const cleaned = (parenIdx >= 0 ? citation.slice(0, parenIdx) : citation).trim();
  // Split on whitespace runs without regex
  const parts = [];
  let current = "";
  for (const ch of cleaned) {
    if (ch === " " || ch === "\t" || ch === "\n") {
      if (current.length > 0) { parts.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) parts.push(current);
  if (parts.length < 3) return null;
  const volume = parseInt(parts[0], 10);
  const page = parseInt(parts[parts.length - 1], 10);
  if (isNaN(volume) || isNaN(page)) return null;
  const reporter = parts.slice(1, -1).join(" ");
  return { volume, reporter, page, cite: cleaned };
}

function buildJustiaUrl(parsed, caseName) {
  if (!parsed) return null;
  const reporter = parsed.reporter.toLowerCase();
  if (reporter.indexOf("u.s.") !== -1 || reporter === "us") {
    return `https://law.justia.com/cases/federal/us/${parsed.volume}/${parsed.page}/`;
  }
  if (caseName) {
    const q = encodeURIComponent(`${caseName} ${parsed.cite}`);
    return `https://law.justia.com/search?q=${q}`;
  }
  return null;
}

function buildGoogleScholarUrl(citation, caseName) {
  if (!citation) return null;
  const q = encodeURIComponent(`"${citation}"${caseName ? ` ${caseName}` : ""}`);
  return `https://scholar.google.com/scholar?q=${q}&hl=en&as_sdt=6,33`;
}

function buildCourtListenerSearchUrl(citation) {
  if (!citation) return null;
  const q = encodeURIComponent(citation);
  return `https://www.courtlistener.com/?q=${q}&type=o`;
}

function buildFindLawUrl(citation, caseName) {
  if (!caseName) return null;
  const q = encodeURIComponent(`${caseName} ${citation}`);
  return `https://caselaw.findlaw.com/search?query=${q}`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK ADD REFERENCE URLs (true bulk pattern) ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}, Batch: ${BATCH_SIZE}, Limit: ${limit}\n`);

  console.log("Querying rows missing reference URLs...");
  const rows = await supabaseQuery(
    `SELECT id, case_name, citation
     FROM statute_case_law
     WHERE NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(source_urls, ARRAY[]::text[])) AS u
       WHERE u LIKE '%scholar.google%'
     )
     AND citation IS NOT NULL
     LIMIT ${limit}`
  );

  console.log(`${rows.length} rows missing reference URLs\n`);

  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Build (id, urls) tuples
  const tuples = [];
  let skippedNoUrls = 0;
  for (const row of rows) {
    const parsed = parseCitation(row.citation);
    const refUrls = [];
    const justia = buildJustiaUrl(parsed, row.case_name);
    if (justia) refUrls.push(justia);
    const scholar = buildGoogleScholarUrl(row.citation, row.case_name);
    if (scholar) refUrls.push(scholar);
    const cl = buildCourtListenerSearchUrl(row.citation);
    if (cl) refUrls.push(cl);
    const findlaw = buildFindLawUrl(row.citation, row.case_name);
    if (findlaw) refUrls.push(findlaw);

    if (refUrls.length === 0) {
      skippedNoUrls++;
      continue;
    }
    tuples.push({ id: row.id, urls: refUrls });
  }

  console.log(`Tuples to apply:    ${tuples.length}`);
  console.log(`Skipped (no urls):  ${skippedNoUrls}`);
  console.log(`Batches:            ${Math.ceil(tuples.length / BATCH_SIZE)} × ${BATCH_SIZE}\n`);

  if (dryRun) {
    console.log("Sample tuple:", JSON.stringify(tuples[0], null, 2).slice(0, 600));
    console.log("\nDry run complete. No changes applied.");
    return;
  }

  // ONE UPDATE statement per batch using FROM (VALUES ...)
  let applied = 0;
  let batchErrors = 0;
  const startTime = Date.now();

  for (let i = 0; i < tuples.length; i += BATCH_SIZE) {
    const batch = tuples.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tuples.length / BATCH_SIZE);

    const valueRows = batch.map(t => `(${esc(t.id)}::uuid, ${escArrayLiteral(t.urls)})`).join(",\n  ");

    const sql =
      `UPDATE statute_case_law t\n` +
      `SET source_urls = array_cat(COALESCE(t.source_urls, '{}'::text[]), v.new_urls)\n` +
      `FROM (VALUES\n  ${valueRows}\n) AS v(id, new_urls)\n` +
      `WHERE t.id = v.id;`;

    const sqlSizeKB = Math.round(sql.length / 1024);

    try {
      await supabaseQuery(sql);
      applied += batch.length;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (applied / elapsed).toFixed(0);
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} rows (${sqlSizeKB}KB) — ${rate} rows/sec\n`);
    } catch (e) {
      batchErrors++;
      console.error(`  Batch ${batchNum}: ERROR — ${e.message.slice(0, 200)}`);
      if (e.message.indexOf("429") >= 0) {
        console.log("  Rate limited — waiting 10s...");
        await sleep(10000);
        try {
          await supabaseQuery(sql);
          applied += batch.length;
          batchErrors--;
        } catch (e2) {
          console.error(`  Batch ${batchNum} retry: FAILED`);
        }
      }
    }

    if (i + BATCH_SIZE < tuples.length) await sleep(200);
  }

  const totalElapsed = (Date.now() - startTime) / 1000;
  console.log(`\n--- Results ---`);
  console.log(`Applied:        ${applied}`);
  console.log(`Batch errors:   ${batchErrors}`);
  console.log(`Total time:     ${totalElapsed.toFixed(1)}s`);
  console.log(`Avg rate:       ${(applied / totalElapsed).toFixed(0)} rows/sec`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
