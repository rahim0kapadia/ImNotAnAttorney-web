#!/usr/bin/env node
/**
 * Phase 1b: Link judge_quotes to judge_profiles.
 *
 * Pipeline:
 *   1. Fetch unique cluster_ids from judge_quotes (Supabase)
 *   2. Stream opinions-filtered.csv to extract cluster_id → author_id mapping
 *   3. Load judge_profiles cl_person_id → id mapping (Supabase)
 *   4. UPDATE judge_quotes SET judge_id = matched UUID
 *
 * Usage:
 *   node scripts/link-quotes-to-judges.mjs --dry-run   # preview matches
 *   node scripts/link-quotes-to-judges.mjs --apply      # write to DB
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { resolve } from "path";
import { createReadStream } from "fs";
import { parse } from "csv-parse";

dotenv.config({ path: resolve(".", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");

if (!dryRun && !apply) {
  console.error("Usage: --dry-run or --apply");
  process.exit(1);
}

const OPINIONS_CSV = resolve(process.env.OPINIONS_CSV || "data/bulk-verify/cl-bulk/opinions-criminal.csv");

// ── Step 1: Get unique cluster_ids from judge_quotes ──

async function fetchQuoteClusterIds() {
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
    if (error) throw new Error(`Fetch quotes failed: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) ids.add(row.cluster_id);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  return ids;
}

// ── Step 2: Stream opinions CSV to extract cluster_id → author_id ──
// Uses csv-parse with relax_quotes + backslash-escape per cl-bulk-data-defensive.md #1.
// CL bulk CSVs use \" (backslash-quote) inside fields, not standard "" doubling.

async function extractAuthorMapping(targetClusterIds) {
  const clusterToAuthor = new Map();
  const parser = createReadStream(OPINIONS_CSV).pipe(
    parse({
      columns: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      escape: "\\",
    })
  );
  let rows = 0;
  for await (const record of parser) {
    rows++;
    const authorId = record.author_id?.trim();
    const clusterId = record.cluster_id?.trim();
    if (authorId && targetClusterIds.has(clusterId)) {
      clusterToAuthor.set(clusterId, authorId);
    }
    if (rows % 500000 === 0) {
      console.log(`  CSV: ${rows} rows, ${clusterToAuthor.size} authors matched`);
    }
  }
  console.log(`  CSV complete: ${rows} rows, ${clusterToAuthor.size} authors found`);
  return clusterToAuthor;
}

// ── Step 3: Load judge_profiles cl_person_id → id mapping ──

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
    if (error) throw new Error(`Fetch judges failed: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) map.set(row.cl_person_id, row.id);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  return map;
}

// ── Step 4: Update judge_quotes ──

async function updateQuotes(clusterToAuthor, judgeMap) {
  let matched = 0;
  let unmatched = 0;
  let updated = 0;
  let errors = 0;

  for (const [clusterId, authorId] of clusterToAuthor) {
    const judgeId = judgeMap.get(authorId);
    if (!judgeId) {
      unmatched++;
      continue;
    }

    matched++;

    if (apply) {
      const { error } = await supabase
        .from("judge_quotes")
        .update({ judge_id: judgeId })
        .eq("cluster_id", clusterId)
        .is("judge_id", null);

      if (error) {
        errors++;
        if (errors <= 3)
          console.warn(`  Update error for cluster ${clusterId}: ${error.message}`);
      } else {
        updated++;
      }
    }
  }

  return { matched, unmatched, updated, errors };
}

// ── Main ──

async function main() {
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);

  console.log("\n1. Fetching unique cluster_ids from judge_quotes...");
  const clusterIds = await fetchQuoteClusterIds();
  console.log(`   Found ${clusterIds.size} unique clusters with unlinked quotes`);

  console.log("\n2. Streaming opinions CSV to extract author_ids...");
  const clusterToAuthor = await extractAuthorMapping(clusterIds);
  console.log(`   Resolved ${clusterToAuthor.size}/${clusterIds.size} clusters to authors`);

  console.log("\n3. Loading judge_profiles mapping...");
  const judgeMap = await loadJudgeMapping();
  console.log(`   Loaded ${judgeMap.size} judges with cl_person_id`);

  console.log("\n4. Matching & updating...");
  const stats = await updateQuotes(clusterToAuthor, judgeMap);
  console.log(`   Matched: ${stats.matched}`);
  console.log(`   Unmatched (author not in judge_profiles): ${stats.unmatched}`);
  if (apply) {
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Errors: ${stats.errors}`);
  }

  // Summary
  const noAuthor = clusterIds.size - clusterToAuthor.size;
  console.log(`\nSummary:`);
  console.log(`  Total clusters: ${clusterIds.size}`);
  console.log(`  With CL author: ${clusterToAuthor.size}`);
  console.log(`  Per curiam / no author: ${noAuthor}`);
  console.log(`  Author matched to judge_profiles: ${stats.matched}`);
  console.log(`  Author NOT in judge_profiles: ${stats.unmatched}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
