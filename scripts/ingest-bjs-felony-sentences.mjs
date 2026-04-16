/**
 * BJS Felony Sentences in State Courts → outcome_benchmarks
 *
 * Parses Bureau of Justice Statistics felony sentencing data into
 * national and state-level outcome benchmarks.
 *
 * Usage:
 *   node scripts/ingest-bjs-felony-sentences.mjs                 # Dry-run
 *   node scripts/ingest-bjs-felony-sentences.mjs --apply         # Apply to DB
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BJS_DIR = path.join(PROJECT_ROOT, "data", "external", "bjs");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function escapeSQLStr(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).split("'").join("''") + "'";
}

function toNum(s) {
  if (s === null || s === undefined || s === "" || isNaN(s)) return "NULL";
  return Number(s);
}

async function main() {
  if (!fs.existsSync(BJS_DIR)) {
    console.error("BJS data directory not found: " + BJS_DIR);
    console.error("Download from https://bjs.ojp.gov/topics/courts");
    process.exit(1);
  }

  const files = fs.readdirSync(BJS_DIR).filter(f => f.endsWith(".csv") || f.endsWith(".tsv"));
  if (files.length === 0) {
    console.error("No data files found in " + BJS_DIR);
    process.exit(1);
  }

  const sourceUrl = "https://bjs.ojp.gov/topics/courts";
  const sqlLines = [];

  for (const file of files) {
    console.log("Processing " + file + "...");
    const filePath = path.join(BJS_DIR, file);
    const delimiter = file.endsWith(".tsv") ? "\t" : ",";

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    let headers = null;
    for await (const line of rl) {
      if (!headers) {
        headers = line.split(delimiter).map(h => h.trim().toLowerCase());
        continue;
      }

      const values = line.split(delimiter).map(v => v.trim());
      const row = Object.fromEntries(headers.map((h, i) => [h, values[i]]));

      // Map BJS fields to our schema, field names vary by BJS publication
      // Implementer: adjust mappings based on actual BJS CSV column headers
      const jurisdiction = row.state || row.jurisdiction || "US";
      const level = jurisdiction === "US" ? "national" : "state";
      const offense = row.offense || row.offense_type || row.most_serious_offense || "all";
      const stateVal = level === "national" ? null : jurisdiction;

      sqlLines.push(
        "INSERT INTO outcome_benchmarks (jurisdiction_level, jurisdiction_name, state, offense_type, total_cases, conviction_rate, probation_rate, prison_rate, median_sentence_months, plea_rate, trial_rate, source_urls, sources, data_period)\n" +
        "VALUES (" + escapeSQLStr(level) + ", " + escapeSQLStr(jurisdiction) + ", " + escapeSQLStr(stateVal) + ", " + escapeSQLStr(offense) + ", " + toNum(row.total_cases || row.n) + ", " + toNum(row.conviction_rate) + ", " + toNum(row.probation_rate) + ", " + toNum(row.prison_rate) + ", " + toNum(row.median_sentence) + ", " + toNum(row.plea_rate) + ", " + toNum(row.trial_rate) + ", ARRAY[" + escapeSQLStr(sourceUrl) + "], ARRAY['bjs'], " + escapeSQLStr(row.year || "latest") + ")\n" +
        "ON CONFLICT (jurisdiction_level, jurisdiction_name, offense_type) DO UPDATE SET\n" +
        "  total_cases = COALESCE(EXCLUDED.total_cases, outcome_benchmarks.total_cases),\n" +
        "  conviction_rate = COALESCE(EXCLUDED.conviction_rate, outcome_benchmarks.conviction_rate),\n" +
        "  probation_rate = COALESCE(EXCLUDED.probation_rate, outcome_benchmarks.probation_rate),\n" +
        "  prison_rate = COALESCE(EXCLUDED.prison_rate, outcome_benchmarks.prison_rate),\n" +
        "  median_sentence_months = COALESCE(EXCLUDED.median_sentence_months, outcome_benchmarks.median_sentence_months),\n" +
        "  source_urls = EXCLUDED.source_urls,\n" +
        "  data_as_of = now();"
      );
    }
  }

  const sqlPath = path.join(OUTPUT_DIR, "bjs-felony-sentences-ingest.sql");
  fs.writeFileSync(sqlPath, sqlLines.join("\n\n") + "\n");
  console.log("Wrote " + sqlLines.length + " SQL statements to " + sqlPath);

  if (!dryRun) {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN"); process.exit(1); }
    const sql = fs.readFileSync(sqlPath, "utf8");
    const res = await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    console.log(res.ok ? "Applied successfully" : "Apply failed: " + (await res.text()).slice(0, 500));
    if (!res.ok) process.exit(1);

    await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = " + sqlLines.length + ", is_stale = false WHERE source_key = 'bjs_felony_sentences';" }),
    });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
