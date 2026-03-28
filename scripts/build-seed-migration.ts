/**
 * Build migration 029 from static COMMON_CHARGES + generated JSON data.
 *
 * Reads:
 *   - COMMON_CHARGES from generate-charge-taxonomy.ts (static, no API)
 *   - data/charge-taxonomy/questions.json (existing + generated)
 *   - data/charge-taxonomy/{AL,AK,...}.json (jurisdiction statutes)
 *
 * Outputs:
 *   - supabase/migrations/029-seed-charge-taxonomy.sql
 *
 * Usage:
 *   npx tsx scripts/build-seed-migration.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { COMMON_CHARGES } from "./generate-charge-taxonomy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data", "charge-taxonomy");
const OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "supabase",
  "migrations",
  "029-seed-charge-taxonomy.sql"
);

// ── SQL Escaping ─────────────────────────────────────────────────────────────

function esc(val: string | null): string {
  if (val === null) return "NULL";
  return `'${val.replace(/'/g, "''")}'`;
}

function escArray(arr: string[] | null | readonly string[]): string {
  if (arr === null || arr.length === 0) return "'{}'";
  const items = arr.map((s) => `"${s.replace(/"/g, '\\"').replace(/'/g, "''")}"`);
  return `'{${items.join(",")}}'`;
}

// ── Build common_charges INSERTs ─────────────────────────────────────────────

function buildCommonChargesSQL(): string {
  const lines: string[] = [
    "-- common_charges (from COMMON_CHARGES static array)",
    "INSERT INTO common_charges (slug, label, category_slug, ncic_code, description, severity_range, is_federal, is_state, legacy_slugs, sort_order)",
    "VALUES",
  ];

  const values = COMMON_CHARGES.map((c) => {
    return `  (${esc(c.slug)}, ${esc(c.label)}, ${esc(c.categorySlug)}, ${esc(c.ncicCode)}, ${esc(c.description)}, ${esc(c.severityRange)}, ${c.isFederal}, ${c.isState}, ${escArray(c.legacySlugs)}, ${c.sortOrder})`;
  });

  lines.push(values.join(",\n"));
  lines.push("ON CONFLICT (slug) DO NOTHING;");
  return lines.join("\n");
}

// ── Build charge_questions INSERTs ───────────────────────────────────────────

interface QuestionEntry {
  slug: string;
  question_key: string;
  question_text: string;
  answer_type: string;
  options: Array<{ value: string; label: string }>;
  sort_order: number;
}

function buildQuestionsSQL(): string {
  const questionsPath = path.join(DATA_DIR, "questions.json");
  if (!fs.existsSync(questionsPath)) {
    return "-- No questions.json found — skipping charge_questions";
  }

  const raw: Record<string, QuestionEntry[]> = JSON.parse(
    fs.readFileSync(questionsPath, "utf-8")
  );

  const lines: string[] = [
    "",
    "-- charge_questions (from questions.json)",
    "INSERT INTO charge_questions (common_charge_slug, question_id, label, options, sort_order)",
    "VALUES",
  ];

  const values: string[] = [];
  for (const [slug, questions] of Object.entries(raw)) {
    for (const q of questions) {
      // Options stored as text[] in DB — each option is "value|label"
      const optionStrings = (q.options || []).map(
        (o) => `${o.value}|${o.label}`
      );
      values.push(
        `  (${esc(slug)}, ${esc(q.question_key)}, ${esc(q.question_text)}, ${escArray(optionStrings)}, ${q.sort_order})`
      );
    }
  }

  if (values.length === 0) return "-- No questions found in questions.json";

  lines.push(values.join(",\n"));
  lines.push("ON CONFLICT (common_charge_slug, question_id) DO NOTHING;");
  return lines.join("\n");
}

// ── Build jurisdiction_statutes INSERTs ──────────────────────────────────────

interface JurisdictionStatuteJSON {
  common_charge_slug: string;
  statute_number: string | null;
  statute_title: string | null;
  offense_class: string | null;
  penalty_min: string | null;
  penalty_max: string | null;
  fine_max: string | null;
  elements: string[] | null;
  mandatory_minimum: string | null;
  enhancements: string[] | null;
  notes: string | null;
}

function buildJurisdictionSQL(): string {
  const JURISDICTIONS = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
    "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
    "DC","federal",
  ];

  const lines: string[] = [
    "",
    "-- jurisdiction_statutes (from generated JSON files)",
  ];

  let totalStatutes = 0;
  const foundJurisdictions: string[] = [];

  for (const code of JURISDICTIONS) {
    const filepath = path.join(DATA_DIR, `${code}.json`);
    if (!fs.existsSync(filepath)) continue;

    let statutes: JurisdictionStatuteJSON[];
    try {
      statutes = JSON.parse(fs.readFileSync(filepath, "utf-8"));
    } catch {
      console.error(`  Skipping ${code}: invalid JSON`);
      continue;
    }

    if (!Array.isArray(statutes) || statutes.length === 0) continue;

    // Validate slug references
    const validSlugs = new Set(COMMON_CHARGES.map((c) => c.slug));
    const validStatutes = statutes.filter((s) => validSlugs.has(s.common_charge_slug));

    if (validStatutes.length === 0) continue;

    foundJurisdictions.push(code);
    totalStatutes += validStatutes.length;

    lines.push(`\n-- ${code} (${validStatutes.length} statutes)`);
    lines.push(
      "INSERT INTO jurisdiction_statutes (common_charge_slug, jurisdiction, statute_number, statute_title, offense_class, penalty_min, penalty_max, fine_max, elements, mandatory_minimum, enhancements, notes)"
    );
    lines.push("VALUES");

    const values = validStatutes.map((s) => {
      return `  (${esc(s.common_charge_slug)}, ${esc(code)}, ${esc(s.statute_number ?? null)}, ${esc(s.statute_title ?? null)}, ${esc(s.offense_class ?? null)}, ${esc(s.penalty_min ?? null)}, ${esc(s.penalty_max ?? null)}, ${esc(s.fine_max ?? null)}, ${escArray(s.elements ?? [])}, ${esc(s.mandatory_minimum ?? null)}, ${escArray(s.enhancements ?? [])}, ${esc(s.notes ?? null)})`;
    });

    lines.push(values.join(",\n"));
    lines.push("ON CONFLICT (common_charge_slug, jurisdiction) DO NOTHING;");
  }

  if (foundJurisdictions.length === 0) {
    lines.push("-- No jurisdiction JSON files found in data/charge-taxonomy/");
  }

  console.log(
    `Jurisdiction statutes: ${totalStatutes} rows from ${foundJurisdictions.length} jurisdictions (${foundJurisdictions.join(", ")})`
  );

  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(`Building seed migration from ${COMMON_CHARGES.length} common charges...`);

  const sections: string[] = [
    "-- 029-seed-charge-taxonomy.sql",
    "-- Auto-generated by scripts/build-seed-migration.ts",
    `-- Generated: ${new Date().toISOString()}`,
    "",
    buildCommonChargesSQL(),
    buildQuestionsSQL(),
    buildJurisdictionSQL(),
  ];

  const sql = sections.join("\n");
  fs.writeFileSync(OUTPUT_PATH, sql, "utf-8");
  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log(`  ${COMMON_CHARGES.length} common charges`);

  // Count questions
  const questionsPath = path.join(DATA_DIR, "questions.json");
  if (fs.existsSync(questionsPath)) {
    const q = JSON.parse(fs.readFileSync(questionsPath, "utf-8"));
    const total = Object.values(q).flat().length;
    console.log(`  ${total} charge questions`);
  }
}

main();
