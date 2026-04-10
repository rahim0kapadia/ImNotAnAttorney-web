/**
 * Bulk Populate Judge Profiles
 *
 * Extracts judge data from CourtListener bulk people-db CSVs and populates
 * the judge_profiles table with name, positions, court associations, and case counts.
 *
 * CourtListener people-db schema:
 *   - people-db-people: id, slug, name_first, name_middle, name_last, gender,
 *     dob_year, date_of_birth, religion, political_affiliation, aba_rating, ...
 *   - people-db-positions: id, person_id, court_id, position_type, date_start,
 *     date_termination, ...
 *
 * Judge Profiles schema (actual):
 *   - id, cl_person_id, full_name, name_last, name_first, political_affiliation,
 *     aba_rating, education, positions (jsonb), appointing_president, appointment_date,
 *     date_of_birth, gender, race, religion, financial_disclosure_count,
 *     financial_disclosures, bio_url, last_fetched_at, created_at, updated_at,
 *     magic_words, forbidden_words, pet_peeves, persuasion_triggers,
 *     judicial_philosophy, ruling_style, suppression_grant_rate, reversal_rate,
 *     intelligence_status, intelligence_updated_at
 *
 * Usage:
 *   node scripts/bulk-populate-judge-profiles.mjs              # Run full pipeline
 *   node scripts/bulk-populate-judge-profiles.mjs --dry-run    # Stats only
 *   node scripts/bulk-populate-judge-profiles.mjs --limit 500  # Process first N
 */

import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createReadStream } from "fs";
import { parse } from "csv-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100000;
const BATCH_SIZE = 500;

// Read Supabase token
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"),
  "utf8"
);
let supabaseToken = null;
for (const line of parentEnv.split("\n")) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    supabaseToken = line.slice(22).trim();
    break;
  }
}
if (!supabaseToken) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────
// SQL escaping
// ─────────────────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escJsonb(obj) {
  if (!obj) return "'{}'::jsonb";
  const json = JSON.stringify(obj);
  return `'${json.split("'").join("''")}'::jsonb`;
}

// ─────────────────────────────────────────────────────────────────────────
// Supabase query
// ─────────────────────────────────────────────────────────────────────────

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if (res.statusCode === 429) {
            reject(new Error("429 Throttled"));
          } else if (res.statusCode >= 400) {
            reject(new Error(`${res.statusCode}: ${body}`));
          } else {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve(body);
            }
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Stream bzcat-piped CSV
// ─────────────────────────────────────────────────────────────────────────

function streamBzCsv(bzPath) {
  return new Promise((resolve, reject) => {
    const bzcat = spawn(
      "C:\\Program Files\\Git\\usr\\bin\\bzcat.exe",
      [bzPath]
    );
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      escape: "\\",
      quote: '"',
      relax_column_count: true,
      relaxQuotes: true,
    });

    const rows = [];
    parser.on("readable", function () {
      let record;
      while ((record = parser.read())) {
        rows.push(record);
      }
    });

    parser.on("error", reject);
    parser.on("end", () => resolve(rows));

    bzcat.stdout.pipe(parser);
    bzcat.stderr.on("data", (d) => console.error("[bzcat]", d.toString()));
    bzcat.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Fetch statute_case_law court distribution
// ─────────────────────────────────────────────────────────────────────────

async function getCourtDistribution() {
  console.log("Fetching court distribution from statute_case_law...");
  const sql = `
    SELECT court, COUNT(*) as case_count
    FROM statute_case_law
    WHERE court IS NOT NULL
    GROUP BY court
    ORDER BY case_count DESC
    LIMIT 100;
  `;
  const result = await supabaseQuery(sql);
  const courtSet = new Set();
  if (Array.isArray(result)) {
    result.forEach((row) => courtSet.add(row.court || ""));
  }
  console.log(`Found ${courtSet.size} courts in statute_case_law`);
  return courtSet;
}

// ─────────────────────────────────────────────────────────────────────────
// Main pipeline
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== TASK 1: Bulk Populate Judge Profiles ===\n");

  // 1. Stream people-db-people
  console.log("Step 1: Loading people-db-people...");
  const peoplePath = path.join(
    PROJECT_ROOT,
    "data/bulk-verify/cl-bulk/people-db-people-2026-03-31.csv.bz2"
  );
  const people = await streamBzCsv(peoplePath);
  console.log(`  Loaded ${people.length} people records`);

  // Build person map
  const personMap = new Map();
  people.slice(0, limit).forEach((row) => {
    personMap.set(row.id, {
      id: row.id,
      slug: row.slug,
      name_first: row.name_first || "",
      name_last: row.name_last || "",
      dob_year: row.dob_year || null,
      gender: row.gender || null,
      religion: row.religion || null,
      political_affiliation: row.political_affiliation || null,
      aba_rating: row.aba_rating || null,
    });
  });
  console.log(`  Built map for ${personMap.size} people`);

  // 2. Stream people-db-positions
  console.log("\nStep 2: Loading people-db-positions...");
  const posPath = path.join(
    PROJECT_ROOT,
    "data/bulk-verify/cl-bulk/people-db-positions-2026-03-31.csv.bz2"
  );
  const positions = await streamBzCsv(posPath);
  console.log(`  Loaded ${positions.length} position records`);

  // Build person -> positions map
  const personPositions = new Map();
  positions.forEach((row) => {
    if (!personMap.has(row.person_id)) return;
    if (!personPositions.has(row.person_id)) {
      personPositions.set(row.person_id, []);
    }
    personPositions.get(row.person_id).push({
      court_id: row.court_id,
      position_type: row.position_type || "",
      date_start: row.date_start || null,
      date_termination: row.date_termination || null,
    });
  });
  console.log(
    `  Built position map for ${personPositions.size} people with positions`
  );

  // 3. Fetch court distribution
  const courtSet = await getCourtDistribution();

  // 4. Build judge inserts
  console.log("\nStep 3: Building judge inserts...");
  const inserts = [];
  const judgeIds = new Map();

  for (const [personId, personData] of personMap) {
    const positions = personPositions.get(personId) || [];
    if (positions.length === 0) continue; // Skip non-judges

    const fullName =
      `${personData.name_first} ${personData.name_last}`.trim();

    inserts.push({
      cl_person_id: personData.id,
      full_name: fullName,
      name_last: personData.name_last,
      name_first: personData.name_first,
      political_affiliation: personData.political_affiliation,
      aba_rating: personData.aba_rating,
      date_of_birth: personData.dob_year
        ? `${personData.dob_year}-01-01`
        : null,
      gender: personData.gender,
      religion: personData.religion,
      positions: JSON.stringify(positions),
      intelligence_status: "pending",
    });
    judgeIds.set(personId, null);
  }

  console.log(`  Built ${inserts.length} judge records for insertion`);

  if (dryRun) {
    console.log("\n[DRY RUN] Stats only. Not inserting.");
    console.log(`Total judges to insert: ${inserts.length}`);
    return;
  }

  // 5. Batch INSERT via Supabase
  console.log("\nStep 4: Inserting judges in batches...");

  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE);
    const values = batch
      .map(
        (j) =>
          `(
        ${esc(j.cl_person_id)},
        ${esc(j.full_name)},
        ${esc(j.name_last)},
        ${esc(j.name_first)},
        ${esc(j.political_affiliation)},
        ${esc(j.aba_rating)},
        NULL,
        ${escJsonb(JSON.parse(j.positions))},
        NULL,
        ${j.date_of_birth ? esc(j.date_of_birth) : "NULL"},
        ${j.date_of_birth ? esc(j.date_of_birth) : "NULL"},
        ${esc(j.gender)},
        NULL,
        ${esc(j.religion)},
        0,
        NULL,
        NULL,
        now(),
        now(),
        '${j.intelligence_status}',
        NULL
      )`
      )
      .join(",");

    const sql = `
      INSERT INTO judge_profiles (
        cl_person_id, full_name, name_last, name_first, political_affiliation,
        aba_rating, education, positions, appointing_president, appointment_date,
        date_of_birth, gender, race, religion, financial_disclosure_count,
        financial_disclosures, bio_url, created_at, updated_at,
        intelligence_status, intelligence_updated_at
      ) VALUES ${values}
      ON CONFLICT (cl_person_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        positions = EXCLUDED.positions,
        updated_at = now();
    `;

    try {
      await supabaseQuery(sql);
      inserted += batch.length;
      console.log(`  Inserted ${inserted}/${inserts.length}`);
    } catch (err) {
      if (err.message === "429 Throttled") {
        console.log(`  Hit 429, waiting 30s...`);
        await new Promise((r) => setTimeout(r, 30000));
        i -= BATCH_SIZE; // Retry this batch
      } else {
        throw err;
      }
    }

    // Throttle to avoid saturation
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✓ Inserted ${inserted} judge profiles`);
  console.log("Task 1 complete.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
