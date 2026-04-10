/**
 * Bulk Good-Law Verification by Cluster — API-loop optimization
 *
 * Replaces classify-case-law.mjs's row-by-row API loop with a cluster-based one.
 * Multiple statute_case_law rows can share a courtlistener_cluster_id (typically
 * 4:1 ratio). The old script makes 30+ API calls per ROW. This script makes the
 * same calls per CLUSTER, then updates ALL rows with that cluster in one statement.
 *
 * Result: ~4x fewer API calls, same coverage, same accuracy.
 *
 * Steps per cluster:
 *   1. Search citing opinions: /api/rest/v4/search/?type=o&cites=<cluster_id>
 *   2. For each citing opinion, fetch its plain_text
 *   3. Scan for negative treatment signals (overruled, abrogated, superseded, ...)
 *   4. UPDATE statute_case_law SET is_good_law = ?, source_urls = array_cat(...)
 *      WHERE courtlistener_cluster_id = <cluster_id>
 *
 * Usage:
 *   node scripts/bulk-good-law-by-cluster.mjs                # All NULL clusters
 *   node scripts/bulk-good-law-by-cluster.mjs --limit 100    # First N clusters
 *   node scripts/bulk-good-law-by-cluster.mjs --dry-run      # Stats only
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const CL_DELAY_MS = 750;

// Tokens
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
const webEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, ".env.local"), "utf8"
);
let clToken = null;
for (const line of webEnv.split("\n")) {
  if (line.startsWith("COURTLISTENER_TOKEN=")) {
    clToken = line.slice(20).trim();
    break;
  }
}
if (!supabaseToken || !clToken) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or COURTLISTENER_TOKEN");
  process.exit(1);
}

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;

// ── SQL Helpers ─────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArrayLiteral(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map((s) => {
    const inner = String(s).split('\\').join('\\\\').split('"').join('\\"');
    return `"${inner}"`;
  });
  const literal = `{${items.join(",")}}`;
  return `'${literal.split("'").join("''")}'::text[]`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── HTTP ────────────────────────────────────────────────────────────────────

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
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
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

function clFetch(urlPath) {
  return new Promise((resolve, reject) => {
    https.get(`https://www.courtlistener.com${urlPath}`, {
      headers: {
        Authorization: `Token ${clToken}`,
        "User-Agent": "INAA-Legal-Research/1.0",
      },
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
        } else {
          reject(new Error(`CL ${res.statusCode}`));
        }
      });
    }).on("error", reject);
  });
}

// ── HTML strip (no regex on content) ────────────────────────────────────────

function stripHtml(html) {
  if (!html) return "";
  const parts = html.split("<");
  const textParts = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const closeIdx = part.indexOf(">");
    if (closeIdx >= 0) {
      textParts.push(part.slice(closeIdx + 1));
    } else {
      textParts.push(part);
    }
  }
  return textParts.join("").trim();
}

// ── Negative Treatment Check ────────────────────────────────────────────────

const NEGATIVE_TREATMENT_SIGNALS = [
  "overruled", "overrule ", "overruling",
  "abrogated", "abrogating", "abrogate ",
  "superseded", "supersede ", "superseding",
  "receded from", "recede from",
  "no longer good law", "is no longer the law",
  "rejecting the holding", "expressly disapproved",
  "we disapprove",
];

async function checkNegativeTreatment(clusterId) {
  const checkedUrls = [];
  try {
    const searchUrl = `https://www.courtlistener.com/api/rest/v4/search/?type=o&cites=${clusterId}&order_by=dateFiled+desc&page_size=20`;
    checkedUrls.push(searchUrl);
    const result = await clFetch(`/api/rest/v4/search/?type=o&cites=${clusterId}&order_by=dateFiled+desc&page_size=20`);
    const citingOps = result.results || [];

    if (citingOps.length === 0) {
      return { isGoodLaw: null, treatment: null, checkedUrls };
    }

    for (const citingOp of citingOps) {
      const citingClusterId = citingOp.cluster_id;
      if (!citingClusterId) continue;

      try {
        const clusterUrl = `https://www.courtlistener.com/api/rest/v4/clusters/${citingClusterId}/`;
        checkedUrls.push(clusterUrl);
        const cluster = await clFetch(`/api/rest/v4/clusters/${citingClusterId}/?fields=sub_opinions`);
        const opUrls = cluster.sub_opinions || [];
        if (opUrls.length === 0) continue;

        const opPath = opUrls[0].split("https://www.courtlistener.com").join("");
        const opFullUrl = `https://www.courtlistener.com${opPath}`;
        checkedUrls.push(opFullUrl);
        const opinion = await clFetch(`${opPath}?fields=plain_text,html_with_citations`);
        const rawText = opinion.plain_text || stripHtml(opinion.html_with_citations || "");
        const lower = rawText.toLowerCase();

        for (const signal of NEGATIVE_TREATMENT_SIGNALS) {
          if (lower.includes(signal)) {
            const idx = lower.indexOf(signal);
            const context = rawText.slice(Math.max(0, idx - 200), idx + 200);
            return {
              isGoodLaw: false,
              treatment: `${signal}: "${context.split(/\s+/).join(" ").trim().slice(0, 400)}"`,
              checkedUrls,
            };
          }
        }
        await sleep(CL_DELAY_MS);
      } catch {
        continue;
      }
    }

    return { isGoodLaw: true, treatment: null, checkedUrls };
  } catch {
    return { isGoodLaw: null, treatment: null, checkedUrls };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK GOOD-LAW BY CLUSTER (API loop, 4x faster) ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}, Limit: ${limit}\n`);

  // Get UNIQUE cluster IDs that need is_good_law verification
  // Check ALL clusters not yet verified by THIS method (negative_treatment_checked_at),
  // not just those with is_good_law IS NULL. Every source should verify independently.
  console.log("Querying unique cluster IDs not yet checked via API negative treatment...");
  const rows = await supabaseQuery(
    `SELECT DISTINCT courtlistener_cluster_id
     FROM statute_case_law
     WHERE negative_treatment_checked_at IS NULL
       AND courtlistener_cluster_id IS NOT NULL
     ORDER BY courtlistener_cluster_id
     LIMIT ${limit}`
  );

  console.log(`${rows.length} unique clusters to verify\n`);

  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Get a count of rows that will be affected
  const countRes = await supabaseQuery(
    `SELECT COUNT(*) AS total FROM statute_case_law
     WHERE negative_treatment_checked_at IS NULL AND courtlistener_cluster_id IS NOT NULL`
  );
  const totalRows = parseInt(countRes[0].total, 10);
  const expansionRatio = (totalRows / rows.length).toFixed(1);
  console.log(`Total rows that will be touched: ~${totalRows} (${expansionRatio}:1 expansion per cluster)\n`);

  if (dryRun) {
    console.log(`Estimated time at 8 sec per cluster: ~${Math.ceil(rows.length * 8 / 60)} minutes`);
    console.log(`Equivalent row-based time: ~${Math.ceil(totalRows * 8 / 60)} minutes`);
    console.log("\nDry run complete.");
    return;
  }

  // Process clusters
  const stats = { good: 0, bad: 0, unverified: 0, errors: 0 };
  const startTime = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const clusterId = rows[i].courtlistener_cluster_id;
    const elapsed = (Date.now() - startTime) / 1000;
    const eta = i > 0 ? Math.round((elapsed / i) * (rows.length - i)) : 0;
    process.stdout.write(`[${i + 1}/${rows.length}] cluster ${clusterId} (eta ${eta}s)... `);

    let result;
    try {
      result = await checkNegativeTreatment(clusterId);
    } catch (e) {
      console.log(`ERROR: ${e.message.slice(0, 80)}`);
      stats.errors++;
      continue;
    }

    const isGoodLawSql =
      result.isGoodLaw === null ? "NULL" :
      result.isGoodLaw ? "true" : "false";

    const tag =
      result.isGoodLaw === false ? "BAD LAW" :
      result.isGoodLaw === true ? "GOOD LAW" : "UNVERIFIED";
    console.log(tag + (result.treatment ? " — " + result.treatment.slice(0, 60) : ""));

    if (result.isGoodLaw === true) stats.good++;
    else if (result.isGoodLaw === false) stats.bad++;
    else stats.unverified++;

    // Update ALL rows for this cluster in one statement
    try {
      const verificationUrls = [];
      if (clusterId) verificationUrls.push(`https://www.courtlistener.com/api/rest/v4/clusters/${clusterId}/`);
      for (const u of result.checkedUrls || []) {
        if (!verificationUrls.includes(u)) verificationUrls.push(u);
      }

      const sourceUrlsSql = verificationUrls.length > 0
        ? `source_urls = array_cat(COALESCE(source_urls, '{}'::text[]), ${escArrayLiteral(verificationUrls)})`
        : `source_urls = source_urls`;

      const treatmentSql = result.treatment
        ? `, negative_treatment = ${esc(result.treatment.slice(0, 500))}, negative_treatment_checked_at = NOW()`
        : `, negative_treatment_checked_at = NOW()`;

      const sql =
        `UPDATE statute_case_law SET ` +
        `is_good_law = ${isGoodLawSql}, ` +
        `${sourceUrlsSql}, ` +
        `verified_at = NOW()` +
        `${treatmentSql} ` +
        `WHERE courtlistener_cluster_id = ${esc(clusterId)} AND negative_treatment_checked_at IS NULL;`;

      await supabaseQuery(sql);
    } catch (e) {
      console.error(`  DB update error: ${e.message.slice(0, 100)}`);
    }

    // Pace
    await sleep(CL_DELAY_MS);
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\n--- Results ---`);
  console.log(`Clusters processed: ${rows.length}`);
  console.log(`Good law:           ${stats.good}`);
  console.log(`Bad law:            ${stats.bad}`);
  console.log(`Unverified:         ${stats.unverified}`);
  console.log(`Errors:             ${stats.errors}`);
  console.log(`Total time:         ${(totalTime / 60).toFixed(1)} min`);
  console.log(`Avg per cluster:    ${(totalTime / rows.length).toFixed(1)} sec`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
