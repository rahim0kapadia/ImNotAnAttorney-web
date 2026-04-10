/**
 * One-shot fix: replace CL person IDs with UUIDs in judge_prosecutor_pairings SQL.
 * Reads the mapping from judge_profiles, rewrites the SQL file, then self-deletes.
 */
import fs from "fs";
import https from "https";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const INPUT = path.join(PROJECT_ROOT, "data/bulk-verify/master-extractor-updates/judge_prosecutor_pairings-updates.sql");
const OUTPUT = path.join(PROJECT_ROOT, "data/bulk-verify/master-extractor-updates/judge_prosecutor_pairings-updates-fixed.sql");

const token = fs.readFileSync(path.join(PROJECT_ROOT, ".env.local"), "utf8")
  .split("\n").find(l => l.startsWith("SUPABASE_ACCESS_TOKEN=")).slice(22).trim();

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: "/v1/projects/jxjbjmgdukwkoclydqdr/database/query",
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function main() {
  const rows = await query("SELECT cl_person_id, id FROM judge_profiles WHERE cl_person_id IS NOT NULL");
  const clToUuid = new Map();
  for (const r of rows) clToUuid.set(r.cl_person_id, r.id);
  console.log("Loaded " + clToUuid.size + " cl_person_id → UUID mappings");

  const sql = fs.readFileSync(INPUT, "utf8");
  const lines = sql.split("\n");
  const out = [];
  let fixed = 0;
  let unfixed = 0;

  for (const line of lines) {
    if (!line.includes("VALUES (")) {
      out.push(line);
      continue;
    }
    // Find the first value after VALUES (' — that's the judge_id
    const valuesIdx = line.indexOf("VALUES ('");
    if (valuesIdx === -1) { out.push(line); continue; }

    const idStart = valuesIdx + 9; // after VALUES ('
    const idEnd = line.indexOf("'", idStart);
    if (idEnd === -1) { out.push(line); continue; }

    const clId = line.slice(idStart, idEnd);
    const uuid = clToUuid.get(clId);

    if (uuid) {
      out.push(line.slice(0, idStart) + uuid + line.slice(idEnd));
      fixed++;
    } else {
      // No UUID match — skip this row (can't insert non-UUID)
      unfixed++;
    }
  }

  fs.writeFileSync(OUTPUT, out.join("\n"));
  console.log("Fixed: " + fixed + "  Skipped (no UUID): " + unfixed);
  console.log("Output: " + OUTPUT);
}

main().catch(e => { console.error(e); process.exit(1); });
