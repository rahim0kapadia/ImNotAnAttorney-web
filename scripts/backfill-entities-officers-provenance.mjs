// scripts/backfill-entities-officers-provenance.mjs
//
// Backfills provenance_source + provenance_record_id + provenance_extracted_at
// on existing entities_officers rows (506K pre-date 20260504e migration).
// Joins back to cpd_officers / nypd_officers / officer_external_intel via
// name + agency match.
//
// csv-bulk-checked: none-exists — 3 source tables already loaded; pure UPDATE
// Pattern: cl-bulk-data-defensive #18 (DB-first; UPDATE batched via VALUES)
// Template: scripts/bulk-extract-opinion-entities.mjs (DB-first chunked-keyset)
// bulk-insert-justified: UPDATE not INSERT, COPY-FROM-STDIN doesn't apply

const STATEMENT_TIMEOUT = "30min";
const WORK_MEM = "128MB";

// ── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
  const sourceIdx = args.indexOf("--source");
  const source = sourceIdx !== -1 ? args[sourceIdx + 1] : "all";

  if (!dryRun && !apply) {
    console.error("Usage: node backfill-entities-officers-provenance.mjs --dry-run");
    console.error("       node backfill-entities-officers-provenance.mjs --apply [--limit N] [--source cpd|nypd|oei|all]");
    process.exit(1);
  }
  if (dryRun && apply) {
    console.error("ERROR: --dry-run and --apply are mutually exclusive.");
    process.exit(1);
  }
  if (source !== "all" && !["cpd", "nypd", "oei"].includes(source)) {
    console.error(`ERROR: --source must be one of: cpd, nypd, oei, all (got: ${source})`);
    process.exit(1);
  }
  return { dryRun, apply, limit, source };
}

// ── Session-level safety settings ────────────────────────────────────────────

// db.mjs returns rows[] directly (not { rows, rowCount }).
// For DML (UPDATE/SET) we need the raw pg result — use queryRaw.
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);

function loadDbUrl() {
  const envPath = path.resolve(__dirname2, "..", ".env.local");
  if (!fs.existsSync(envPath)) throw new Error("Missing .env.local at " + envPath);
  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split("\n")) {
    if (line.startsWith("SUPABASE_DB_URL=")) return line.slice(line.indexOf("=") + 1).trim();
  }
  throw new Error("Missing SUPABASE_DB_URL in .env.local");
}

let _rawClient = null;
async function getRawClient() {
  if (!_rawClient) {
    _rawClient = new pg.Client({ connectionString: loadDbUrl(), ssl: { rejectUnauthorized: false } });
    await _rawClient.connect();
  }
  return _rawClient;
}

// queryRaw: returns full pg Result (rows + rowCount)
async function queryRaw(sql, params = []) {
  const c = await getRawClient();
  return c.query(sql, params);
}

// endRaw: closes the raw client
async function endRaw() {
  if (_rawClient) { try { await _rawClient.end(); } catch {} _rawClient = null; }
}

async function setSessionDefaults() {
  await queryRaw(`SET statement_timeout = '${STATEMENT_TIMEOUT}'`);
  await queryRaw(`SET idle_in_transaction_session_timeout = '5min'`);
  await queryRaw(`SET work_mem = '${WORK_MEM}'`);
  await queryRaw(`SET tcp_keepalives_idle = 60`);
  await queryRaw(`SET tcp_keepalives_interval = 10`);
  await queryRaw(`SET tcp_keepalives_count = 6`);
}

// ── Source definitions ────────────────────────────────────────────────────────

// Column audit (2026-05-04):
//   cpd_officers       PK=uid,    name cols: first_name / last_name
//   nypd_officers      PK=tax_id, name cols: officer_first_name / officer_last_name
//   officer_external_intel PK=id, name col: officer_name_normalized (no separate first/last)

const SOURCES = {
  cpd: {
    label: "cpd_officers",
    dryRunSql: `
      SELECT COUNT(*) AS match_count
      FROM entities_officers eo
      JOIN cpd_officers cpd
        ON lower(eo.name_first) = lower(cpd.first_name)
       AND lower(eo.name_last)  = lower(cpd.last_name)
      WHERE eo.provenance_source IS NULL
        AND eo.agency = 'Chicago Police Department'
    `,
    applySql: (limitClause) => `
      UPDATE entities_officers eo
      SET provenance_source       = 'cpd_officers',
          provenance_record_id    = cpd.uid::text,
          provenance_extracted_at = now()
      FROM cpd_officers cpd
      WHERE eo.provenance_source IS NULL
        AND eo.agency = 'Chicago Police Department'
        AND lower(eo.name_first) = lower(cpd.first_name)
        AND lower(eo.name_last)  = lower(cpd.last_name)
      ${limitClause}
    `,
  },
  nypd: {
    label: "nypd_officers",
    dryRunSql: `
      SELECT COUNT(*) AS match_count
      FROM entities_officers eo
      JOIN nypd_officers nypd
        ON lower(eo.name_first) = lower(nypd.officer_first_name)
       AND lower(eo.name_last)  = lower(nypd.officer_last_name)
      WHERE eo.provenance_source IS NULL
        AND eo.agency = 'New York Police Department'
    `,
    applySql: (limitClause) => `
      UPDATE entities_officers eo
      SET provenance_source       = 'nypd_officers',
          provenance_record_id    = nypd.tax_id::text,
          provenance_extracted_at = now()
      FROM nypd_officers nypd
      WHERE eo.provenance_source IS NULL
        AND eo.agency = 'New York Police Department'
        AND lower(eo.name_first) = lower(nypd.officer_first_name)
        AND lower(eo.name_last)  = lower(nypd.officer_last_name)
      ${limitClause}
    `,
  },
  oei: {
    label: "officer_external_intel",
    // OEI has no separate first/last cols — match by composing first+last from entities_officers
    // and comparing against officer_name_normalized (already lower-cased by populator).
    dryRunSql: `
      SELECT COUNT(*) AS match_count
      FROM entities_officers eo
      JOIN officer_external_intel oei
        ON lower(eo.jurisdiction) = lower(oei.state)
       AND oei.officer_name_normalized =
             lower(trim(eo.name_first)) || ' ' || lower(trim(eo.name_last))
      WHERE eo.provenance_source IS NULL
    `,
    applySql: (limitClause) => `
      UPDATE entities_officers eo
      SET provenance_source       = 'officer_external_intel',
          provenance_record_id    = oei.id::text,
          provenance_extracted_at = now()
      FROM officer_external_intel oei
      WHERE eo.provenance_source IS NULL
        AND lower(eo.jurisdiction) = lower(oei.state)
        AND oei.officer_name_normalized =
              lower(trim(eo.name_first)) || ' ' || lower(trim(eo.name_last))
      ${limitClause}
    `,
  },
};

// ── Dry-run: report match counts per source ───────────────────────────────────

async function runDryRun(sourceKey) {
  const keys = sourceKey === "all" ? Object.keys(SOURCES) : [sourceKey];
  console.log("DRY-RUN — match counts per source (no writes)\n");

  let totalMatches = 0;
  for (const key of keys) {
    const def = SOURCES[key];
    const result = await queryRaw(def.dryRunSql);
    const count = parseInt(result.rows[0].match_count, 10);
    totalMatches += count;
    console.log(`  ${def.label.padEnd(30)}  ${String(count).padStart(8)} matches`);
  }

  const nullResult = await queryRaw(`
    SELECT COUNT(*) AS null_count
    FROM entities_officers
    WHERE provenance_source IS NULL
  `);
  const nullCount = parseInt(nullResult.rows[0].null_count, 10);

  console.log("\n  ─────────────────────────────────────────────────");
  console.log(`  Total matchable                      ${String(totalMatches).padStart(8)}`);
  console.log(`  Rows still NULL (all sources)        ${String(nullCount).padStart(8)}`);
  console.log("\nDry-run complete — re-run with --apply to write.");
}

// ── Apply: run UPDATEs ────────────────────────────────────────────────────────

async function runApply(sourceKey, limit) {
  const keys = sourceKey === "all" ? Object.keys(SOURCES) : [sourceKey];
  const limitClause = limit != null ? `LIMIT ${limit}` : "";

  console.log(`APPLY — writing provenance for source(s): ${sourceKey}${limit != null ? ` (limit=${limit})` : ""}\n`);

  let totalUpdated = 0;
  for (const key of keys) {
    const def = SOURCES[key];
    const sql = def.applySql(limitClause);
    const result = await queryRaw(sql);
    const rowcount = result.rowCount ?? 0;
    totalUpdated += rowcount;
    console.log(`  ${def.label.padEnd(30)}  ${String(rowcount).padStart(8)} rows updated`);
  }

  const nullResult = await queryRaw(`
    SELECT COUNT(*) AS null_count
    FROM entities_officers
    WHERE provenance_source IS NULL
  `);
  const nullCount = parseInt(nullResult.rows[0].null_count, 10);

  console.log("\n  ─────────────────────────────────────────────────");
  console.log(`  Total rows updated                   ${String(totalUpdated).padStart(8)}`);
  console.log(`  Remaining NULLs (all sources)        ${String(nullCount).padStart(8)}`);
  console.log("\nApply complete.");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { dryRun, limit, source } = parseArgs(process.argv);

  try {
    await setSessionDefaults();

    if (dryRun) {
      await runDryRun(source);
    } else {
      await runApply(source, limit);
    }
  } finally {
    await endRaw();
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message ?? err);
  process.exit(1);
});
