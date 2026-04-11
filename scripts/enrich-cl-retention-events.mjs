/**
 * CourtListener Retention Events → judge_sentencing_patterns.retention_elections
 *
 * Fetches judicial retention election results for judges and writes them
 * to judge_sentencing_patterns as a JSONB array [{year, vote_pct, retained}].
 *
 * CL endpoint: GET /api/rest/v4/retention-events/?person={person_id}
 * Rate limit: 5K queries/hour — we have ~400 judges, well within limit.
 *
 * Usage:
 *   node scripts/enrich-cl-retention-events.mjs                # Dry-run
 *   node scripts/enrich-cl-retention-events.mjs --apply        # Apply
 *   node scripts/enrich-cl-retention-events.mjs --limit 10     # Test with 10 judges
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const CL_TOKEN = process.env.COURTLISTENER_TOKEN;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = "https://" + PROJECT_REF + ".supabase.co";

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function normalizeJudgeName(raw) {
  const trimmed = raw.trim().toLowerCase();
  const parts = trimmed.split(" ").filter(Boolean);
  const joined = parts.join(" ");
  const suffixes = ["jr", "sr", "iii", "ii", "iv", "jr.", "sr."];
  const words = joined.split(" ");
  while (words.length > 1 && suffixes.includes(words[words.length - 1].replace(",", ""))) {
    words.pop();
  }
  const result = words.join(" ");
  if (result.endsWith(",")) return result.slice(0, -1);
  return result;
}

function escapeSQLStr(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).split("'").join("''") + "'";
}

async function clFetch(endpoint) {
  const url = endpoint.startsWith("http") ? endpoint : "https://www.courtlistener.com" + endpoint;
  const res = await fetch(url, {
    headers: { Authorization: "Token " + CL_TOKEN },
  });
  if (!res.ok) throw new Error("CL " + res.status + ": " + url);
  return res.json();
}

async function main() {
  if (!CL_TOKEN) { console.error("Set COURTLISTENER_TOKEN in .env.local"); process.exit(1); }
  if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }

  // Fetch judges from judge_profiles (which has CL person IDs)
  const judgesRes = await fetch(SUPABASE_URL + "/rest/v1/judge_profiles?select=id,name,courtlistener_person_id&order=name", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
  });
  const judges = await judgesRes.json();
  console.log("Found " + judges.length + " judges in judge_profiles");

  const sqlLines = [];
  let enriched = 0;
  let skipped = 0;
  let noEvents = 0;

  for (const judge of judges.slice(0, limit)) {
    if (!judge.courtlistener_person_id) {
      // Try to find person by name via CL people search
      const lastName = judge.name.split(" ").pop();
      try {
        const search = await clFetch("/api/rest/v4/people/?name_last=" + encodeURIComponent(lastName) + "&is_judge=true");
        if (search.results && search.results.length > 0) {
          judge.courtlistener_person_id = search.results[0].id;
        } else {
          skipped++;
          continue;
        }
      } catch {
        skipped++;
        continue;
      }
    }

    try {
      const events = await clFetch("/api/rest/v4/retention-events/?person=" + judge.courtlistener_person_id);
      if (events.results && events.results.length > 0) {
        // Shape into [{year, vote_pct, retained}]
        const retentionData = events.results.map(e => {
          let votePct = null;
          if (e.votes_yes && e.votes_no) {
            votePct = ((e.votes_yes / (e.votes_yes + e.votes_no)) * 100).toFixed(1);
          } else if (e.retention_percentage) {
            votePct = e.retention_percentage;
          }
          return {
            year: e.year || (e.date_retention ? e.date_retention.slice(0, 4) : null),
            vote_pct: votePct,
            retained: e.won !== undefined ? e.won : (e.retained !== undefined ? e.retained : null),
          };
        }).sort((a, b) => (b.year || 0) - (a.year || 0));

        const normalized = normalizeJudgeName(judge.name);
        const jsonbStr = JSON.stringify(retentionData).split("'").join("''");

        // UPSERT: update judge_sentencing_patterns if a row exists for this judge
        // If no row exists yet, the UPDATE will affect 0 rows (safe no-op)
        sqlLines.push("UPDATE judge_sentencing_patterns SET retention_elections = '" + jsonbStr + "'::jsonb WHERE judge_name_normalized = " + escapeSQLStr(normalized) + ";");
        enriched++;
        console.log("  " + judge.name + ": " + retentionData.length + " retention event(s)");
      } else {
        noEvents++;
      }

      // Rate limiting: ~200ms between requests
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error("  " + judge.name + ": " + err.message);
    }
  }

  console.log("\nEnriched: " + enriched + ", Skipped (no CL ID): " + skipped + ", No events: " + noEvents);

  const sqlPath = path.join(OUTPUT_DIR, "cl-retention-events-enrichment.sql");
  fs.writeFileSync(sqlPath, sqlLines.join("\n") + "\n");
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
    console.log(res.ok ? "Applied successfully" : "Failed: " + (await res.text()).slice(0, 500));

    await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = " + enriched + ", is_stale = false WHERE source_key = 'cl_api_retention';" }),
    });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
