#!/usr/bin/env node
/**
 * Link remaining judge_quotes to judge_profiles via CourtListener API.
 *
 * The CSV-based linker (link-quotes-to-judges.mjs) hit its ceiling at 15,652.
 * This script hits the CL API directly for each unlinked cluster_id to get
 * the authoring judge, then maps to judge_profiles.cl_person_id.
 *
 * Rate: ~200ms per request, 5K/hr CL limit. 4,591 clusters ≈ 15 minutes.
 *
 * Usage:
 *   node scripts/link-quotes-via-cl-api.mjs --dry-run
 *   node scripts/link-quotes-via-cl-api.mjs --apply
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(".", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CL_TOKEN = process.env.COURTLISTENER_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing SUPABASE env vars"); process.exit(1); }
if (!CL_TOKEN) { console.error("Missing COURTLISTENER_TOKEN in .env.local"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const apply = process.argv.includes("--apply");
const dryRun = !apply;

async function clFetch(endpoint) {
  const url = endpoint.startsWith("http") ? endpoint : "https://www.courtlistener.com" + endpoint;
  const res = await fetch(url, { headers: { Authorization: "Token " + CL_TOKEN } });
  if (res.status === 429) {
    console.log("  Rate limited, waiting 60s...");
    await new Promise(r => setTimeout(r, 60000));
    return clFetch(endpoint);
  }
  if (!res.ok) throw new Error("CL " + res.status + ": " + url);
  return res.json();
}

// Step 1: Get unique cluster_ids from unlinked quotes
async function fetchUnlinkedClusters() {
  const ids = new Set();
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("judge_quotes")
      .select("cluster_id")
      .is("judge_id", null)
      .not("cluster_id", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error("Fetch quotes failed: " + error.message);
    if (!data?.length) break;
    for (const row of data) ids.add(row.cluster_id);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  return [...ids];
}

// Step 2: Load judge_profiles cl_person_id → UUID mapping
async function loadJudgeMapping() {
  const map = new Map();
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("judge_profiles")
      .select("id, cl_person_id")
      .not("cl_person_id", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error("Fetch judges failed: " + error.message);
    if (!data?.length) break;
    for (const row of data) map.set(String(row.cl_person_id), row.id);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  return map;
}

// Step 3: For each cluster, hit CL API to get author_id
async function main() {
  console.log("Mode:", dryRun ? "DRY RUN" : "APPLY");

  console.log("\n1. Fetching unlinked cluster_ids...");
  const clusters = await fetchUnlinkedClusters();
  console.log("   " + clusters.length + " unique clusters to process");

  console.log("\n2. Loading judge_profiles mapping...");
  const judgeMap = await loadJudgeMapping();
  console.log("   " + judgeMap.size + " judges with cl_person_id");

  console.log("\n3. Querying CL API for each cluster...");
  let matched = 0, noAuthor = 0, authorNotInDb = 0, errors = 0, updated = 0;
  const batchSize = 50;

  for (let i = 0; i < clusters.length; i++) {
    const clusterId = clusters[i];
    try {
      const cluster = await clFetch("/api/rest/v4/clusters/" + clusterId + "/?fields=sub_opinions");
      const opUrls = cluster.sub_opinions || [];

      if (opUrls.length === 0) { noAuthor++; continue; }

      // Get author from first opinion
      let authorId = null;
      for (const url of opUrls.slice(0, 3)) {
        const opPath = url.replace("https://www.courtlistener.com", "");
        const op = await clFetch(opPath + "?fields=author_id,type");
        const opType = op.type || "";
        // Prefer majority/lead opinion
        if (opType === "010combined" || opType === "015lead" || opType === "" || !authorId) {
          if (op.author_id) {
            authorId = String(op.author_id);
            if (opType === "010combined" || opType === "015lead") break;
          }
        }
        await new Promise(r => setTimeout(r, 100));
      }

      if (!authorId) { noAuthor++; continue; }

      const judgeId = judgeMap.get(authorId);
      if (!judgeId) { authorNotInDb++; continue; }

      matched++;

      if (apply) {
        const { error } = await supabase
          .from("judge_quotes")
          .update({ judge_id: judgeId })
          .eq("cluster_id", clusterId)
          .is("judge_id", null);
        if (error) {
          errors++;
          if (errors <= 3) console.warn("  Update error: " + error.message);
        } else {
          updated++;
        }
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      errors++;
      if (errors <= 5) console.warn("  Error on cluster " + clusterId + ": " + err.message);
      await new Promise(r => setTimeout(r, 500));
    }

    if ((i + 1) % 100 === 0) {
      console.log("  Progress: " + (i + 1) + "/" + clusters.length +
        " | matched=" + matched + " noAuthor=" + noAuthor +
        " notInDb=" + authorNotInDb + " errors=" + errors);
    }
  }

  console.log("\nResults:");
  console.log("  Total clusters: " + clusters.length);
  console.log("  Matched to judge: " + matched);
  console.log("  No author (per curiam): " + noAuthor);
  console.log("  Author not in judge_profiles: " + authorNotInDb);
  console.log("  Errors: " + errors);
  if (apply) console.log("  Updated: " + updated);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
