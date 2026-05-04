#!/usr/bin/env node
/**
 * Aggregate judge_quotes -> judge_profiles.judicial_quotes JSONB rollup.
 *
 * TICKET-5b: closes the missing-aggregator blocker named in PR #282 (T5).
 *
 * Reads judge_quotes WHERE judge_id IS NOT NULL, groups per judge,
 * deduplicates near-identical quotes (same case_cited + topic + first 80 chars),
 * ranks by topic-priority + quote-length-tier + recency, picks top-N per judge,
 * and UPDATEs judge_profiles.judicial_quotes (preserves all other columns).
 *
 * Each emitted quote carries: { cluster_id, cite, topic, score, source_url,
 * quote, case_cited } — superset of the historical shape (used by Tier 9
 * reports per src/lib/tier9-reports/query.ts) and TICKET-5b spec shape
 * (cluster_id + cite + score requested). Downstream code that reads either
 * shape keeps working.
 *
 * Anti-hallucination (Architectural Invariant #13): every emitted source_url
 * is generated from cluster_id via the canonical CourtListener pattern
 * https://www.courtlistener.com/opinion/<cluster_id>/ — never invented.
 * If cluster_id is missing/non-numeric, falls back to the row's stored
 * source_url (which itself was harvested by bulk-master-extractor.mjs from
 * CL bulk data and is verifiable).
 *
 * Substitute-for-missing-score note: judge_quotes has no `score` column.
 * Score is computed deterministically from:
 *   60% topic_priority (suppression/dismissal/sentencing > general)
 *   30% length_tier (>=400 chars > >=200 chars > shorter)
 *   10% recency-within-judge (newer created_at preferred)
 * Range 0-100. See computeScore() for exact weights.
 *
 * Update strategy: per-judge UPDATE judge_profiles SET judicial_quotes = $1
 * WHERE id = $2 — preserves all other columns (sentencing_distributions,
 * bench_acquittal_rate, etc.). ~640 distinct judges currently linked, so
 * per-row UPDATE finishes in <30s. COPY cannot express the
 * UPDATE-existing-row-preserve-other-columns semantics needed here.
 *
 * Defenses (cl-bulk-data-defensive #14, #17):
 *   - Force port 5432 (session mode) — pooler 6543 has 2-min statement_timeout
 *   - SET statement_timeout = 30min, idle_in_transaction = 5min, TCP keepalives
 *
 * Usage:
 *   node scripts/aggregate-judge-quotes-to-profiles.mjs --dry-run --verbose
 *   node scripts/aggregate-judge-quotes-to-profiles.mjs --apply --verbose
 *   node scripts/aggregate-judge-quotes-to-profiles.mjs --apply --limit-judges=10
 *   node scripts/aggregate-judge-quotes-to-profiles.mjs --apply --top-n=15
 */

// bulk-insert-justified: per-judge UPDATE with custom JSONB rollup; only ~640
// judges have linked quotes so per-row UPDATE finishes in seconds; COPY
// cannot express UPDATE-existing-row-preserve-other-columns semantics.
//
// Template: scripts/link-quotes-to-judges.mjs (sibling Tier 9 quote pipeline)
// Pattern: cl-bulk-data-defensive #14 (port-5432 override) + #17 (session
// defenses)
// csv-bulk-checked: none-exists — source data lives in judge_quotes Postgres
// table; no upstream bulk file applies (judge_quotes is itself a derivative
// table extracted by bulk-master-extractor.mjs from the CL bulk dump).

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI ──────────────────────────────────────────────────────────────────

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const DRY_RUN = ARGV.includes("--dry-run") || !APPLY;
const VERBOSE = ARGV.includes("--verbose");

function flagInt(name, fallback) {
  const arg = ARGV.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const n = Number.parseInt(arg.split("=")[1], 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid --${name} value`);
    process.exit(1);
  }
  return n;
}

const TOP_N = flagInt("top-n", 10);
const LIMIT_JUDGES = flagInt("limit-judges", 0); // 0 = no limit
const MIN_QUOTES = flagInt("min-quotes", 1);

// ── DB connection (port-5432 override per gotcha #14) ────────────────────

function loadDbUrl() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env.local at ${envPath}`);
  }
  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split("\n")) {
    if (line.startsWith("SUPABASE_DB_URL=")) {
      return line.slice(line.indexOf("=") + 1).trim();
    }
  }
  throw new Error("Missing SUPABASE_DB_URL in .env.local");
}

function buildSessionDbUrl() {
  const u = new URL(loadDbUrl());
  u.port = "5432"; // session-mode pooler — bulk ops, no 2-min statement_timeout
  return u.toString();
}

async function newClient() {
  const c = new pg.Client({
    connectionString: buildSessionDbUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  // cl-bulk-data-defensive #17
  await c.query(`SET statement_timeout = '30min'`);
  await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);
  await c.query(`SET tcp_keepalives_interval = 10`);
  await c.query(`SET tcp_keepalives_count = 6`);
  return c;
}

// ── Scoring ──────────────────────────────────────────────────────────────

// Higher = more legally interesting. Tuned for criminal-defense relevance.
const TOPIC_PRIORITY = {
  suppression: 100,
  dismissal: 95,
  probable_cause: 90,
  search_seizure: 90,
  constitutional: 85,
  jury_instruction: 80,
  evidence: 75,
  sentencing: 70,
  habeas: 65,
  plea: 60,
  procedure: 50,
  credibility: 50,
  general: 20,
};

function topicWeight(topic) {
  if (!topic) return 10;
  return TOPIC_PRIORITY[topic.toLowerCase()] ?? 30;
}

function lengthTier(text) {
  const len = text ? text.length : 0;
  if (len >= 600) return 100;
  if (len >= 400) return 80;
  if (len >= 250) return 60;
  if (len >= 150) return 40;
  return 20;
}

function recencyWeight(createdAt, newestTs, oldestTs) {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const span = Math.max(1, newestTs - oldestTs);
  return Math.round(((t - oldestTs) / span) * 100);
}

/**
 * Composite score 0-100, deterministic.
 *   60% topic priority
 *   30% length tier
 *   10% recency-within-judge-set
 */
export function computeScore({ topic, quote, createdAt }, ctx) {
  const t = topicWeight(topic) * 0.6;
  const l = lengthTier(quote) * 0.3;
  const r = recencyWeight(createdAt, ctx.newestTs, ctx.oldestTs) * 0.1;
  return Math.round(t + l + r);
}

// ── Source URL generator (anti-hallucination, Invariant #13) ─────────────

/**
 * Generate the canonical CourtListener opinion URL from a cluster_id.
 * Returns null if cluster_id is falsy or non-numeric (never invents a URL).
 */
export function sourceUrlFromCluster(clusterId) {
  if (!clusterId) return null;
  const s = String(clusterId).trim();
  if (!/^\d+$/.test(s)) return null;
  return `https://www.courtlistener.com/opinion/${s}/`;
}

// ── Dedup key ────────────────────────────────────────────────────────────

/**
 * Two quotes are "the same" if they share case_cited + topic + first 80 chars
 * of normalized quote text. Catches the common pattern of one opinion getting
 * extracted N times across slightly different cluster IDs / re-runs of
 * bulk-master-extractor.mjs.
 */
export function dedupKey(row) {
  const text = (row.quote || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const cite = (row.case_cited || "").trim();
  const topic = (row.topic || "").trim();
  return `${cite}\x1f${topic}\x1f${text}`;
}

// ── Selection ────────────────────────────────────────────────────────────

/**
 * Given an array of judge_quotes rows for ONE judge, return top-N as
 * the JSONB array shape we write into judge_profiles.judicial_quotes.
 */
export function selectTopQuotes(rows, topN) {
  if (!rows || rows.length === 0) return [];

  let newestTs = -Infinity;
  let oldestTs = Infinity;
  for (const r of rows) {
    if (!r.created_at) continue;
    const t = new Date(r.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > newestTs) newestTs = t;
    if (t < oldestTs) oldestTs = t;
  }
  if (!Number.isFinite(newestTs)) {
    newestTs = Date.now();
    oldestTs = newestTs;
  }
  const ctx = { newestTs, oldestTs };

  // Dedup by composite key, keeping highest-scored variant
  const seen = new Map();
  for (const row of rows) {
    const key = dedupKey(row);
    const score = computeScore(
      { topic: row.topic, quote: row.quote, createdAt: row.created_at },
      ctx
    );
    const prev = seen.get(key);
    if (!prev || score > prev.score) {
      seen.set(key, { row, score });
    }
  }

  const ranked = [...seen.values()].sort((a, b) => b.score - a.score);
  const picked = ranked.slice(0, topN);

  return picked.map(({ row, score }) => {
    const sourceUrl =
      sourceUrlFromCluster(row.cluster_id) ||
      (row.source_url ? String(row.source_url) : null);
    return {
      cluster_id: row.cluster_id ? String(row.cluster_id) : null,
      cite: row.case_cited || null,
      topic: row.topic || null,
      score,
      source_url: sourceUrl,
      // Preserve historical shape consumed by tier9-reports/query.ts:
      quote: row.quote,
      case_cited: row.case_cited || null,
    };
  });
}

// ── Main pipeline ────────────────────────────────────────────────────────

async function fetchAllLinkedQuotes(client, limitJudges) {
  const judgesSql = limitJudges
    ? `SELECT DISTINCT judge_id FROM judge_quotes
       WHERE judge_id IS NOT NULL ORDER BY judge_id LIMIT ${limitJudges}`
    : `SELECT DISTINCT judge_id FROM judge_quotes
       WHERE judge_id IS NOT NULL`;
  const judgesRes = await client.query(judgesSql);
  const judgeIds = judgesRes.rows.map((r) => r.judge_id);
  if (judgeIds.length === 0) return new Map();

  const quotesRes = await client.query(
    `SELECT judge_id, quote, topic, case_cited, source_url, cluster_id, created_at
     FROM judge_quotes
     WHERE judge_id = ANY($1::uuid[])`,
    [judgeIds]
  );

  const byJudge = new Map();
  for (const row of quotesRes.rows) {
    const arr = byJudge.get(row.judge_id) || [];
    arr.push(row);
    byJudge.set(row.judge_id, arr);
  }
  return byJudge;
}

async function main() {
  const startedAt = Date.now();
  const mode = APPLY ? "APPLY" : "DRY-RUN";
  console.log(`[aggregate-judge-quotes] mode=${mode} top-n=${TOP_N} ` +
    `limit-judges=${LIMIT_JUDGES || "none"} min-quotes=${MIN_QUOTES}`);

  const client = await newClient();
  try {
    console.log("[1/4] Fetching all linked judge_quotes ...");
    const byJudge = await fetchAllLinkedQuotes(client, LIMIT_JUDGES);
    console.log(`      ${byJudge.size} distinct judges have linked quotes`);

    console.log("[2/4] Computing top-N rollup per judge ...");
    let judgesWithRollup = 0;
    let totalEmitted = 0;
    let skippedLowQuote = 0;
    const writes = [];
    for (const [judgeId, rows] of byJudge) {
      if (rows.length < MIN_QUOTES) {
        skippedLowQuote++;
        continue;
      }
      const top = selectTopQuotes(rows, TOP_N);
      if (top.length === 0) continue;
      writes.push([judgeId, top]);
      judgesWithRollup++;
      totalEmitted += top.length;
      if (VERBOSE && writes.length <= 3) {
        console.log(`      sample judge=${judgeId} picked=${top.length}/${rows.length}`);
        console.log(`      top1: ${JSON.stringify(top[0]).slice(0, 220)}...`);
      }
    }
    console.log(`      ${judgesWithRollup} judges will be UPDATEd, ` +
      `${totalEmitted} quotes total, skipped ${skippedLowQuote} (<${MIN_QUOTES} quotes)`);

    if (DRY_RUN) {
      console.log("[3/4] DRY-RUN: skipping writes");
      console.log("[4/4] DRY-RUN complete (no DB writes performed)");
      console.log(`elapsed=${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      return;
    }

    console.log(`[3/4] APPLY: UPDATEing ${writes.length} judge_profiles rows ...`);
    let updated = 0;
    let notFound = 0;
    let errors = 0;
    for (const [judgeId, jsonArr] of writes) {
      try {
        const res = await client.query(
          `UPDATE judge_profiles
             SET judicial_quotes = $1::jsonb
           WHERE id = $2::uuid`,
          [JSON.stringify(jsonArr), judgeId]
        );
        if (res.rowCount === 1) updated++;
        else notFound++;
        if (VERBOSE && (updated + notFound) % 100 === 0) {
          console.log(`      progress: updated=${updated} notFound=${notFound}`);
        }
      } catch (e) {
        errors++;
        if (errors <= 3) console.error(`      error judge=${judgeId}: ${e.message}`);
      }
    }
    console.log(`      updated=${updated} notFound=${notFound} errors=${errors}`);

    console.log("[4/4] APPLY complete");
    console.log(`elapsed=${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

// Allow `import { computeScore, dedupKey, sourceUrlFromCluster, selectTopQuotes }`
// without auto-running main.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
