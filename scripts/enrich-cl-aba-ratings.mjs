/**
 * CourtListener ABA Ratings → judge_profiles.aba_rating
 *
 * Fixes the dead TODO at engine legal-verifier.mjs:510.
 * Fetches ABA judicial ratings for judges in our database.
 *
 * CL endpoint: GET /api/rest/v4/aba-ratings/?person={person_id}
 * Rate limit: 5K queries/hour — we have ~400 judges, well within limit.
 *
 * Usage:
 *   node scripts/enrich-cl-aba-ratings.mjs                # Dry-run
 *   node scripts/enrich-cl-aba-ratings.mjs --apply        # Apply
 *   node scripts/enrich-cl-aba-ratings.mjs --limit 10     # Test with 10 judges
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

  // Fetch judges from our database
  const judgesRes = await fetch(SUPABASE_URL + "/rest/v1/judge_profiles?select=id,full_name,cl_person_id&order=full_name", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
  });
  const judges = await judgesRes.json();
  console.log("Found " + judges.length + " judges in judge_profiles");

  const sqlLines = [];
  let enriched = 0;
  let skipped = 0;

  for (const judge of judges.slice(0, limit)) {
    if (!judge.cl_person_id) {
      // Try to find person by name via CL people search
      const lastName = judge.full_name.split(" ").pop();
      try {
        const search = await clFetch("/api/rest/v4/people/?name_last=" + encodeURIComponent(lastName) + "&is_judge=true");
        if (search.results && search.results.length > 0) {
          judge.cl_person_id = search.results[0].id;
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
      const ratings = await clFetch("/api/rest/v4/aba-ratings/?person=" + judge.cl_person_id);
      if (ratings.results && ratings.results.length > 0) {
        // Take the most recent rating
        const latest = ratings.results.sort((a, b) => (b.year_nominated || 0) - (a.year_nominated || 0))[0];
        const rating = latest.rating || latest.aba_rating;
        const year = latest.year_nominated || latest.year_rated;

        if (rating) {
          const ratingEscaped = String(rating).split("'").join("''");
          sqlLines.push("UPDATE judge_profiles SET aba_rating = '" + ratingEscaped + "', aba_rating_year = " + (year || "NULL") + " WHERE id = '" + judge.id + "';");
          enriched++;
          console.log("  " + judge.full_name + ": " + rating + " (" + year + ")");
        }
      }

      // Rate limiting: ~200ms between requests to stay well within 5K/hr
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error("  " + judge.full_name + ": " + err.message);
    }
  }

  console.log("\nEnriched: " + enriched + ", Skipped: " + skipped);

  const sqlPath = path.join(OUTPUT_DIR, "cl-aba-ratings-enrichment.sql");
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
      body: JSON.stringify({ query: "UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = " + enriched + ", is_stale = false WHERE source_key = 'cl_api_aba_ratings';" }),
    });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
