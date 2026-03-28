/**
 * Load jurisdiction statute JSON files into Supabase via Management API.
 * Reads data/charge-taxonomy/{FL,GA,...}.json and INSERTs into jurisdiction_statutes.
 *
 * Usage: node scripts/load-jurisdiction-data.mjs [state-code]
 *   Without args: loads all available JSON files
 *   With arg: loads only that state (e.g., "FL")
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data", "charge-taxonomy");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

// Read access token from parent project .env.local
const envPath = path.resolve(__dirname, "..", "..", "ImNotAnAttorney", ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const tokenMatch = envContent.match(/SUPABASE_ACCESS_TOKEN=([^\r\n]+)/);
if (!tokenMatch) {
  console.error("SUPABASE_ACCESS_TOKEN not found in", envPath);
  process.exit(1);
}
const TOKEN = tokenMatch[1];

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).replace(/'/g, "''")}'`;
}

function escArray(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const items = arr.map((s) => `"${String(s).replace(/"/g, '\\"').replace(/'/g, "''")}"`);
  return `'{${items.join(",")}}'`;
}

function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`SQL failed (${res.statusCode}): ${body.slice(0, 300)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function loadJurisdiction(code) {
  const filepath = path.join(DATA_DIR, `${code}.json`);
  if (!fs.existsSync(filepath)) {
    console.log(`  ${code}: no JSON file, skipping`);
    return 0;
  }

  let statutes;
  try {
    statutes = JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch (e) {
    console.error(`  ${code}: invalid JSON`, e.message);
    return 0;
  }

  if (!Array.isArray(statutes) || statutes.length === 0) {
    console.log(`  ${code}: empty array, skipping`);
    return 0;
  }

  const values = statutes.map((s) => {
    return `(${esc(s.common_charge_slug)}, ${esc(code)}, ${esc(s.statute_number ?? null)}, ${esc(s.statute_title ?? null)}, ${esc(s.offense_class ?? null)}, ${esc(s.penalty_min ?? null)}, ${esc(s.penalty_max ?? null)}, ${esc(s.fine_max ?? null)}, ${escArray(s.elements ?? [])}, ${esc(s.mandatory_minimum ?? null)}, ${escArray(s.enhancements ?? [])}, ${esc(s.notes ?? null)})`;
  });

  const sql = `INSERT INTO jurisdiction_statutes (common_charge_slug, jurisdiction, statute_number, statute_title, offense_class, penalty_min, penalty_max, fine_max, elements, mandatory_minimum, enhancements, notes)
VALUES
${values.join(",\n")}
ON CONFLICT (common_charge_slug, jurisdiction) DO UPDATE SET
  statute_number = EXCLUDED.statute_number,
  statute_title = EXCLUDED.statute_title,
  offense_class = EXCLUDED.offense_class,
  penalty_min = EXCLUDED.penalty_min,
  penalty_max = EXCLUDED.penalty_max,
  fine_max = EXCLUDED.fine_max,
  elements = EXCLUDED.elements,
  mandatory_minimum = EXCLUDED.mandatory_minimum,
  enhancements = EXCLUDED.enhancements,
  notes = EXCLUDED.notes;`;

  await runSQL(sql);
  console.log(`  ${code}: ${statutes.length} statutes loaded`);
  return statutes.length;
}

async function main() {
  const targetCode = process.argv[2];

  if (targetCode) {
    console.log(`Loading jurisdiction: ${targetCode}`);
    const count = await loadJurisdiction(targetCode);
    console.log(`Done. ${count} statutes loaded.`);
    return;
  }

  // Load all available JSON files
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json") && f !== "questions.json");
  console.log(`Found ${files.length} jurisdiction files`);

  let total = 0;
  for (const file of files) {
    const code = file.replace(".json", "");
    try {
      const count = await loadJurisdiction(code);
      total += count;
    } catch (e) {
      console.error(`  ${code}: FAILED`, e.message);
    }
  }

  console.log(`\nTotal: ${total} statutes loaded across ${files.length} jurisdictions`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
