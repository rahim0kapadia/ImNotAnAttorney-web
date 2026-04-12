# Data Intelligence Platform — Recovery + Phase 1 Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 0 (populate bench_jury_divergence, fix data quality), save migration tracking files, then create 5 ingestion scripts to populate Phase 1 external intelligence tables with free public data.

**Architecture:** Fix-forward approach — production has all Phase 1 tables (applied by crashed session) + all product code extensions (query.ts/render.ts already integrated). Remaining work: data quality fixes, migration file tracking, ingestion scripts for 5 free external data sources, SCHEMA.md docs.

**Tech Stack:** Node.js ESM scripts following `scripts/bulk-*.mjs` pattern, Supabase Management API for SQL, PostgREST for data reads, web scraping (cheerio) for Brady/Giglio, CSV parsing for NPI/BJS/Exoneration, Python pyreadstat for USSC SAS files.

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-11-di-platform-recovery-design.md`

**Previous plan (stale):** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-04-11-data-intelligence-phase0-phase1.md` — superseded by this plan. Original had 23 tasks; triage found 15 already done.

---

## Phase 0 — Data Quality + Migration Tracking

### Task 1: Save migration file to disk (tracking what's already applied)

**Files:**
- Create: `supabase/migrations/20260411f_external_intelligence_layer.sql`

**IMPORTANT:** This file documents what's ALREADY in production. All statements use IF NOT EXISTS — idempotent on both fresh and existing databases. This is required by the "migration file before apply" rule.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260411f_external_intelligence_layer.sql` with the full schema from the spec (Section 4.2). The file must include:

1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
2. 8 new tables (all `CREATE TABLE IF NOT EXISTS`): officer_external_intel, judge_sentencing_patterns, prosecution_profiles, outcome_benchmarks, exoneration_patterns, forensic_lab_profiles, citation_authority, data_source_freshness
3. co_defendant_analysis recreation (`CREATE TABLE IF NOT EXISTS`)
4. `ALTER TABLE verified_case_law ADD COLUMN IF NOT EXISTS citation_depth integer, ADD COLUMN IF NOT EXISTS authority_score numeric;` — NOTE: uses `verified_case_law` NOT `statute_case_law`
5. `ALTER TABLE officer_reliability ADD COLUMN IF NOT EXISTS external_intel_id uuid REFERENCES officer_external_intel(id), ADD COLUMN IF NOT EXISTS brady_status text, ADD COLUMN IF NOT EXISTS decertified boolean DEFAULT false;`
6. RLS policies with `IF NOT EXISTS` guards (DO $$ block pattern)

Copy the full SQL from the spec at `docs/superpowers/specs/2026-04-11-data-intelligence-platform-design.md`, Section 4.2. Fix `statute_case_law` → `verified_case_law` in the ALTER.

- [ ] **Step 2: Apply the missing verified_case_law ALTER**

The crashed session's migration used `statute_case_law` (wrong name), so the ALTER failed silently. Apply the fix:

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "ALTER TABLE verified_case_law ADD COLUMN IF NOT EXISTS citation_depth integer, ADD COLUMN IF NOT EXISTS authority_score numeric;")
```

Expected: "SQL applied successfully"

- [ ] **Step 3: Verify the columns exist**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'verified_case_law' AND column_name IN ('citation_depth', 'authority_score');")
```

Expected: 2 rows — citation_depth (integer), authority_score (numeric)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260411f_external_intelligence_layer.sql
git commit -m "docs(migration): track external intelligence layer schema already in production

All 8 Phase 1 tables + co_defendant_analysis exist in prod (applied by prior session).
This file documents the schema with IF NOT EXISTS for convergent re-application.
Also applied missing verified_case_law ALTER (citation_depth, authority_score)."
```

---

### Task 2: Deduplicate doubled Tier 9 tables

**Files:**
- Create: `supabase/migrations/20260411g_dedup_tier9_data.sql`

judge_quotes (64,730 → ~32,365) and sentencing_distributions (244 → ~122) were doubled by a crashed session that re-applied SQL on top of existing data.

- [ ] **Step 1: Create the dedup migration file**

Create `supabase/migrations/20260411g_dedup_tier9_data.sql`:

```sql
-- Dedup Tier 9 tables — judge_quotes and sentencing_distributions were doubled
-- by a crashed session that re-applied INSERT SQL on top of existing data.
-- Uses ctid to identify physical duplicates (keeps one copy per unique combo).

-- judge_quotes: dedup on (judge_id, quote, cluster_id)
DELETE FROM judge_quotes a USING judge_quotes b
WHERE a.ctid > b.ctid
  AND a.judge_id = b.judge_id
  AND a.quote = b.quote
  AND COALESCE(a.cluster_id, '') = COALESCE(b.cluster_id, '');

-- sentencing_distributions: dedup on (judge_id, jurisdiction, charge_slug)
DELETE FROM sentencing_distributions a USING sentencing_distributions b
WHERE a.ctid > b.ctid
  AND COALESCE(a.judge_id::text, '') = COALESCE(b.judge_id::text, '')
  AND COALESCE(a.jurisdiction, '') = COALESCE(b.jurisdiction, '')
  AND a.charge_slug = b.charge_slug;
```

- [ ] **Step 2: Apply the dedup**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs supabase/migrations/20260411g_dedup_tier9_data.sql
```

- [ ] **Step 3: Verify counts**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT 'judge_quotes' as tbl, COUNT(*) FROM judge_quotes UNION ALL SELECT 'sentencing_distributions', COUNT(*) FROM sentencing_distributions;")
```

Expected: judge_quotes ~32,365, sentencing_distributions ~122

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260411g_dedup_tier9_data.sql
git commit -m "fix(tier9): dedup judge_quotes and sentencing_distributions

Both tables were doubled by crashed session re-applying INSERT SQL.
judge_quotes: 64,730 → ~32,365. sentencing_distributions: 244 → ~122."
```

---

### Task 3: Re-run bench_jury_divergence with --apply

**Files:**
- Read: `scripts/bulk-bench-jury-divergence.mjs` (already has pagination fix + lower threshold + relax_quotes)

The dry-run collected 954 classified results from 2.5M rows before csv-parse hit a quote error. The try/catch should let the --apply run proceed with collected data.

- [ ] **Step 1: Run with --apply**

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web && node scripts/bulk-bench-jury-divergence.mjs --apply 2>&1 | tail -50
```

Timeout: 10 minutes (streams 50GB CSV). Expected: generates SQL + applies via Management API. The CSV parse error at ~2.5M rows is expected — the catch handler proceeds with collected data.

If the script produces 0 divergences (all 954 classified opinions had same trial type), skip this task — the table will be populated when more judge data accumulates.

- [ ] **Step 2: Verify row count**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT COUNT(*) FROM bench_jury_divergence;")
```

Expected: 10-500 rows (depends on how many judge×charge combinations had both bench and jury trials)

- [ ] **Step 3: Commit if script was modified**

Only if the script needed changes during the run:

```bash
git add scripts/bulk-bench-jury-divergence.mjs
git commit -m "fix(tier9): bench_jury_divergence populated after pagination + threshold fixes"
```

---

## Phase 1 — External Data Ingestion Scripts

### Task 4: Brady/Giglio List scraper → officer_external_intel

**Files:**
- Create: `scripts/ingest-brady-giglio.mjs`

**Data source:** https://giglio-bradylist.com/ — free, no API. HTML tables listing officers with Brady/Giglio disclosures by state.

**Dependency:** `npm install cheerio` (HTML parser)

- [ ] **Step 1: Install cheerio**

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web && npm install cheerio
```

- [ ] **Step 2: Create the ingestion script**

Create `scripts/ingest-brady-giglio.mjs`:

```javascript
/**
 * Brady/Giglio List → officer_external_intel
 *
 * Scrapes giglio-bradylist.com for officers with Brady/Giglio disclosures.
 * UPSERTs into officer_external_intel on (officer_name_normalized, state, agency).
 *
 * Usage:
 *   node scripts/ingest-brady-giglio.mjs              # Dry-run (generate SQL)
 *   node scripts/ingest-brady-giglio.mjs --apply      # Generate + apply
 *   node scripts/ingest-brady-giglio.mjs --limit 50   # Test with 50 records
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function esc(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).split("'").join("''") + "'";
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "INAA-Legal-Research/1.0 (legal research tool)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

async function main() {
  if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }

  console.log("=== BRADY/GIGLIO LIST INGESTION ===\n");

  // Fetch the main page to discover state listing links
  const baseUrl = "https://giglio-bradylist.com";
  let mainHtml;
  try {
    mainHtml = await fetchPage(baseUrl);
  } catch (err) {
    console.error("Failed to fetch Brady/Giglio list:", err.message);
    console.log("\nFallback: Check if a cached HTML file exists at data/bulk-verify/external-intel/brady-giglio-cache.html");
    const cachePath = path.join(OUTPUT_DIR, "brady-giglio-cache.html");
    if (fs.existsSync(cachePath)) {
      mainHtml = fs.readFileSync(cachePath, "utf-8");
      console.log("Using cached HTML file.");
    } else {
      console.error("No cache available. Download the page manually and save to:", cachePath);
      process.exit(1);
    }
  }

  const $ = cheerio.load(mainHtml);
  const records = [];

  // Parse officer entries from tables — structure varies by site version.
  // Look for table rows with officer name, agency, state, reason.
  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 3) {
      const name = $(cells[0]).text().trim();
      const agency = $(cells[1]).text().trim();
      const state = $(cells[2]).text().trim();
      const reason = cells.length >= 4 ? $(cells[3]).text().trim() : null;

      if (name && name.length > 2 && name !== "Name" && !name.includes("Officer")) {
        records.push({ name, agency, state: state.substring(0, 2).toUpperCase(), reason });
      }
    }
  });

  console.log(`Parsed ${records.length} officer records from Brady/Giglio list`);
  if (records.length === 0) {
    console.log("No records found — site structure may have changed. Check HTML manually.");
    process.exit(1);
  }

  const sqlLines = [];
  let count = 0;

  for (const r of records.slice(0, limit)) {
    const normalized = normalize(r.name);
    sqlLines.push(
      `INSERT INTO officer_external_intel (officer_name, officer_name_normalized, state, agency, brady_status, brady_reason, source_urls, sources) ` +
      `VALUES (${esc(r.name)}, ${esc(normalized)}, ${esc(r.state)}, ${esc(r.agency)}, 'listed', ${esc(r.reason)}, ARRAY[${esc(baseUrl)}], ARRAY['Brady/Giglio List']) ` +
      `ON CONFLICT (officer_name_normalized, state, agency) DO UPDATE SET brady_status = 'listed', brady_reason = EXCLUDED.brady_reason, source_urls = EXCLUDED.source_urls, updated_at = now();`
    );
    count++;
  }

  // Update data_source_freshness
  sqlLines.push(
    `UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = ${count}, is_stale = false WHERE source_key = 'brady_giglio_list';`
  );

  const outputFile = path.join(OUTPUT_DIR, "brady-giglio-upserts.sql");
  fs.writeFileSync(outputFile, sqlLines.join("\n") + "\n");
  console.log(`\nWrote ${count} UPSERT statements to ${outputFile}`);

  if (dryRun) {
    console.log("Dry run complete. Run with --apply to execute.");
    return;
  }

  // Apply via Management API
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || fs.readFileSync(path.join(PROJECT_ROOT, "../ImNotAnAttorney/.env.local"), "utf-8")
        .split("\n").find(l => l.startsWith("SUPABASE_ACCESS_TOKEN="))
        ?.split("=").slice(1).join("=");

  if (!token) { console.error("SUPABASE_ACCESS_TOKEN not found"); process.exit(1); }

  const BATCH_SIZE = 200;
  for (let i = 0; i < sqlLines.length; i += BATCH_SIZE) {
    const batch = sqlLines.slice(i, i + BATCH_SIZE).join("\n");
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: batch }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, err.slice(0, 200));
    } else {
      console.log(`Applied batch ${i / BATCH_SIZE + 1} (${Math.min(BATCH_SIZE, sqlLines.length - i)} statements)`);
    }
  }

  console.log(`\nDone. ${count} officers ingested from Brady/Giglio list.`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Test with dry-run**

```bash
node scripts/ingest-brady-giglio.mjs --limit 10
```

Expected: "Parsed N officer records" + "Wrote 10 UPSERT statements"

If the site structure changed and 0 records parse, save the HTML to `data/bulk-verify/external-intel/brady-giglio-cache.html` for manual inspection and adjust the cheerio selectors.

- [ ] **Step 4: Run with --apply**

```bash
node scripts/ingest-brady-giglio.mjs --apply
```

- [ ] **Step 5: Verify**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT COUNT(*) FROM officer_external_intel WHERE brady_status = 'listed';")
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest-brady-giglio.mjs package.json package-lock.json
git commit -m "feat(tier9): Brady/Giglio list scraper → officer_external_intel

Scrapes giglio-bradylist.com for officers with Brady/Giglio disclosures.
UPSERTs on (officer_name_normalized, state, agency). Updates data_source_freshness."
```

---

### Task 5: National Police Index → officer_external_intel

**Files:**
- Create: `scripts/ingest-npi.mjs`

**Data source:** Invisible Institute National Police Index — free downloadable CSV from https://invisible.institute/national-police-index

**Acquisition:** Download the CSV dataset. Save to `data/bulk-verify/external-intel/npi-data.csv`. The dataset contains officer employment history, complaints, and use-of-force data.

- [ ] **Step 1: Download the NPI dataset**

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web/data/bulk-verify/external-intel
# Check if dataset is directly downloadable
curl -sL -o npi-data.csv "https://invisible.institute/national-police-index" --max-time 30 || echo "Direct download failed — may need to visit the page and download manually"
```

If direct download fails, the script should document the manual download URL and check for the file at startup.

- [ ] **Step 2: Create the ingestion script**

Create `scripts/ingest-npi.mjs`:

```javascript
/**
 * National Police Index → officer_external_intel
 *
 * Parses the NPI CSV dataset (Invisible Institute) and merges officer
 * employment history, complaints, and use-of-force data into officer_external_intel.
 *
 * Prerequisites:
 *   - data/bulk-verify/external-intel/npi-data.csv (download from invisible.institute)
 *   - npm install csv-parse (already installed)
 *
 * Usage:
 *   node scripts/ingest-npi.mjs              # Dry-run
 *   node scripts/ingest-npi.mjs --apply      # Apply
 *   node scripts/ingest-npi.mjs --limit 500  # Test with 500
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const NPI_FILE = path.join(OUTPUT_DIR, "npi-data.csv");

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

function esc(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).split("'").join("''") + "'";
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

async function main() {
  if (!fs.existsSync(NPI_FILE)) {
    console.error("NPI dataset not found at:", NPI_FILE);
    console.error("Download from https://invisible.institute/national-police-index");
    process.exit(1);
  }

  console.log("=== NATIONAL POLICE INDEX INGESTION ===\n");
  console.log(`Reading: ${NPI_FILE}`);

  // Group records by officer to build employment history
  const officerMap = new Map(); // normalized_name+state → aggregated data

  const stream = fs.createReadStream(NPI_FILE)
    .pipe(parse({ columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true }));

  let rowCount = 0;
  for await (const row of stream) {
    rowCount++;
    if (rowCount > limit) break;

    // NPI CSV columns vary by version — adapt to actual headers
    const name = row.full_name || row.officer_name || row.last_name
      ? `${row.first_name || ""} ${row.last_name || ""}`.trim()
      : null;
    if (!name || name.length < 3) continue;

    const state = (row.state || "").substring(0, 2).toUpperCase();
    const agency = row.agency_name || row.department || "";
    const key = normalize(name) + "|" + state;

    if (!officerMap.has(key)) {
      officerMap.set(key, {
        name, normalized: normalize(name), state, agency,
        agencies: [], complaints: 0, useOfForce: 0, sustained: 0,
      });
    }

    const officer = officerMap.get(key);
    if (agency && !officer.agencies.includes(agency)) officer.agencies.push(agency);
    if (row.complaint_count) officer.complaints += parseInt(row.complaint_count, 10) || 0;
    if (row.use_of_force_count) officer.useOfForce += parseInt(row.use_of_force_count, 10) || 0;
    if (row.sustained_count) officer.sustained += parseInt(row.sustained_count, 10) || 0;

    if (rowCount % 100000 === 0) console.log(`  ${(rowCount / 1000).toFixed(0)}K rows...`);
  }

  console.log(`\nProcessed ${rowCount} rows → ${officerMap.size} unique officers`);

  const sqlLines = [];
  let count = 0;
  const sourceUrl = "https://invisible.institute/national-police-index";

  for (const [, o] of officerMap) {
    const isWandering = o.agencies.length > 1;
    const historyJson = JSON.stringify(o.agencies).split("'").join("''");

    sqlLines.push(
      `INSERT INTO officer_external_intel (officer_name, officer_name_normalized, state, agency, npi_employment_history, npi_is_wandering_officer, complaint_count, use_of_force_count, sustained_complaints, source_urls, sources) ` +
      `VALUES (${esc(o.name)}, ${esc(o.normalized)}, ${esc(o.state)}, ${esc(o.agency)}, '${historyJson}'::jsonb, ${isWandering}, ${o.complaints}, ${o.useOfForce}, ${o.sustained}, ARRAY[${esc(sourceUrl)}], ARRAY['National Police Index']) ` +
      `ON CONFLICT (officer_name_normalized, state, agency) DO UPDATE SET ` +
      `npi_employment_history = EXCLUDED.npi_employment_history, npi_is_wandering_officer = EXCLUDED.npi_is_wandering_officer, ` +
      `complaint_count = GREATEST(officer_external_intel.complaint_count, EXCLUDED.complaint_count), ` +
      `use_of_force_count = GREATEST(officer_external_intel.use_of_force_count, EXCLUDED.use_of_force_count), ` +
      `sustained_complaints = GREATEST(officer_external_intel.sustained_complaints, EXCLUDED.sustained_complaints), ` +
      `source_urls = officer_external_intel.source_urls || EXCLUDED.source_urls, updated_at = now();`
    );
    count++;
  }

  sqlLines.push(
    `UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = ${count}, is_stale = false WHERE source_key = 'national_police_index';`
  );

  const outputFile = path.join(OUTPUT_DIR, "npi-upserts.sql");
  fs.writeFileSync(outputFile, sqlLines.join("\n") + "\n");
  console.log(`Wrote ${count} UPSERT statements to ${outputFile}`);

  if (dryRun) { console.log("Dry run complete."); return; }

  // Apply via Management API (same pattern as Brady script)
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || fs.readFileSync(path.join(PROJECT_ROOT, "../ImNotAnAttorney/.env.local"), "utf-8")
        .split("\n").find(l => l.startsWith("SUPABASE_ACCESS_TOKEN="))
        ?.split("=").slice(1).join("=");

  if (!token) { console.error("SUPABASE_ACCESS_TOKEN not found"); process.exit(1); }

  const BATCH_SIZE = 200;
  for (let i = 0; i < sqlLines.length; i += BATCH_SIZE) {
    const batch = sqlLines.slice(i, i + BATCH_SIZE).join("\n");
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: batch }),
    });
    if (!res.ok) console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, (await res.text()).slice(0, 200));
    else console.log(`Applied batch ${i / BATCH_SIZE + 1}`);
  }

  console.log(`\nDone. ${count} officers ingested from NPI.`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Test with dry-run**

```bash
node scripts/ingest-npi.mjs --limit 500
```

If NPI CSV headers differ from expected, adapt the column name mapping in the script.

- [ ] **Step 4: Run with --apply**

```bash
node scripts/ingest-npi.mjs --apply
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-npi.mjs
git commit -m "feat(tier9): NPI ingestion → officer_external_intel

Parses National Police Index CSV for employment history, complaints, wandering officers.
Merges with Brady/Giglio data via UPSERT on (name, state, agency)."
```

---

### Task 6: USSC Sentencing Datafiles → judge_sentencing_patterns

**Files:**
- Create: `scripts/ingest-ussc-sentencing.mjs`
- Create: `scripts/convert-ussc-sas.py` (one-time SAS→CSV converter)

**Data source:** https://www.ussc.gov/research/datafiles/commission-datafiles — free SAS/SPSS format. Individual case-level sentencing data FY2002-FY2025.

**Acquisition:** Download the most recent fiscal year datafile (SAS format). Convert to CSV using Python. Save to `data/bulk-verify/external-intel/ussc-individual.csv`.

- [ ] **Step 1: Create the SAS→CSV converter**

Create `scripts/convert-ussc-sas.py`:

```python
#!/usr/bin/env python3
"""Convert USSC SAS datafile to CSV for Node.js ingestion.

Usage: python scripts/convert-ussc-sas.py <input.sas7bdat> <output.csv>

Install: pip install pyreadstat
"""
import sys
import pyreadstat

if len(sys.argv) < 3:
    print("Usage: python scripts/convert-ussc-sas.py <input.sas7bdat> <output.csv>")
    sys.exit(1)

df, meta = pyreadstat.read_sas7bdat(sys.argv[1])
# Key columns: SENTMON (sentence months), ZONE (guideline zone), BOOTEFFT (departure),
# NEWCNVTN (conviction type), DISTRICT, CIRCDIST, MONSEX, NEWRACE, XCRHISSR (crim history)
# JUDGE (judge identifier — anonymized in some years)
cols_of_interest = [c for c in df.columns if c.upper() in (
    "SENTMON", "SENTTOT", "ZONE", "BOOTEFLT", "BOOTEFTT", "NEWCNVTN", "DISTRICT",
    "CIRCDIST", "MONSEX", "NEWRACE", "XCRHISSR", "JUDGE", "USSCIDN", "SENSPLT0",
    "SESSION", "ACCESSION", "OFFGUIDE", "WEAPON", "DRUGTYP", "FINE", "COMESSION",
)]
if cols_of_interest:
    df = df[cols_of_interest]

df.to_csv(sys.argv[2], index=False)
print(f"Wrote {len(df)} rows to {sys.argv[2]}")
```

- [ ] **Step 2: Download + convert**

```bash
# Download latest USSC datafile (check URL at ussc.gov/research/datafiles)
# The URL changes yearly — verify current download link
cd C:/Users/email/projects/ImNotAnAttorney-web/data/bulk-verify/external-intel

# After download:
pip install pyreadstat
python C:/Users/email/projects/ImNotAnAttorney-web/scripts/convert-ussc-sas.py ussc-fy2024.sas7bdat ussc-individual.csv
```

- [ ] **Step 3: Create the ingestion script**

Create `scripts/ingest-ussc-sentencing.mjs`:

```javascript
/**
 * USSC Individual Sentencing Datafiles → judge_sentencing_patterns
 *
 * Aggregates individual case-level USSC data by district to produce
 * judge sentencing pattern summaries (median/mean sentence, departure rates, etc).
 *
 * Note: USSC data is anonymized — no judge names. Aggregates by district instead.
 * judge_name_normalized uses the district name for matching.
 *
 * Prerequisites:
 *   - data/bulk-verify/external-intel/ussc-individual.csv (from convert-ussc-sas.py)
 *
 * Usage:
 *   node scripts/ingest-ussc-sentencing.mjs              # Dry-run
 *   node scripts/ingest-ussc-sentencing.mjs --apply      # Apply
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const CSV_FILE = path.join(OUTPUT_DIR, "ussc-individual.csv");

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");

function esc(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).split("'").join("''") + "'";
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function main() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error("USSC CSV not found at:", CSV_FILE);
    console.error("Run: python scripts/convert-ussc-sas.py <input.sas7bdat>", CSV_FILE);
    process.exit(1);
  }

  console.log("=== USSC SENTENCING PATTERNS INGESTION ===\n");

  // Aggregate by district
  const districtMap = new Map();

  const stream = fs.createReadStream(CSV_FILE)
    .pipe(parse({ columns: true, skip_empty_lines: true, relax_column_count: true }));

  let rowCount = 0;
  for await (const row of stream) {
    rowCount++;
    const district = row.DISTRICT || row.CIRCDIST || "unknown";
    const sentMonths = parseFloat(row.SENTMON || row.SENTTOT);
    const departure = row.BOOTEFLT || row.BOOTEFTT || "";

    if (!districtMap.has(district)) {
      districtMap.set(district, {
        sentences: [], downward: 0, upward: 0, substantial: 0, total: 0,
        offenses: {}, crimHistory: {},
      });
    }

    const d = districtMap.get(district);
    d.total++;
    if (!isNaN(sentMonths) && sentMonths >= 0) d.sentences.push(sentMonths);
    if (departure === "1" || departure.toLowerCase().includes("below")) d.downward++;
    if (departure === "2" || departure.toLowerCase().includes("above")) d.upward++;
    if (departure === "3" || departure.toLowerCase().includes("substantial")) d.substantial++;

    const offense = row.OFFGUIDE || "unknown";
    d.offenses[offense] = (d.offenses[offense] || 0) + 1;

    const ch = row.XCRHISSR || "unknown";
    d.crimHistory[ch] = (d.crimHistory[ch] || 0) + 1;

    if (rowCount % 50000 === 0) console.log(`  ${(rowCount / 1000).toFixed(0)}K rows...`);
  }

  console.log(`\nProcessed ${rowCount} rows → ${districtMap.size} districts`);

  const sqlLines = [];
  const sourceUrl = "https://www.ussc.gov/research/datafiles/commission-datafiles";

  for (const [district, d] of districtMap) {
    if (d.total < 10) continue; // skip tiny districts

    const medianSent = median(d.sentences);
    const meanSent = d.sentences.length > 0
      ? d.sentences.reduce((a, b) => a + b, 0) / d.sentences.length
      : null;

    const normalized = district.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    sqlLines.push(
      `INSERT INTO judge_sentencing_patterns (judge_name, judge_name_normalized, district, total_cases, ` +
      `median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, ` +
      `downward_departure_rate, upward_departure_rate, substantial_assistance_rate, ` +
      `offense_breakdown, criminal_history_breakdown, source_urls, sources, data_period) VALUES ` +
      `(${esc(district)}, ${esc(normalized)}, ${esc(district)}, ${d.total}, ` +
      `${medianSent}, ${meanSent ? meanSent.toFixed(2) : "NULL"}, ${percentile(d.sentences, 0.25)}, ${percentile(d.sentences, 0.75)}, ` +
      `${(d.downward / d.total).toFixed(4)}, ${(d.upward / d.total).toFixed(4)}, ${(d.substantial / d.total).toFixed(4)}, ` +
      `${esc(JSON.stringify(d.offenses))}::jsonb, ${esc(JSON.stringify(d.crimHistory))}::jsonb, ` +
      `ARRAY[${esc(sourceUrl)}], ARRAY['USSC Individual Datafiles'], 'FY2024') ` +
      `ON CONFLICT (judge_name_normalized, district) DO UPDATE SET ` +
      `total_cases = EXCLUDED.total_cases, median_sentence_months = EXCLUDED.median_sentence_months, ` +
      `mean_sentence_months = EXCLUDED.mean_sentence_months, downward_departure_rate = EXCLUDED.downward_departure_rate, ` +
      `offense_breakdown = EXCLUDED.offense_breakdown, updated_at = now();`
    );
  }

  sqlLines.push(
    `UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = ${sqlLines.length}, is_stale = false WHERE source_key = 'ussc_individual_datafiles';`
  );

  const outputFile = path.join(OUTPUT_DIR, "ussc-sentencing-upserts.sql");
  fs.writeFileSync(outputFile, sqlLines.join("\n") + "\n");
  console.log(`Wrote ${sqlLines.length - 1} district patterns to ${outputFile}`);

  if (dryRun) { console.log("Dry run complete."); return; }

  // Apply (same pattern as other scripts)
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || fs.readFileSync(path.join(PROJECT_ROOT, "../ImNotAnAttorney/.env.local"), "utf-8")
        .split("\n").find(l => l.startsWith("SUPABASE_ACCESS_TOKEN="))
        ?.split("=").slice(1).join("=");

  if (!token) { console.error("SUPABASE_ACCESS_TOKEN not found"); process.exit(1); }

  const BATCH_SIZE = 50;
  for (let i = 0; i < sqlLines.length; i += BATCH_SIZE) {
    const batch = sqlLines.slice(i, i + BATCH_SIZE).join("\n");
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: batch }),
    });
    if (!res.ok) console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, (await res.text()).slice(0, 200));
    else console.log(`Applied batch ${i / BATCH_SIZE + 1}`);
  }

  console.log(`\nDone.`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 4: Test + apply + commit**

```bash
node scripts/ingest-ussc-sentencing.mjs --limit 1000
node scripts/ingest-ussc-sentencing.mjs --apply
git add scripts/ingest-ussc-sentencing.mjs scripts/convert-ussc-sas.py
git commit -m "feat(tier9): USSC sentencing → judge_sentencing_patterns

Aggregates individual USSC case data by district. Computes median/mean sentence,
departure rates, offense/criminal history breakdowns. Includes SAS→CSV converter."
```

---

### Task 7: BJS Outcome Data → outcome_benchmarks

**Files:**
- Create: `scripts/ingest-bjs-outcomes.mjs`

**Data source:** Bureau of Justice Statistics — Felony Sentences in State Courts + Federal Justice Statistics. Free CSV/Excel downloads from https://bjs.ojp.gov/topics/courts

**Acquisition:** Download the latest datasets. Save to `data/bulk-verify/external-intel/bjs-felony.csv`.

- [ ] **Step 1: Create the ingestion script**

Create `scripts/ingest-bjs-outcomes.mjs` following the same pattern as Tasks 4-6. Key differences:

- Target table: `outcome_benchmarks`
- UPSERT key: `(jurisdiction_level, jurisdiction_name, offense_type)`
- Fields: conviction_rate, acquittal_rate, dismissal_rate, plea_rate, trial_rate, plea_trial_penalty_pct, median_sentence_months
- Source: BJS CSV with columns varying by dataset year

The script structure mirrors `ingest-ussc-sentencing.mjs` — read CSV, aggregate by jurisdiction + offense type, compute rates, UPSERT.

```bash
# After creating the script:
node scripts/ingest-bjs-outcomes.mjs --limit 100
node scripts/ingest-bjs-outcomes.mjs --apply
git add scripts/ingest-bjs-outcomes.mjs
git commit -m "feat(tier9): BJS outcome data → outcome_benchmarks

Ingests BJS felony sentencing stats by jurisdiction and offense type.
Computes conviction, plea, trial rates and plea-trial penalty."
```

---

### Task 8: National Registry of Exonerations → exoneration_patterns

**Files:**
- Create: `scripts/ingest-exoneration-registry.mjs`

**Data source:** University of Michigan National Registry of Exonerations — free downloadable spreadsheet from https://www.law.umich.edu/special/exoneration/

**Acquisition:** Download the detailed cases spreadsheet. Save to `data/bulk-verify/external-intel/exonerations.csv`.

- [ ] **Step 1: Create the ingestion script**

Create `scripts/ingest-exoneration-registry.mjs`. Key differences from other scripts:

- Target table: `exoneration_patterns`
- UPSERT key: `(offense_type)`
- Aggregates per-case rows into offense-type summary statistics
- Fields: total_exonerations, false_confession_pct, mistaken_id_pct, perjury_pct, official_misconduct_pct, forensic_error_pct, avg_years_served

The Exoneration Registry CSV has columns like: Last Name, First Name, State, County, Most Serious Crime, Convicted, Exonerated, DNA, FC (False Confession), MWID (Mistaken Witness ID), P/FA (Perjury/False Accusation), OM (Official Misconduct), ILD (Inadequate Legal Defense), F/MFE (False/Misleading Forensic Evidence).

```javascript
// Aggregation logic (inside the for-await loop):
const offense = row["Most Serious Crime"] || row["Worst Crime Display"] || "unknown";
if (!offenseMap.has(offense)) {
  offenseMap.set(offense, { total: 0, fc: 0, mwid: 0, pfa: 0, om: 0, ild: 0, fmfe: 0, yearsServed: [] });
}
const o = offenseMap.get(offense);
o.total++;
if (row.FC === "FC" || row.FC === "1") o.fc++;
if (row.MWID === "MWID" || row.MWID === "1") o.mwid++;
if (row["P/FA"] === "P/FA" || row["P/FA"] === "1") o.pfa++;
if (row.OM === "OM" || row.OM === "1") o.om++;
if (row.ILD === "ILD" || row.ILD === "1") o.ild++;
if (row["F/MFE"] === "F/MFE" || row["F/MFE"] === "1") o.fmfe++;
const convicted = parseInt(row.Convicted);
const exonerated = parseInt(row.Exonerated);
if (!isNaN(convicted) && !isNaN(exonerated)) o.yearsServed.push(exonerated - convicted);
```

```bash
# After creating the script:
node scripts/ingest-exoneration-registry.mjs --limit 100
node scripts/ingest-exoneration-registry.mjs --apply
git add scripts/ingest-exoneration-registry.mjs
git commit -m "feat(tier9): exoneration registry → exoneration_patterns

Aggregates National Registry of Exonerations by offense type.
Computes false confession, mistaken ID, misconduct rates, avg years served."
```

---

## Phase 1 — Documentation + Verification

### Task 9: Update SCHEMA.md with new tables

**Files:**
- Modify: `supabase/SCHEMA.md`

- [ ] **Step 1: Add documentation for all Phase 1 tables**

Add entries for all 9 tables (8 new + co_defendant_analysis) to `supabase/SCHEMA.md`. Each entry should include: table name, purpose, columns with types, UNIQUE constraints, indexes, and which script populates it.

Tables to document: officer_external_intel, judge_sentencing_patterns, prosecution_profiles, outcome_benchmarks, exoneration_patterns, forensic_lab_profiles, citation_authority, data_source_freshness, co_defendant_analysis.

- [ ] **Step 2: Commit**

```bash
git add supabase/SCHEMA.md
git commit -m "docs: add Phase 1 external intelligence tables to SCHEMA.md"
```

---

### Task 10: Final verification

- [ ] **Step 1: TypeScript compile check**

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web && npx tsc --noEmit
```

Expected: clean compile (0 errors)

- [ ] **Step 2: Verify all tables have expected row counts**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(cat <<'SQL'
SELECT 'Tier 9' as layer, 'appellate_trends' AS tbl, COUNT(*) FROM appellate_trends
UNION ALL SELECT 'Tier 9', 'bench_jury_divergence', COUNT(*) FROM bench_jury_divergence
UNION ALL SELECT 'Tier 9', 'case_feature_vectors', COUNT(*) FROM case_feature_vectors
UNION ALL SELECT 'Tier 9', 'co_defendant_analysis', COUNT(*) FROM co_defendant_analysis
UNION ALL SELECT 'Tier 9', 'judge_prosecutor_pairings', COUNT(*) FROM judge_prosecutor_pairings
UNION ALL SELECT 'Tier 9', 'judge_quotes', COUNT(*) FROM judge_quotes
UNION ALL SELECT 'Tier 9', 'officer_reliability', COUNT(*) FROM officer_reliability
UNION ALL SELECT 'Tier 9', 'plea_discount_curves', COUNT(*) FROM plea_discount_curves
UNION ALL SELECT 'Tier 9', 'sentencing_distributions', COUNT(*) FROM sentencing_distributions
UNION ALL SELECT 'Phase 1', 'officer_external_intel', COUNT(*) FROM officer_external_intel
UNION ALL SELECT 'Phase 1', 'judge_sentencing_patterns', COUNT(*) FROM judge_sentencing_patterns
UNION ALL SELECT 'Phase 1', 'outcome_benchmarks', COUNT(*) FROM outcome_benchmarks
UNION ALL SELECT 'Phase 1', 'exoneration_patterns', COUNT(*) FROM exoneration_patterns
UNION ALL SELECT 'Phase 1', 'citation_authority', COUNT(*) FROM citation_authority
UNION ALL SELECT 'Phase 1', 'data_source_freshness', COUNT(*) FROM data_source_freshness
ORDER BY layer, tbl;
SQL
)
```

Expected: All Tier 9 tables >0 rows. Phase 1 tables have data from ingestion scripts. 3 Phase 1 tables deferred (prosecution_profiles, forensic_lab_profiles = 0; citation_authority populated by existing enrich-cl-citation-depth.mjs).

- [ ] **Step 3: Push to remote**

```bash
git push origin master
```

This triggers Vercel deploy. Verify the site builds successfully.
