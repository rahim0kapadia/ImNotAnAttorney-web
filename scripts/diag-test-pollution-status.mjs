#!/usr/bin/env node
/**
 * scripts/diag-test-pollution-status.mjs
 *
 * Read-only audit. Invoke manually on day 3 and day 6 of the
 * `enforce-test-isolation.js` DRY_RUN window (through 2026-05-01) to
 * check hook-warning volume and marker-path coverage. Exits 0
 * regardless of findings.
 *
 * Plan: docs/plans/2026-04-24-worry-test-pollution-cv.md (T7a).
 * Hook: ~/.claude/hooks/enforce-test-isolation.js.
 * Helper: scripts/lib/test-db.mjs.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOOKS_TMP = path.join(os.tmpdir(), "claude-hooks");
// The hook writes sharded JSONL warnings similar to other enforcers.
const WARN_PREFIX = "claude-test-isolation-warnings.log";

// Eight in-scope tables (must match T0 migration + T1a reaper).
const IN_SCOPE_TABLES = [
  "orders",
  "cases",
  "intakes",
  "subscribers",
  "drip_emails",
  "operator_tasks",
  "case_findings",
  "processing_jobs",
];

function loadDbUrl() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("diag: missing .env.local at " + envPath);
  }
  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split("\n")) {
    if (line.startsWith("SUPABASE_DB_URL=")) {
      return line.slice(line.indexOf("=") + 1).trim();
    }
  }
  throw new Error("diag: SUPABASE_DB_URL not found in .env.local");
}

function rewriteToSessionPort(urlStr) {
  const u = new URL(urlStr);
  u.port = "5432";
  return u.toString();
}

function scanHookWarnings() {
  const buckets = {
    missingMarker: 0,
    templateLiteralBypass: 0,
    other: 0,
    total: 0,
  };
  if (!fs.existsSync(HOOKS_TMP)) {
    return { buckets, files: [] };
  }
  const files = fs
    .readdirSync(HOOKS_TMP)
    .filter((n) => n.startsWith(WARN_PREFIX));
  for (const f of files) {
    let raw;
    try { raw = fs.readFileSync(path.join(HOOKS_TMP, f), "utf8"); } catch { continue; }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      buckets.total++;
      try {
        const entry = JSON.parse(line);
        const kind = String(entry.kind || entry.reason || "").toLowerCase();
        if (kind.indexOf("template") !== -1 || kind.indexOf("string") !== -1) {
          buckets.templateLiteralBypass++;
        } else if (kind.indexOf("missing") !== -1 || kind.indexOf("no-marker") !== -1) {
          buckets.missingMarker++;
        } else {
          buckets.other++;
        }
      } catch {
        buckets.other++;
      }
    }
  }
  return { buckets, files };
}

async function scanMarkerCoverage() {
  const client = new pg.Client({
    connectionString: rewriteToSessionPort(loadDbUrl()),
    ssl: { rejectUnauthorized: false },
    application_name: "inaa-diag-test-pollution",
    port: 5432,
  });
  await client.connect();
  const rows = {};
  try {
    // drip_emails uses `sent_at` (no `created_at`); every other in-scope
    // table uses `created_at`. Map per-table to the correct timestamp col.
    const TIMESTAMP_COL = {
      orders: 'created_at',
      cases: 'created_at',
      intakes: 'created_at',
      subscribers: 'created_at',
      drip_emails: 'sent_at',
      operator_tasks: 'created_at',
      case_findings: 'created_at',
      processing_jobs: 'created_at',
    };
    for (const tbl of IN_SCOPE_TABLES) {
      const tsCol = TIMESTAMP_COL[tbl] || 'created_at';
      const sql =
        'SELECT COUNT(*)::int AS n FROM ' + tbl +
        ' WHERE test_run_id IS NOT NULL AND ' + tsCol +
        " > NOW() - INTERVAL '7 days'";
      try {
        const { rows: r } = await client.query(sql);
        rows[tbl] = r[0]?.n ?? 0;
      } catch (e) {
        rows[tbl] = `error: ${e.message}`;
      }
    }
  } finally {
    try { await client.end(); } catch {}
  }
  return rows;
}

async function main() {
  console.log("=== diag-test-pollution-status ===");
  console.log(`Hook warnings tmpdir: ${HOOKS_TMP}`);

  const { buckets, files } = scanHookWarnings();
  console.log("\nHook warning log files:");
  if (!files.length) {
    console.log("  (none)");
  } else {
    for (const f of files) console.log("  " + f);
  }
  console.log("\nHook warning counts (last scan window):");
  console.log(`  total:                   ${buckets.total}`);
  console.log(`  missing marker:          ${buckets.missingMarker}`);
  console.log(`  template-literal bypass: ${buckets.templateLiteralBypass}`);
  console.log(`  other:                   ${buckets.other}`);

  console.log("\nMarker-path coverage (last 7 days, in-scope tables):");
  const rows = await scanMarkerCoverage();
  for (const tbl of IN_SCOPE_TABLES) {
    console.log(`  ${tbl.padEnd(20)} ${rows[tbl]}`);
  }

  console.log("\nDone. Exit 0 regardless of findings (diagnostic only).");
}

main().catch((e) => {
  console.error("diag failed:", e.message);
  process.exit(0);
});
