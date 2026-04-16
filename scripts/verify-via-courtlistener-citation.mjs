/**
 * Verify Case Law via CourtListener Citation-Lookup Endpoint
 *
 * Uses CourtListener's dedicated /api/rest/v4/citation-lookup/ POST endpoint
 * which is more accurate than the search endpoint. It takes a citation string
 * and returns the matching cluster + permanent URL.
 *
 * For each row in statute_case_law that doesn't have a CourtListener cluster_id:
 *   1. POST citation to /api/rest/v4/citation-lookup/
 *   2. If found: store cluster_id + URL in source_urls[], bump confidence_score
 *   3. If NOT found AND no other verification: DELETE
 *
 * Rate-limited at 1.5s/request to be polite. Different endpoint than search, so
 * safe to run alongside legal-research-all.mjs and classify-case-law.mjs.
 *
 * Usage:
 *   node scripts/verify-via-courtlistener-citation.mjs              # All rows
 *   node scripts/verify-via-courtlistener-citation.mjs --limit 500
 *   node scripts/verify-via-courtlistener-citation.mjs --dry-run
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const FETCH_DELAY_MS = 1500;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;

// Read tokens
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
);
let supabaseToken = null;
for (const line of parentEnv.split("\n")) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    supabaseToken = line.slice(22).trim();
  }
}

const webEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, ".env.local"), "utf8"
);
let clToken = null;
for (const line of webEnv.split("\n")) {
  if (line.startsWith("COURTLISTENER_TOKEN=")) {
    clToken = line.slice(20).trim();
  }
}

if (!supabaseToken) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }
if (!clToken) { console.error("Missing COURTLISTENER_TOKEN in .env.local"); process.exit(1); }

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

function clCitationLookup(citation) {
  return new Promise((resolve, reject) => {
    const data = `text=${encodeURIComponent(citation)}`;
    const req = https.request({
      hostname: "www.courtlistener.com",
      path: "/api/rest/v4/citation-lookup/",
      method: "POST",
      headers: {
        Authorization: `Token ${clToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(data),
        "User-Agent": "INAA-Legal-Research/1.0",
      },
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        } else if (res.statusCode === 429) {
          reject(new Error("RATE_LIMIT"));
        } else {
          resolve(null);
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log("=== CourtListener Citation-Lookup Verification ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}, Limit: ${limit}\n`);

  // Find rows that don't have a CL cluster_id yet
  const rows = await supabaseQuery(
    `SELECT id, case_name, citation, courtlistener_cluster_id, source_urls
     FROM statute_case_law
     WHERE courtlistener_cluster_id IS NULL
     LIMIT ${limit}`
  );

  console.log(`${rows.length} rows without CourtListener cluster_id\n`);

  const stats = { verified: 0, notFound: 0, deleted: 0, errors: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.citation) {
      stats.errors++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${rows.length}] ${row.citation.slice(0, 50)} ... `);

    let result;
    try {
      result = await clCitationLookup(row.citation);
    } catch (err) {
      if (err.message === "RATE_LIMIT") {
        console.log("RATE LIMIT, stopping");
        break;
      }
      console.log(`ERR: ${err.message}`);
      stats.errors++;
      await sleep(FETCH_DELAY_MS);
      continue;
    }

    // Citation lookup returns array of matches; pick the first cluster
    const matches = Array.isArray(result) ? result : [];
    let cluster = null;
    for (const m of matches) {
      if (m.clusters && m.clusters.length > 0) {
        cluster = m.clusters[0];
        break;
      }
    }

    if (cluster && cluster.id) {
      const clusterUrl = `https://www.courtlistener.com${cluster.absolute_url || `/opinion/${cluster.id}/`}`;
      const apiUrl = `https://www.courtlistener.com/api/rest/v4/clusters/${cluster.id}/`;
      const realName = cluster.case_name || cluster.case_name_short || "?";
      console.log(`VERIFIED: ${realName.slice(0, 50)}`);
      stats.verified++;

      if (!dryRun) {
        try {
          await supabaseQuery(
            `UPDATE statute_case_law SET
              courtlistener_cluster_id = ${esc(String(cluster.id))},
              source_urls = array_cat(COALESCE(source_urls, '{}'), ${esc(`{"${apiUrl}","${clusterUrl}"}`)}::text[]),
              confidence_score = LEAST(1.00, COALESCE(confidence_score, 0) + 0.30)
             WHERE id = ${esc(row.id)}`
          );
        } catch (err) {
          console.log(`  DB err: ${err.message}`);
        }
      }
    } else {
      // Not found in CL. Check if any other verification exists.
      const hasOther = (row.source_urls || []).some(u =>
        u.includes("static.case.law") || u.includes("law.cornell.edu/supremecourt")
      );
      if (!hasOther) {
        console.log("NOT_FOUND + no other sources -> DELETE");
        stats.deleted++;
        if (!dryRun) {
          try {
            await supabaseQuery(`DELETE FROM statute_case_law WHERE id = ${esc(row.id)}`);
          } catch (err) {
            console.log(`  DB err: ${err.message}`);
          }
        }
      } else {
        console.log("NOT_FOUND (kept, has other sources)");
        stats.notFound++;
      }
    }

    await sleep(FETCH_DELAY_MS);
  }

  console.log("\n=== RESULTS ===");
  console.log(`Verified via CL lookup : ${stats.verified}`);
  console.log(`Not found              : ${stats.notFound} (kept)`);
  console.log(`Deleted                : ${stats.deleted} (no verification anywhere)`);
  console.log(`Errors                 : ${stats.errors}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
