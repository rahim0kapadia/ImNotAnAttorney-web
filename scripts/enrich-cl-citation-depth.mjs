/**
 * CourtListener Citation Depth → citation_authority
 *
 * Fetches citation depth data from CL for opinions in the case_law table
 * and computes authority scores. Writes to the citation_authority table.
 *
 * Pipeline:
 *   1. Read case_law rows (paginated, 1000/batch via PostgREST)
 *   2. Extract opinion IDs from source_url
 *   3. Call CL /api/rest/v4/opinions/{id}/ to get cluster_id
 *   4. Call CL /api/rest/v4/clusters/{cluster_id}/ to get citation_count
 *   5. Call CL /api/rest/v4/opinions-cited/?cited_opinion={id} for depth sample
 *   6. Compute authority score and write SQL
 *
 * CL rate limit: 5K queries/hour — 200ms delay between calls.
 * Each opinion needs ~3 API calls (opinion, cluster, opinions-cited).
 * With --limit 200: ~200 * 3 * 200ms = ~2 min.
 *
 * Authority score = weighted combo of:
 *   - Total citing opinions (50%) — from cluster.citation_count
 *   - Average citation depth (30%) — from opinions-cited sample
 *   - Max citation depth bonus (20%) — foundational opinions cited deeply
 *
 * Usage:
 *   node scripts/enrich-cl-citation-depth.mjs                # Dry-run
 *   node scripts/enrich-cl-citation-depth.mjs --apply        # Apply
 *   node scripts/enrich-cl-citation-depth.mjs --limit 200    # Test with 200 opinions
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

/**
 * Extract the numeric opinion ID from a CL source_url.
 * URL format: https://www.courtlistener.com/opinion/{id}/slug/
 * Uses indexOf — no regex per project rules.
 */
function extractOpinionId(sourceUrl) {
  if (!sourceUrl) return null;
  var marker = "/opinion/";
  var start = sourceUrl.indexOf(marker);
  if (start < 0) return null;
  start += marker.length;
  var end = sourceUrl.indexOf("/", start);
  if (end < 0) end = sourceUrl.length;
  var idStr = sourceUrl.substring(start, end);
  // Validate it's numeric
  for (var i = 0; i < idStr.length; i++) {
    var ch = idStr.charCodeAt(i);
    if (ch < 48 || ch > 57) return null; // not 0-9
  }
  return idStr;
}

async function clFetch(endpoint, retries) {
  if (retries === undefined) retries = 2;
  var url = endpoint.startsWith("http") ? endpoint : "https://www.courtlistener.com" + endpoint;
  for (var attempt = 0; attempt <= retries; attempt++) {
    try {
      var res = await fetch(url, {
        headers: { Authorization: "Token " + CL_TOKEN },
      });
      if (res.status === 429) {
        // Rate limited — back off
        var wait = Math.min(10000, 2000 * Math.pow(2, attempt));
        console.log("  Rate limited, waiting " + (wait / 1000) + "s...");
        await new Promise(function (r) { setTimeout(r, wait); });
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("CL " + res.status + ": " + url);
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(function (r) { setTimeout(r, 1000); });
    }
  }
  return null;
}

/**
 * Compute authority score from citation data.
 *
 * @param {number} totalCiting - Total number of citing opinions (from cluster)
 * @param {number} avgDepth - Average citation depth from sample
 * @param {number} maxDepth - Maximum citation depth from sample
 * @returns {number} Authority score 0-100
 */
function computeAuthorityScore(totalCiting, avgDepth, maxDepth) {
  // Normalize total citations: log scale, cap at ~1000 citations = 100
  var citationScore = Math.min(100, (Math.log10(Math.max(1, totalCiting)) / 3) * 100);
  // Depth score: deeper citations mean more foundational authority
  var depthScore = Math.min(100, avgDepth * 25);
  // Max depth bonus: opinions cited 4+ levels deep are truly foundational
  var maxDepthScore = Math.min(100, maxDepth * 20);

  // Weighted combination: citations matter most, then depth
  return Math.round(citationScore * 0.5 + depthScore * 0.3 + maxDepthScore * 0.2);
}

async function main() {
  if (!CL_TOKEN) { console.error("Set COURTLISTENER_TOKEN in .env.local"); process.exit(1); }
  if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }

  console.log("Reading from case_law table (limit: " + limit + ", mode: " + (dryRun ? "dry-run" : "APPLY") + ")");

  // ----- Step 1: Paginate through case_law to collect opinion IDs -----
  var candidates = [];
  var offset = 0;
  var PAGE_SIZE = 1000;

  while (candidates.length < limit) {
    var fetchUrl = SUPABASE_URL + "/rest/v1/case_law?select=id,case_name,source_url" +
      "&source_url=not.is.null&order=case_name&offset=" + offset + "&limit=" + PAGE_SIZE;
    var res = await fetch(fetchUrl, {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    });
    var batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (var bi = 0; bi < batch.length; bi++) {
      var row = batch[bi];
      var opId = extractOpinionId(row.source_url);
      if (opId) {
        candidates.push({
          case_law_id: row.id,
          case_name: row.case_name,
          source_url: row.source_url,
          opinion_id: opId,
        });
      }
    }
    offset += PAGE_SIZE;
    if (batch.length < PAGE_SIZE) break;
  }

  console.log("Found " + candidates.length + " case_law rows with valid opinion IDs");
  var toProcess = candidates.slice(0, limit);
  console.log("Processing " + toProcess.length + " opinions...\n");

  // ----- Step 2: For each opinion, resolve cluster + get citation data -----
  var sqlLines = [];
  var enriched = 0;
  var errors = 0;
  var skipped = 0;
  var seenClusters = {}; // Deduplicate by cluster_id

  for (var i = 0; i < toProcess.length; i++) {
    var candidate = toProcess[i];
    if (i > 0 && i % 50 === 0) {
      console.log("  Progress: " + i + "/" + toProcess.length + " (enriched: " + enriched + ", skipped: " + skipped + ", errors: " + errors + ")");
    }

    try {
      // 2a. Get cluster_id from opinion endpoint
      var opinion = await clFetch("/api/rest/v4/opinions/" + candidate.opinion_id + "/");
      if (!opinion) {
        skipped++;
        await new Promise(function (r) { setTimeout(r, 200); });
        continue;
      }
      var clusterId = String(opinion.cluster_id);

      // Deduplicate: skip if we already processed this cluster
      if (seenClusters[clusterId]) {
        skipped++;
        await new Promise(function (r) { setTimeout(r, 200); });
        continue;
      }
      seenClusters[clusterId] = true;

      await new Promise(function (r) { setTimeout(r, 200); });

      // 2b. Get citation_count from cluster endpoint
      var cluster = await clFetch("/api/rest/v4/clusters/" + clusterId + "/");
      if (!cluster) {
        skipped++;
        await new Promise(function (r) { setTimeout(r, 200); });
        continue;
      }
      var citationCount = cluster.citation_count || 0;

      await new Promise(function (r) { setTimeout(r, 200); });

      // 2c. Get depth sample from opinions-cited (inbound: who cites this opinion)
      var avgDepth = 1;
      var maxDepth = 1;

      if (citationCount > 0) {
        var citedData = await clFetch("/api/rest/v4/opinions-cited/?cited_opinion=" + candidate.opinion_id);
        if (citedData && citedData.results && citedData.results.length > 0) {
          var depthSum = 0;
          var localMax = 0;
          for (var j = 0; j < citedData.results.length; j++) {
            var d = citedData.results[j].depth || 1;
            depthSum += d;
            if (d > localMax) localMax = d;
          }
          avgDepth = depthSum / citedData.results.length;
          maxDepth = localMax;
        }
        await new Promise(function (r) { setTimeout(r, 200); });
      }

      var authorityScore = computeAuthorityScore(citationCount, avgDepth, maxDepth);
      var clusterUrl = "https://www.courtlistener.com/api/rest/v4/clusters/" + clusterId + "/";

      // SQL matches actual citation_authority schema:
      // cluster_id, case_name, total_citing_opinions, avg_citation_depth,
      // max_citation_depth, positive_treatment_count, negative_treatment_count,
      // distinguishing_count, authority_score, source_urls, sources, data_as_of
      sqlLines.push(
        "INSERT INTO citation_authority (cluster_id, case_name, total_citing_opinions, avg_citation_depth, max_citation_depth, positive_treatment_count, negative_treatment_count, distinguishing_count, authority_score, source_urls, sources, data_as_of)\n" +
        "VALUES (" + escapeSQL(clusterId) + ", " + escapeSQL(candidate.case_name) + ", " + citationCount + ", " + avgDepth.toFixed(2) + ", " + maxDepth + ", 0, 0, 0, " + authorityScore + ", ARRAY[" + escapeSQL(clusterUrl) + "], ARRAY['courtlistener'], now())\n" +
        "ON CONFLICT (cluster_id) DO UPDATE SET\n" +
        "  case_name = EXCLUDED.case_name,\n" +
        "  total_citing_opinions = EXCLUDED.total_citing_opinions,\n" +
        "  avg_citation_depth = EXCLUDED.avg_citation_depth,\n" +
        "  max_citation_depth = EXCLUDED.max_citation_depth,\n" +
        "  authority_score = EXCLUDED.authority_score,\n" +
        "  source_urls = EXCLUDED.source_urls,\n" +
        "  data_as_of = now();"
      );

      enriched++;
    } catch (err) {
      console.error("  Error [" + (candidate.case_name || candidate.opinion_id) + "]: " + err.message);
      errors++;
      await new Promise(function (r) { setTimeout(r, 200); });
    }
  }

  console.log("\n--- Summary ---");
  console.log("Processed: " + toProcess.length);
  console.log("Enriched:  " + enriched);
  console.log("Skipped:   " + skipped + " (duplicates or 404s)");
  console.log("Errors:    " + errors);

  var sqlPath = path.join(OUTPUT_DIR, "cl-citation-depth-enrichment.sql");
  fs.writeFileSync(sqlPath, "-- Citation depth enrichment from CourtListener\n-- Generated: " + new Date().toISOString() + "\n-- Source: case_law table (" + toProcess.length + " opinions processed)\n\n" + sqlLines.join("\n\n") + "\n");
  console.log("Wrote " + sqlLines.length + " SQL statements to " + sqlPath);

  if (!dryRun && sqlLines.length > 0) {
    var token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN"); process.exit(1); }

    // Apply in batches of 200 to avoid oversized payloads
    var BATCH = 200;
    for (var bi2 = 0; bi2 < sqlLines.length; bi2 += BATCH) {
      var batchSql = sqlLines.slice(bi2, bi2 + BATCH).join("\n");
      var applyRes = await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ query: batchSql }),
      });
      if (!applyRes.ok) {
        var errText = await applyRes.text();
        console.error("Batch " + bi2 + "-" + (bi2 + BATCH) + " failed: " + errText.slice(0, 500));
        process.exit(1);
      }
      console.log("  Applied batch " + (bi2 + 1) + "-" + Math.min(bi2 + BATCH, sqlLines.length));
    }
    console.log("All batches applied successfully");

    // Update freshness tracker
    await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = " + enriched + ", is_stale = false WHERE source_key = 'cl_api_opinions_cited';" }),
    });
    console.log("Updated data_source_freshness");
  }
}

main().catch(function (err) { console.error(err); process.exit(1); });
