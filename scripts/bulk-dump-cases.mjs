/**
 * Bulk Dump, Export all verified_case_law rows to local JSON
 *
 * Single Supabase Management API query. Writes to data/bulk-verify/.
 * Zero rate limit risk, one query, one response.
 *
 * Usage:
 *   node scripts/bulk-dump-cases.mjs
 *   node scripts/bulk-dump-cases.mjs --output path/to/output.json
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");

// CLI
const args = process.argv.slice(2);
const outputIdx = args.indexOf("--output");
const outputPath = outputIdx >= 0 ? path.resolve(args[outputIdx + 1]) : DEFAULT_OUTPUT;

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
if (!supabaseToken) {
  console.error("ERROR: SUPABASE_ACCESS_TOKEN not found in parent .env.local");
  process.exit(1);
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

async function main() {
  console.log("=== BULK DUMP: case_law ===\n");

  const sql = `SELECT id, case_name, citation, court, year,
    holding, is_good_law, courtlistener_cluster_id,
    verified_at, jurisdiction
  FROM case_law
  ORDER BY created_at`;

  console.log("Querying Supabase...");
  const rows = await supabaseQuery(sql);

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("No rows found in case_law.");
    process.exit(0);
  }

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2));

  // Stats
  const total = rows.length;
  const withCitation = rows.filter(r => r.citation && r.citation.trim()).length;
  const missingCitation = total - withCitation;
  const verified = rows.filter(r => r.is_good_law === true).length;
  const badLaw = rows.filter(r => r.is_good_law === false).length;
  const unverified = rows.filter(r => r.is_good_law === null).length;
  const withClusterId = rows.filter(r => r.courtlistener_cluster_id).length;
  const withJurisdiction = rows.filter(r => r.jurisdiction && r.jurisdiction.trim()).length;
  const needsVerification = rows.filter(r => r.is_good_law === null && r.citation).length;

  console.log(`\nDumped to: ${outputPath}`);
  console.log(`\n--- Stats ---`);
  console.log(`Total rows:              ${total}`);
  console.log(`With citation:           ${withCitation}`);
  console.log(`Missing citation:        ${missingCitation}`);
  console.log(`Verified (good law):     ${verified}`);
  console.log(`Bad law (overruled):     ${badLaw}`);
  console.log(`Unverified (null):       ${unverified}`);
  console.log(`With CL cluster ID:      ${withClusterId}`);
  console.log(`With jurisdiction:       ${withJurisdiction}`);
  console.log(`Needs verification:      ${needsVerification}`);
  console.log(`\nFile size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
