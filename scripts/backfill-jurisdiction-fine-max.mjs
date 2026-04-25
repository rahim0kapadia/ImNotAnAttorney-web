// Template: scripts/backfill-jurisdiction-penalty-min.mjs (PR #136 sibling)
// Expert: openstates-team (per-state legal-data discipline)
// Pattern: no-hallucinated-legal-data — fine_max only set where the state's
//          general-fine statute defines a clear class-based maximum.
// csv-bulk-checked: none-exists — pure derived data from public statutes
//
// Backfills jurisdiction_statutes.fine_max for FL/OH/VA rows where
// fine_max IS NULL and offense_class is a recognized class string.
//
// FL § 775.083 — class-based maximum fines (felony + misdemeanor).
// Ohio R.C. 2929.18 (felony) / 2929.28 (misdemeanor) — class fine ceilings.
// Va. Code § 18.2-10 (felony) / 18.2-11 (misdemeanor) — class fine ceilings.
//
// Each backfill writes:
//   - fine_max with the statutory ceiling (e.g. "$5,000")
//   - source_url merged into source_urls (atomic ARRAY-DISTINCT, additive)
//   - verification_notes appended with calculated-fine-backfill provenance
//
// Pairs with PR #136 (penalty_min backfill). Together they unlock the
// "Penalty Range: X to Y, fine up to Z" line in generate-report/index.ts:2168
// for the same 50 rows + any additional rows where penalty_min is already
// populated but fine_max is NULL.
//
// Usage:
//   node scripts/backfill-jurisdiction-fine-max.mjs --dry-run
//   node scripts/backfill-jurisdiction-fine-max.mjs

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBulkClient } from './lib/pg-bulk-defaults.mjs';

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
// Each rule: { offense_class, fine_max, source_url, source_label }
// Rules ONLY apply when offense_class matches EXACTLY (no compound strings)
// AND fine_max IS NULL. Compound classes need per-charge analysis.

export const BACKFILL_RULES = {
  FL: [
    // FL § 775.083 — Discretionary fines (maximums by class).
    // (1)(a): "$15,000, when the conviction is of a life felony or a felony
    // of the first degree." Same ceiling for both.
    {
      offense_class: '1st Degree Felony',
      fine_max: '$15,000',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.083.html',
      source_label: 'FL Stat. § 775.083(1)(a)',
    },
    {
      offense_class: 'Life Felony',
      fine_max: '$15,000',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.083.html',
      source_label: 'FL Stat. § 775.083(1)(a)',
    },
    {
      offense_class: '2nd Degree Felony',
      fine_max: '$10,000',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.083.html',
      source_label: 'FL Stat. § 775.083(1)(b)',
    },
    {
      offense_class: '3rd Degree Felony',
      fine_max: '$5,000',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.083.html',
      source_label: 'FL Stat. § 775.083(1)(c)',
    },
    {
      offense_class: '1st Degree Misdemeanor',
      fine_max: '$1,000',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.083.html',
      source_label: 'FL Stat. § 775.083(1)(d)',
    },
    {
      offense_class: '2nd Degree Misdemeanor',
      fine_max: '$500',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.083.html',
      source_label: 'FL Stat. § 775.083(1)(e)',
    },
    {
      offense_class: '1st Degree Felony (Punishable by Life)',
      fine_max: '$15,000',
      source_url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0775/Sections/0775.083.html',
      source_label: 'FL Stat. § 775.083(1)(a)',
    },
    // Capital Felony — § 775.083 does not specify a fine ceiling for capital
    // cases (sentencing governed by § 775.082(1): death or life). Setting a
    // fine on capital cases would mislead. — § 775.083 does not specify a
    // fine ceiling for capital cases (sentencing governed by § 775.082(1):
    // death or life). Setting a fine on capital cases would mislead.
  ],

  OH: [
    // R.C. 2929.18(A)(3) — felony financial sanctions (fine ceilings).
    {
      offense_class: '1st Degree Felony',
      fine_max: '$20,000',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.18',
      source_label: 'Ohio R.C. § 2929.18(A)(3)(a)',
    },
    {
      offense_class: '2nd Degree Felony',
      fine_max: '$15,000',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.18',
      source_label: 'Ohio R.C. § 2929.18(A)(3)(b)',
    },
    {
      offense_class: '3rd Degree Felony',
      fine_max: '$10,000',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.18',
      source_label: 'Ohio R.C. § 2929.18(A)(3)(c)',
    },
    {
      offense_class: '4th Degree Felony',
      fine_max: '$5,000',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.18',
      source_label: 'Ohio R.C. § 2929.18(A)(3)(d)',
    },
    {
      offense_class: '5th Degree Felony',
      fine_max: '$2,500',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.18',
      source_label: 'Ohio R.C. § 2929.18(A)(3)(e)',
    },
    // R.C. 2929.28(A)(2)(a) — misdemeanor financial sanctions (fine ceilings).
    {
      offense_class: '1st Degree Misdemeanor',
      fine_max: '$1,000',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.28',
      source_label: 'Ohio R.C. § 2929.28(A)(2)(a)(i)',
    },
    {
      offense_class: '2nd Degree Misdemeanor',
      fine_max: '$750',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.28',
      source_label: 'Ohio R.C. § 2929.28(A)(2)(a)(ii)',
    },
    {
      offense_class: '3rd Degree Misdemeanor',
      fine_max: '$500',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.28',
      source_label: 'Ohio R.C. § 2929.28(A)(2)(a)(iii)',
    },
    {
      offense_class: '4th Degree Misdemeanor',
      fine_max: '$250',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.28',
      source_label: 'Ohio R.C. § 2929.28(A)(2)(a)(iv)',
    },
    {
      offense_class: 'Minor Misdemeanor',
      fine_max: '$150',
      source_url: 'https://codes.ohio.gov/ohio-revised-code/section-2929.28',
      source_label: 'Ohio R.C. § 2929.28(A)(2)(a)(v)',
    },
  ],

  VA: [
    // Va. Code § 18.2-10 — felony fine ceilings.
    // Class 1 Felony intentionally excluded — capital/life sentencing
    // dominates; tacking a fine ceiling could downplay severity.
    {
      offense_class: 'Class 2 Felony',
      fine_max: '$100,000',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-10/',
      source_label: 'Va. Code § 18.2-10(b)',
    },
    {
      offense_class: 'Class 3 Felony',
      fine_max: '$100,000',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-10/',
      source_label: 'Va. Code § 18.2-10(c)',
    },
    {
      offense_class: 'Class 4 Felony',
      fine_max: '$100,000',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-10/',
      source_label: 'Va. Code § 18.2-10(d)',
    },
    // Class 5/6 felonies: alternative sentencing — but the FINE ceiling is
    // identical for both forms ($2,500 per § 18.2-10(e)(f), capped at the
    // standard misdemeanor maximum even when prosecuted as a felony).
    {
      offense_class: 'Class 5 Felony',
      fine_max: '$2,500',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-10/',
      source_label: 'Va. Code § 18.2-10(e)',
    },
    {
      offense_class: 'Class 6 Felony',
      fine_max: '$2,500',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-10/',
      source_label: 'Va. Code § 18.2-10(f)',
    },
    //
    // Va. Code § 18.2-11 — misdemeanor fine ceilings.
    {
      offense_class: 'Class 1 Misdemeanor',
      fine_max: '$2,500',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-11/',
      source_label: 'Va. Code § 18.2-11(a)',
    },
    {
      offense_class: 'Class 2 Misdemeanor',
      fine_max: '$1,000',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-11/',
      source_label: 'Va. Code § 18.2-11(b)',
    },
    {
      offense_class: 'Class 3 Misdemeanor',
      fine_max: '$500',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-11/',
      source_label: 'Va. Code § 18.2-11(c)',
    },
    {
      offense_class: 'Class 4 Misdemeanor',
      fine_max: '$250',
      source_url: 'https://law.lis.virginia.gov/vacode/title18.2/chapter1/section18.2-11/',
      source_label: 'Va. Code § 18.2-11(d)',
    },
  ],
};

function parseArgs() {
  const args = { dryRun: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

export async function backfillFineMax({ dryRun, dbFactory } = {}) {
  console.log('=== backfill-jurisdiction-fine-max ' + new Date().toISOString() + ' ===');
  console.log('  dry-run: ' + !!dryRun);

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  const summary = { dry_run: !!dryRun, jurisdictions: {}, total_updated: 0 };
  try {
    for (const [jurisdiction, rules] of Object.entries(BACKFILL_RULES)) {
      const jurSummary = { rules_evaluated: rules.length, rule_results: [] };
      for (const rule of rules) {
        const { rows: candidates } = await client.query(
          `SELECT id::text, common_charge_slug, statute_number
             FROM jurisdiction_statutes
            WHERE jurisdiction = $1
              AND active = true
              AND offense_class = $2
              AND fine_max IS NULL`,
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
          const { rowCount } = await client.query(
            `UPDATE jurisdiction_statutes
                SET fine_max = $1,
                    source_urls = ARRAY(
                      SELECT DISTINCT u FROM unnest(
                        COALESCE(source_urls, '{}'::text[]) || $2::text
                      ) AS u
                    ),
                    verification_notes = COALESCE(verification_notes, '') ||
                      ' [calculated-fine-backfill 2026-04-25: fine_max derived from ' || $3 || ']',
                    updated_at = NOW()
              WHERE jurisdiction = $4
                AND active = true
                AND offense_class = $5
                AND fine_max IS NULL`,
            [rule.fine_max, rule.source_url, rule.source_label, jurisdiction, rule.offense_class],
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
  await backfillFineMax(args);
  console.log('\n=== done ===');
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
