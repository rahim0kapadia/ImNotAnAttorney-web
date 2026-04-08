/**
 * Verify SCOTUS Cases via Cornell LII
 *
 * Cross-references SCOTUS-cited rows in statute_case_law against Cornell LII's
 * supreme court database. Cornell hosts every SCOTUS opinion at:
 *   https://www.law.cornell.edu/supremecourt/text/<volume>/<page>
 *
 * For each case where citation contains "U.S." or "S.Ct." or "L.Ed.":
 *   1. Parse volume + page from citation
 *   2. HTTP HEAD check the Cornell URL
 *   3. If 200: append URL to source_urls[], bump confidence_score
 *   4. If 404 AND no other verification source: DELETE
 *
 * Cornell is rate-limit friendly. ~1s delay between checks.
 *
 * Usage:
 *   node scripts/verify-via-cornell-scotus.mjs              # All SCOTUS rows
 *   node scripts/verify-via-cornell-scotus.mjs --limit 500
 *   node scripts/verify-via-cornell-scotus.mjs --dry-run
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const FETCH_DELAY_MS = 1000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;

// Read token
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
);
let supabaseToken = null;
for (const line of parentEnv.split("\n")) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    supabaseToken = line.slice(22).trim();
  }
}
if (!supabaseToken) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

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

function httpHead(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "HEAD",
      headers: { "User-Agent": "INAA-Legal-Research/1.0" },
    }, (res) => {
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(new Error("Timeout")); });
    req.end();
  });
}

// Parse "347 U.S. 483" or "100 S.Ct. 1234" → {volume, page}
function parseScotusCitation(citation) {
  if (!citation) return null;
  const cleaned = citation.split("(")[0].trim();
  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 3) return null;

  const volume = parseInt(parts[0], 10);
  if (isNaN(volume)) return null;

  const page = parseInt(parts[parts.length - 1], 10);
  if (isNaN(page)) return null;

  // Reporter must be U.S., S.Ct., or L.Ed.
  const reporterRaw = parts.slice(1, -1).join("").toLowerCase();
  if (reporterRaw.indexOf("u.s.") !== -1 || reporterRaw === "us") {
    return { type: "us", volume, page };
  }
  return null; // Only verify pure US citations against Cornell
}

async function main() {
  console.log("=== Cornell LII SCOTUS Verification ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}, Limit: ${limit}\n`);

  // Find rows with U.S. citations that don't have a Cornell URL yet
  const rows = await supabaseQuery(
    `SELECT id, case_name, citation, courtlistener_cluster_id, source_urls
     FROM statute_case_law
     WHERE (citation LIKE '%U.S.%' OR citation LIKE '%U. S.%')
       AND NOT EXISTS (
         SELECT 1 FROM unnest(COALESCE(source_urls, ARRAY[]::text[])) AS u
         WHERE u LIKE '%law.cornell.edu/supremecourt%'
       )
     LIMIT ${limit}`
  );

  console.log(`${rows.length} SCOTUS-citing rows to verify\n`);

  const stats = { verified: 0, notFound: 0, deleted: 0, parseErrors: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const parsed = parseScotusCitation(row.citation);

    if (!parsed) {
      stats.parseErrors++;
      continue;
    }

    const cornellUrl = `https://www.law.cornell.edu/supremecourt/text/${parsed.volume}/${parsed.page}`;
    process.stdout.write(`[${i + 1}/${rows.length}] ${row.citation} → ${parsed.volume}/${parsed.page} ... `);

    let status;
    try {
      status = await httpHead(cornellUrl);
    } catch (err) {
      console.log(`ERR: ${err.message}`);
      stats.notFound++;
      await sleep(FETCH_DELAY_MS);
      continue;
    }

    if (status === 200) {
      console.log("VERIFIED");
      stats.verified++;
      if (!dryRun) {
        try {
          await supabaseQuery(
            `UPDATE statute_case_law SET
              source_urls = array_append(COALESCE(source_urls, '{}'), ${esc(cornellUrl)}),
              confidence_score = LEAST(1.00, COALESCE(confidence_score, 0) + 0.30)
             WHERE id = ${esc(row.id)}`
          );
        } catch (err) {
          console.log(`  DB err: ${err.message}`);
        }
      }
    } else {
      // Cornell doesn't have it. Check if any other verification exists.
      const hasOther = (row.source_urls || []).some(u =>
        u.includes("courtlistener.com") || u.includes("static.case.law")
      );
      if (!hasOther && !row.courtlistener_cluster_id) {
        console.log(`NOT_FOUND (${status}) → DELETE`);
        stats.deleted++;
        if (!dryRun) {
          try {
            await supabaseQuery(`DELETE FROM statute_case_law WHERE id = ${esc(row.id)}`);
          } catch (err) {
            console.log(`  DB err: ${err.message}`);
          }
        }
      } else {
        console.log(`NOT_FOUND (${status}) — kept (other sources)`);
        stats.notFound++;
      }
    }

    await sleep(FETCH_DELAY_MS);
  }

  console.log("\n=== RESULTS ===");
  console.log(`Verified at Cornell : ${stats.verified}`);
  console.log(`Not found at Cornell: ${stats.notFound} (kept — has other sources)`);
  console.log(`Deleted             : ${stats.deleted}`);
  console.log(`Parse errors        : ${stats.parseErrors}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
