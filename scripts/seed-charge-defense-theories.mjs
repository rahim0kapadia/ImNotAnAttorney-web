/**
 * Seed charge_defense_theories from JSON mapping file.
 * Source: data/defense-intelligence/charge-defense-theories.json
 *
 * Usage:
 *   node scripts/seed-charge-defense-theories.mjs              # Dry-run (print SQL)
 *   node scripts/seed-charge-defense-theories.mjs --apply      # Insert into DB
 *   node scripts/seed-charge-defense-theories.mjs --apply --clear  # Clear + re-insert
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const clearFirst = args.includes("--clear");

// Load SUPABASE_ACCESS_TOKEN from parent repo
let supabaseToken = null;
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
);
for (const line of parentEnv.split("\n")) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    const eqIdx = line.indexOf("=");
    supabaseToken = line.slice(eqIdx + 1).trim();
    break;
  }
}
if (!supabaseToken) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

function supabaseQuery(sql) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: "/v1/projects/" + PROJECT_REF + "/database/query",
      method: "POST",
      headers: {
        Authorization: "Bearer " + supabaseToken,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, function (res) {
      let data = "";
      res.on("data", function (d) { data += d; });
      res.on("end", function () {
        if (res.statusCode >= 400) reject(new Error("SQL " + res.statusCode + ": " + data.slice(0, 300)));
        else { try { resolve(JSON.parse(data)); } catch (e) { resolve(data); } }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("'").join("''") + "'";
}

function escArray(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map(function (s) {
    const inner = String(s).split("\\").join("\\\\").split('"').join('\\"');
    return '"' + inner + '"';
  });
  return "'{" + items.join(",") + "}'::text[]";
}

// Load JSON mapping
const jsonPath = path.join(PROJECT_ROOT, "data", "defense-intelligence", "charge-defense-theories.json");
const charges = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

// Build SQL
const statements = [];
if (clearFirst) {
  statements.push("DELETE FROM charge_defense_theories;");
}

let totalEntries = 0;
for (const charge of charges) {
  for (const theory of charge.theories) {
    totalEntries++;
    statements.push(
      "INSERT INTO charge_defense_theories (charge_slug, theory_name, theory_keywords, motion_types) VALUES (" +
      esc(charge.charge_slug) + ", " +
      esc(theory.theory_name) + ", " +
      escArray(theory.theory_keywords) + ", " +
      escArray(theory.motion_types) +
      ") ON CONFLICT (charge_slug, theory_name) DO UPDATE SET " +
      "theory_keywords = EXCLUDED.theory_keywords, " +
      "motion_types = EXCLUDED.motion_types, " +
      "updated_at = now();"
    );
  }
}

const sql = statements.join("\n");

console.log("Charge types: " + charges.length);
console.log("Total theory entries: " + totalEntries);
console.log("SQL statements: " + statements.length);

if (!applyMode) {
  // Write SQL to file for review
  const outPath = path.join(PROJECT_ROOT, "data", "defense-intelligence", "seed-theories.sql");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sql);
  console.log("\nSQL written to: " + outPath);
  console.log("Run with --apply to insert into DB.");
} else {
  console.log("\nApplying to database...");
  try {
    const result = await supabaseQuery(sql);
    console.log("Applied successfully.");

    // Verify count
    const countResult = await supabaseQuery(
      "SELECT count(*) as cnt FROM charge_defense_theories"
    );
    const count = countResult[0]?.cnt || countResult[0]?.count || "unknown";
    console.log("Rows in charge_defense_theories: " + count);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}
