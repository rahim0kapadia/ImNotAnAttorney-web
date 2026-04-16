/**
 * Pipeline Status Monitor
 *
 * Quick read-only check of how the verification pipeline is progressing.
 * Safe to run anytime, only does SELECTs, never modifies data.
 *
 * Usage:
 *   node scripts/pipeline-status.mjs           # One-shot snapshot
 *   node scripts/pipeline-status.mjs --watch   # Refresh every 30 seconds
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const watch = process.argv.includes("--watch");

// Read token from parent repo
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

function pad(s, n) { return String(s).padEnd(n); }
function bar(pct, width = 30) {
  const filled = Math.round((pct / 100) * width);
  return "[" + "#".repeat(filled) + " ".repeat(width - filled) + "]";
}

async function snapshot() {
  console.log("\n" + "=".repeat(70));
  console.log("  INAA PIPELINE STATUS, " + new Date().toISOString());
  console.log("=".repeat(70));

  // Statutes
  const statRows = await supabaseQuery(
    "SELECT count(*) as total, count(CASE WHEN confidence_score > 0 THEN 1 END) as verified, count(CASE WHEN verified_at IS NOT NULL THEN 1 END) as ever_verified, count(CASE WHEN prosecution_strengths != '{}' THEN 1 END) as has_enrichment FROM jurisdiction_statutes"
  );
  const s = statRows[0] || {};
  const sTotal = s.total || 0;
  const sVerifiedPct = sTotal ? Math.round((s.verified / sTotal) * 100) : 0;
  const sEnrichedPct = sTotal ? Math.round((s.has_enrichment / sTotal) * 100) : 0;

  console.log("\nSTATUTE DATA");
  console.log(`  Total in DB         : ${pad(sTotal, 6)} ${bar(100)}`);
  console.log(`  URL-verified        : ${pad(s.verified, 6)} ${bar(sVerifiedPct)} ${sVerifiedPct}%`);
  console.log(`  Ever verified       : ${pad(s.ever_verified, 6)}`);
  console.log(`  Enriched (3 arrays) : ${pad(s.has_enrichment, 6)} ${bar(sEnrichedPct)} ${sEnrichedPct}%`);

  // Case Law
  const clRows = await supabaseQuery(
    "SELECT count(*) as total, count(CASE WHEN is_good_law IS TRUE THEN 1 END) as good_law, count(CASE WHEN is_good_law IS FALSE THEN 1 END) as bad_law, count(CASE WHEN is_good_law IS NULL THEN 1 END) as unverified, count(CASE WHEN negative_treatment_checked_at IS NOT NULL THEN 1 END) as checked, count(CASE WHEN party_side = 'DEFENSE' THEN 1 END) as defense, count(CASE WHEN party_side = 'PROSECUTION' THEN 1 END) as prosecution, count(CASE WHEN party_side = 'NEUTRAL' THEN 1 END) as neutral, count(CASE WHEN party_side = 'UNKNOWN' OR party_side IS NULL THEN 1 END) as unclassified, count(CASE WHEN array_length(source_urls, 1) > 0 THEN 1 END) as has_urls FROM statute_case_law"
  );
  const c = clRows[0] || {};
  const cTotal = c.total || 0;
  const cCheckedPct = cTotal ? Math.round((c.checked / cTotal) * 100) : 0;
  const cClassifiedPct = cTotal ? Math.round(((cTotal - c.unclassified) / cTotal) * 100) : 0;
  const cUrlsPct = cTotal ? Math.round((c.has_urls / cTotal) * 100) : 0;

  console.log("\nCASE LAW");
  console.log(`  Total rows              : ${pad(cTotal, 6)}`);
  console.log(`  Negative treatment check: ${pad(c.checked, 6)} ${bar(cCheckedPct)} ${cCheckedPct}%`);
  console.log(`  Classified (party_side) : ${pad(cTotal - c.unclassified, 6)} ${bar(cClassifiedPct)} ${cClassifiedPct}%`);
  console.log(`  Has source_urls         : ${pad(c.has_urls, 6)} ${bar(cUrlsPct)} ${cUrlsPct}%`);
  console.log("");
  console.log(`  GOOD LAW (verified)     : ${pad(c.good_law, 6)}`);
  console.log(`  BAD LAW (overruled)     : ${pad(c.bad_law, 6)}`);
  console.log(`  UNVERIFIED (NULL)       : ${pad(c.unverified, 6)}`);
  console.log("");
  console.log(`  DEFENSE-favorable       : ${pad(c.defense, 6)}`);
  console.log(`  PROSECUTION-favorable   : ${pad(c.prosecution, 6)}`);
  console.log(`  NEUTRAL                 : ${pad(c.neutral, 6)}`);
  console.log(`  UNCLASSIFIED            : ${pad(c.unclassified, 6)}`);

  // Per-jurisdiction breakdown
  const jRows = await supabaseQuery(
    "SELECT jurisdiction, count(*) as total, count(CASE WHEN confidence_score > 0 THEN 1 END) as verified FROM jurisdiction_statutes GROUP BY jurisdiction ORDER BY jurisdiction"
  );
  console.log("\nPER-JURISDICTION VERIFICATION");
  for (const j of jRows) {
    const pct = j.total ? Math.round((j.verified / j.total) * 100) : 0;
    const status = pct === 100 ? "OK" : pct === 0 ? "  " : "..";
    console.log(`  ${pad(j.jurisdiction, 8)} ${pad(j.verified + "/" + j.total, 10)} ${bar(pct, 20)} ${pct}%  ${status}`);
  }

  // Recent activity
  const recentRows = await supabaseQuery(
    "SELECT count(*) as recent FROM statute_case_law WHERE negative_treatment_checked_at > now() - interval '5 minutes'"
  );
  const recent = (recentRows[0] || {}).recent || 0;
  console.log("\nRECENT ACTIVITY (last 5 minutes)");
  console.log(`  Cases verified        : ${recent}`);
  if (recent > 0) {
    console.log(`  Rate                  : ~${Math.round(recent / 5)} cases/minute`);
    if (c.unverified > 0) {
      const minsLeft = Math.round(c.unverified / Math.max(1, recent / 5));
      const hoursLeft = Math.round(minsLeft / 60 * 10) / 10;
      console.log(`  Est. time remaining   : ${hoursLeft} hours (${minsLeft} minutes)`);
    }
  }

  console.log("\n" + "=".repeat(70));
}

async function main() {
  if (!supabaseToken) {
    console.error("Missing SUPABASE_ACCESS_TOKEN");
    process.exit(1);
  }

  if (watch) {
    console.log("Watching pipeline status, refresh every 30s. Ctrl+C to stop.");
    while (true) {
      try { await snapshot(); } catch (e) { console.error("Error:", e.message); }
      await new Promise(r => setTimeout(r, 30000));
    }
  } else {
    await snapshot();
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
