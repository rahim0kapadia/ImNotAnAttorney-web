/**
 * CourtListener Citation Depth → citation_authority
 *
 * Fetches citation depth data for high-value opinions and computes
 * authority scores. Writes to the citation_authority table.
 *
 * CL endpoint: GET /api/rest/v4/opinions-cited/?citing_opinion={id}
 * Rate limit: 5K queries/hour — batch of 10K opinions at 200ms = ~33 min.
 *
 * Authority score = weighted combo of:
 *   - Total citing opinions (40%)
 *   - Average citation depth (30%)
 *   - Positive vs negative treatment ratio (30%)
 *
 * Usage:
 *   node scripts/enrich-cl-citation-depth.mjs                # Dry-run
 *   node scripts/enrich-cl-citation-depth.mjs --apply        # Apply
 *   node scripts/enrich-cl-citation-depth.mjs --limit 100    # Test with 100 opinions
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
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 10000;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function escapeSQL(str) {
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

/**
 * Compute authority score from citation data.
 *
 * @param {number} totalCiting - Total number of citing opinions
 * @param {number} avgDepth - Average citation depth (how many hops)
 * @param {number} positiveRatio - Ratio of positive to total treatments (0-1)
 * @returns {number} Authority score 0-100
 */
function computeAuthorityScore(totalCiting, avgDepth, positiveRatio) {
  // Normalize total citations: log scale, cap at ~1000 citations = 100
  const citationScore = Math.min(100, (Math.log10(Math.max(1, totalCiting)) / 3) * 100);
  // Depth score: deeper citations mean more foundational authority
  const depthScore = Math.min(100, avgDepth * 25);
  // Treatment score: positive treatment is authoritative
  const treatmentScore = positiveRatio * 100;

  // Weighted combination
  return Math.round(citationScore * 0.4 + depthScore * 0.3 + treatmentScore * 0.3);
}

async function main() {
  if (!CL_TOKEN) { console.error("Set COURTLISTENER_TOKEN in .env.local"); process.exit(1); }
  if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }

  // Fetch top-cited opinions from statute_case_law
  // We need cluster IDs of opinions that are cited most frequently
  console.log("Fetching top-cited opinions from statute_case_law...");

  // Paginate through statute_case_law to find opinions with courtlistener_cluster_id
  // PostgREST caps at 1000 rows — must paginate via Range header
  const candidates = [];
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (candidates.length < limit) {
    const res = await fetch(
      SUPABASE_URL + "/rest/v1/statute_case_law?select=courtlistener_cluster_id,case_name,citation&courtlistener_cluster_id=not.is.null&order=courtlistener_cluster_id&offset=" + offset + "&limit=" + PAGE_SIZE,
      { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
    );
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const row of batch) {
      if (row.courtlistener_cluster_id && !candidates.find(c => c.cluster_id === row.courtlistener_cluster_id)) {
        candidates.push({
          cluster_id: row.courtlistener_cluster_id,
          case_name: row.case_name,
          citation: row.citation,
        });
      }
    }
    offset += PAGE_SIZE;
    if (batch.length < PAGE_SIZE) break;
  }

  console.log("Found " + candidates.length + " unique opinions with cluster IDs (limit: " + limit + ")");
  const toProcess = candidates.slice(0, limit);

  const sqlLines = [];
  let enriched = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const candidate = toProcess[i];
    if (i > 0 && i % 100 === 0) {
      console.log("  Progress: " + i + "/" + toProcess.length + " (" + enriched + " enriched, " + errors + " errors)");
    }

    try {
      // Fetch opinions that cite this opinion
      const cited = await clFetch("/api/rest/v4/opinions-cited/?citing_opinion=" + candidate.cluster_id);

      if (!cited.results || cited.results.length === 0) {
        // No citing opinions found — skip
        await new Promise(r => setTimeout(r, 200));
        continue;
      }

      const totalCiting = cited.count || cited.results.length;

      // Analyze citation depth and treatment
      let depthSum = 0;
      let positiveCount = 0;
      let negativeCount = 0;
      let neutralCount = 0;

      for (const cite of cited.results) {
        // depth is how many levels removed the citation is
        depthSum += cite.depth || 1;

        // Treatment analysis from CL opinion-cited data
        const treatment = (cite.treatment || "").toLowerCase();
        if (treatment.includes("followed") || treatment.includes("affirmed") || treatment.includes("cited")) {
          positiveCount++;
        } else if (treatment.includes("overruled") || treatment.includes("disapproved") || treatment.includes("distinguished")) {
          negativeCount++;
        } else {
          neutralCount++;
        }
      }

      const avgDepth = depthSum / cited.results.length;
      const total = positiveCount + negativeCount + neutralCount;
      const positiveRatio = total > 0 ? positiveCount / total : 0.5;
      const authorityScore = computeAuthorityScore(totalCiting, avgDepth, positiveRatio);

      const sourceUrl = "https://www.courtlistener.com/api/rest/v4/clusters/" + candidate.cluster_id + "/";

      sqlLines.push(
        "INSERT INTO citation_authority (cluster_id, case_name, citation, total_citing_opinions, avg_citation_depth, positive_treatment_count, negative_treatment_count, neutral_treatment_count, authority_score, source_urls, sources)\n" +
        "VALUES (" + escapeSQL(String(candidate.cluster_id)) + ", " + escapeSQL(candidate.case_name) + ", " + escapeSQL(candidate.citation) + ", " + totalCiting + ", " + avgDepth.toFixed(2) + ", " + positiveCount + ", " + negativeCount + ", " + neutralCount + ", " + authorityScore + ", ARRAY[" + escapeSQL(sourceUrl) + "], ARRAY['courtlistener'])\n" +
        "ON CONFLICT (cluster_id) DO UPDATE SET\n" +
        "  total_citing_opinions = EXCLUDED.total_citing_opinions,\n" +
        "  avg_citation_depth = EXCLUDED.avg_citation_depth,\n" +
        "  positive_treatment_count = EXCLUDED.positive_treatment_count,\n" +
        "  negative_treatment_count = EXCLUDED.negative_treatment_count,\n" +
        "  neutral_treatment_count = EXCLUDED.neutral_treatment_count,\n" +
        "  authority_score = EXCLUDED.authority_score,\n" +
        "  source_urls = EXCLUDED.source_urls,\n" +
        "  data_as_of = now();"
      );

      enriched++;

      // Rate limiting: ~200ms between requests
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error("  " + (candidate.case_name || candidate.cluster_id) + ": " + err.message);
      errors++;
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log("\nEnriched: " + enriched + ", Errors: " + errors);

  const sqlPath = path.join(OUTPUT_DIR, "cl-citation-depth-enrichment.sql");
  fs.writeFileSync(sqlPath, sqlLines.join("\n\n") + "\n");
  console.log("Wrote " + sqlLines.length + " SQL statements to " + sqlPath);

  if (!dryRun) {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN"); process.exit(1); }

    // Apply in batches of 500 to avoid oversized payloads
    const BATCH = 500;
    for (let i = 0; i < sqlLines.length; i += BATCH) {
      const batchSql = sqlLines.slice(i, i + BATCH).join("\n");
      const res = await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ query: batchSql }),
      });
      if (!res.ok) {
        console.error("Batch " + i + "-" + (i + BATCH) + " failed: " + (await res.text()).slice(0, 500));
        process.exit(1);
      }
      console.log("  Applied batch " + (i + 1) + "-" + Math.min(i + BATCH, sqlLines.length));
    }
    console.log("All batches applied successfully");

    await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = " + enriched + ", is_stale = false WHERE source_key = 'cl_api_opinions_cited';" }),
    });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
