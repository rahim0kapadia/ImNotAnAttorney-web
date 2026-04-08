/**
 * Apply enrichment UPDATE statements in batches to avoid 413 payload too large.
 * Reads the generated migration, extracts UPDATE statements, sends in batches of 100.
 *
 * Usage: node scripts/apply-enrichment-batches.mjs
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 100;

// Read token
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
);
const lines = parentEnv.split("\n");
let supabaseToken = null;
for (const line of lines) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    supabaseToken = line.slice(22).trim();
    break;
  }
}
if (!supabaseToken) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

// Read migration file
const migrationFile = path.join(PROJECT_ROOT, "supabase", "migrations", "20260408_enrichment-and-case-law-data.sql");
const sql = fs.readFileSync(migrationFile, "utf8");

// Extract UPDATE statements (they end with a semicolon on a line by itself or after jurisdiction)
const updateStatements = [];
let current = "";
for (const line of sql.split("\n")) {
  if (line.startsWith("UPDATE jurisdiction_statutes SET")) {
    if (current) updateStatements.push(current);
    current = line;
  } else if (current) {
    current += "\n" + line;
    if (line.trimEnd().endsWith(";")) {
      updateStatements.push(current);
      current = "";
    }
  }
}
if (current) updateStatements.push(current);

console.log(`Found ${updateStatements.length} UPDATE statements`);
console.log(`Will send in ${Math.ceil(updateStatements.length / BATCH_SIZE)} batches of ${BATCH_SIZE}\n`);

function supabaseQuery(sqlQuery) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sqlQuery });
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
          resolve({ status: res.statusCode, body });
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

async function main() {
  let applied = 0;
  let errors = 0;

  for (let i = 0; i < updateStatements.length; i += BATCH_SIZE) {
    const batch = updateStatements.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(updateStatements.length / BATCH_SIZE);

    const batchSql = batch.join("\n");
    process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} UPDATEs, ${Math.round(batchSql.length / 1024)}KB)... `);

    try {
      await supabaseQuery(batchSql);
      applied += batch.length;
      console.log("OK");
    } catch (err) {
      errors += batch.length;
      console.log(`FAILED: ${err.message}`);
    }
  }

  console.log(`\nDone: ${applied} applied, ${errors} failed out of ${updateStatements.length} total`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
