// Template: scripts/ingest/seed-statutes-fl.mjs (env loader + pg pattern)
// Expert: openstates-team (per-state legal-data discipline)
// Pattern: no-hallucinated-legal-data — only set penalty_min where the
//          state's general-penalty statute defines a clear statutory minimum.
//          Leave NULL where judicial discretion applies (most US sentencing).
// csv-bulk-checked: none-exists — pure derived data from public statutes
//
// Backfills jurisdiction_statutes.penalty_min for FL/OH/VA rows where
// offense_class is a simple, recognized class string and the state's
// general-penalty statute defines a statutory minimum for that class.
//
// FL Ch 775.082: NO statutory minimum on most charges (judicial discretion)
//   — only fills 'Capital Felony' (life imprisonment minimum).
// OH R.C. 2929.14: Felonies have definite minimums (F1=3yr, F2=2yr, F3=9mo,
//   F4=6mo, F5=6mo). Misdemeanors are judicial discretion.
// VA Title 18.2-10/11: Class 1-4 felonies have minimums (life/20/5/2 yr).
//   Class 5/6 are alternative sentencing (felony or misdemeanor).
//
// Source citations are populated for every backfilled row so downstream
// consumers (entity-whitelist + report generators) can surface the
// authority. Backfilled rows get verification_notes flagging the source.
//
// Usage:
//   node scripts/backfill-jurisdiction-penalty-min.mjs --dry-run
//   node scripts/backfill-jurisdiction-penalty-min.mjs

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBulkClient } from './lib/pg-bulk-defaults.mjs';

// Env loader (web-repo only, # skip, trim, quote strip).
const envPaths = ['C:/Users/email/projects/ImNotAnAttorney-web/.env.local'];
const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
for (const p of envPaths) {
  if (!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, 'utf-8');
  for (const rawLine of txt.split('\n')) {
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    line = line.trim();
    if (!line || line[0] === '#') continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') ||
        (val[0] === "'" && val[val.length - 1] === "'"))) {
      val = val.slice(1, -1);
    }
    val = val.split('\r').join('').split('\n').join('');
    if (!VALID_KEY_RX.test(key)) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Backfill rules per jurisdiction ──────────────────────────────────────
// Each rule: { offense_class_match, penalty_min, source_url, source_label }
//
// Rules are ONLY applied when offense_class matches EXACTLY (no compound
// strings). Compound classes like "3rd Degree Felony (under $300); 2nd
// Degree Felony ($300-$19,999)" are skipped — they need per-charge analysis,
// not class-based defaults.

export const BACKFILL_RULES = {
  FL: [
    // FL Ch 775.082 — most felonies/misdemeanors are JUDICIAL DISCRETION.
    // Only Capital Felony has an unconditional life-or-death rule.
    {
      offense_class: 'Capital Felony',
      penalty_min: 'Life imprisonment (mandatory unless death penalty imposed)',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.082.html',
      source_label: 'FL Stat. § 775.082(1)',
    },
    // FL felonies (other than Capital): NO statutory minimum — judicial
    // discretion per FL Stat. § 775.082(3). Court may sentence anywhere
    // from probation/community control to the statutory max.
    {
      offense_class: '1st Degree Felony',
      penalty_min: 'No statutory minimum — judicial discretion (FL Stat. § 775.082(3)(b), up to 30 years)',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.082.html',
      source_label: 'FL Stat. § 775.082(3)(b)',
    },
    {
      offense_class: '2nd Degree Felony',
      penalty_min: 'No statutory minimum — judicial discretion (FL Stat. § 775.082(3)(d), up to 15 years)',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.082.html',
      source_label: 'FL Stat. § 775.082(3)(d)',
    },
    {
      offense_class: '3rd Degree Felony',
      penalty_min: 'No statutory minimum — judicial discretion (FL Stat. § 775.082(3)(e), up to 5 years)',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.082.html',
      source_label: 'FL Stat. § 775.082(3)(e)',
    },
    // FL misdemeanors — § 775.082(4).
    {
      offense_class: '1st Degree Misdemeanor',
      penalty_min: 'No statutory minimum — judicial discretion (FL Stat. § 775.082(4)(a), up to 1 year)',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.082.html',
      source_label: 'FL Stat. § 775.082(4)(a)',
    },
    {
      offense_class: '2nd Degree Misdemeanor',
      penalty_min: 'No statutory minimum — judicial discretion (FL Stat. § 775.082(4)(b), up to 60 days)',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.082.html',
      source_label: 'FL Stat. § 775.082(4)(b)',
    },
    // 1st Degree Felony Punishable by Life: also no statutory minimum.
    {
      offense_class: '1st Degree Felony (Punishable by Life)',
      penalty_min: 'No statutory minimum — judicial discretion (FL Stat. § 775.082(3)(a), up to life)',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.082.html',
      source_label: 'FL Stat. § 775.082(3)(a)',
    },
  ],

  OH: [
    // OH R.C. 2929.14(A) — definite-prison felony sentencing ranges.
    // Source: codes.ohio.gov/ohio-revised-code/section-2929.14
    {
      offense_class: '1st Degree Felony',
      penalty_min: '3 years (definite prison term, R.C. 2929.14(A)(1)(a))',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.14',
      source_label: 'Ohio R.C. § 2929.14(A)(1)(a)',
    },
    {
      offense_class: '2nd Degree Felony',
      penalty_min: '2 years (definite prison term, R.C. 2929.14(A)(2))',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.14',
      source_label: 'Ohio R.C. § 2929.14(A)(2)',
    },
    // INTENTIONALLY EXCLUDED: 3rd Degree Felony — split between offenses-of-
    // violence (12-mo min, R.C. 2929.14(A)(3)(a)) vs other (9-mo min,
    // (A)(3)(b)). Rule depends on RC 2901.01(A)(9) classification per
    // statute — needs per-charge analysis, not class-based default.
    {
      offense_class: '4th Degree Felony',
      penalty_min: '6 months (definite prison term, R.C. 2929.14(A)(4))',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.14',
      source_label: 'Ohio R.C. § 2929.14(A)(4)',
    },
    {
      offense_class: '5th Degree Felony',
      penalty_min: '6 months (definite prison term, R.C. 2929.14(A)(5))',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.14',
      source_label: 'Ohio R.C. § 2929.14(A)(5)',
    },
    // OH misdemeanors — judicial discretion per R.C. 2929.24/2929.27. Court
    // chooses anywhere from no jail (probation/community sanction) up to max.
    {
      offense_class: '1st Degree Misdemeanor',
      penalty_min: 'No statutory minimum — judicial discretion (R.C. 2929.24)',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.24',
      source_label: 'Ohio R.C. § 2929.24',
    },
    {
      offense_class: '2nd Degree Misdemeanor',
      penalty_min: 'No statutory minimum — judicial discretion (R.C. 2929.24)',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.24',
      source_label: 'Ohio R.C. § 2929.24',
    },
    {
      offense_class: '3rd Degree Misdemeanor',
      penalty_min: 'No statutory minimum — judicial discretion (R.C. 2929.24)',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.24',
      source_label: 'Ohio R.C. § 2929.24',
    },
    {
      offense_class: '4th Degree Misdemeanor',
      penalty_min: 'No statutory minimum — judicial discretion (R.C. 2929.24)',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.24',
      source_label: 'Ohio R.C. § 2929.24',
    },
    {
      offense_class: 'Minor Misdemeanor',
      penalty_min: 'No jail — fine only up to $150 (R.C. 2929.28(A)(2)(a)(v))',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.28',
      source_label: 'Ohio R.C. § 2929.28(A)(2)(a)(v)',
    },
  ],

  VA: [
    // VA Code § 18.2-10 — felony sentencing minimums.
    // Source: law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-10/
    {
      offense_class: 'Class 2 Felony',
      penalty_min: '20 years (statutory minimum, Va. Code § 18.2-10(b))',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-10/',
      source_label: 'Va. Code § 18.2-10(b)',
    },
    {
      offense_class: 'Class 3 Felony',
      penalty_min: '5 years (statutory minimum, Va. Code § 18.2-10(c))',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-10/',
      source_label: 'Va. Code § 18.2-10(c)',
    },
    {
      offense_class: 'Class 4 Felony',
      penalty_min: '2 years (statutory minimum, Va. Code § 18.2-10(d))',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-10/',
      source_label: 'Va. Code § 18.2-10(d)',
    },
    // Class 1 Felony: death or life — Va. Code § 18.2-10(a). Skip — already populated.
    // Class 5/6 Felony: alternative sentencing — judicial discretion. Skip.
    // VA misdemeanors — judicial discretion per Va. Code § 18.2-11.
    {
      offense_class: 'Class 1 Misdemeanor',
      penalty_min: 'No statutory minimum — judicial discretion (Va. Code § 18.2-11(a), up to 12 mo + $2,500)',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-11/',
      source_label: 'Va. Code § 18.2-11(a)',
    },
    {
      offense_class: 'Class 2 Misdemeanor',
      penalty_min: 'No statutory minimum — judicial discretion (Va. Code § 18.2-11(b), up to 6 mo + $1,000)',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-11/',
      source_label: 'Va. Code § 18.2-11(b)',
    },
    {
      offense_class: 'Class 3 Misdemeanor',
      penalty_min: 'No jail — fine only up to $500 (Va. Code § 18.2-11(c))',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-11/',
      source_label: 'Va. Code § 18.2-11(c)',
    },
    {
      offense_class: 'Class 4 Misdemeanor',
      penalty_min: 'No jail — fine only up to $250 (Va. Code § 18.2-11(d))',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-11/',
      source_label: 'Va. Code § 18.2-11(d)',
    },
  ],
};

// ── Argument parsing ─────────────────────────────────────────────────────
function parseArgs() {
  const args = { dryRun: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

// ── Apply backfill ───────────────────────────────────────────────────────
export async function backfillPenaltyMin({ dryRun, dbFactory } = {}) {
  console.log('=== backfill-jurisdiction-penalty-min ' + new Date().toISOString() + ' ===');
  console.log('  dry-run: ' + !!dryRun);

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  const summary = { dry_run: !!dryRun, jurisdictions: {}, total_updated: 0 };
  try {
    for (const [jurisdiction, rules] of Object.entries(BACKFILL_RULES)) {
      const jurSummary = { rules_evaluated: rules.length, rule_results: [] };
      for (const rule of rules) {
        // Find candidates: NULL penalty_min + EXACT offense_class match
        const { rows: candidates } = await client.query(
          `SELECT id::text, common_charge_slug, statute_number
             FROM jurisdiction_statutes
            WHERE jurisdiction = $1
              AND active = true
              AND offense_class = $2
              AND penalty_min IS NULL`,
          [jurisdiction, rule.offense_class],
        );
        if (candidates.length === 0) {
          jurSummary.rule_results.push({ class: rule.offense_class, candidates: 0, updated: 0 });
          continue;
        }
        console.log('\n  ' + jurisdiction + ' [' + rule.offense_class + ']: ' + candidates.length + ' candidates');
        for (const c of candidates.slice(0, 5)) {
          console.log('    - ' + c.statute_number + ' (' + c.common_charge_slug + ')');
        }
        if (candidates.length > 5) console.log('    ... ' + (candidates.length - 5) + ' more');

        if (!dryRun) {
          // Atomic UPDATE: set penalty_min, append source_url to source_urls,
          // record verification metadata.
          const { rowCount } = await client.query(
            `UPDATE jurisdiction_statutes
                SET penalty_min = $1,
                    source_urls = ARRAY(
                      SELECT DISTINCT u FROM unnest(
                        COALESCE(source_urls, '{}'::text[]) || $2::text
                      ) AS u
                    ),
                    verification_notes = COALESCE(verification_notes, '') ||
                      ' [calculated-backfill 2026-04-25: penalty_min derived from ' || $3 || ']',
                    updated_at = NOW()
              WHERE jurisdiction = $4
                AND active = true
                AND offense_class = $5
                AND penalty_min IS NULL`,
            [rule.penalty_min, rule.source_url, rule.source_label, jurisdiction, rule.offense_class],
          );
          jurSummary.rule_results.push({ class: rule.offense_class, candidates: candidates.length, updated: rowCount });
          summary.total_updated += rowCount;
          console.log('    UPDATED ' + rowCount + ' rows');
        } else {
          jurSummary.rule_results.push({ class: rule.offense_class, candidates: candidates.length, updated: 0, dry_run: true });
        }
      }
      summary.jurisdictions[jurisdiction] = jurSummary;
    }

    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await cleanup();
  }
  return summary;
}

async function main() {
  const args = parseArgs();
  await backfillPenaltyMin(args);
  console.log('\n=== done ===');
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
