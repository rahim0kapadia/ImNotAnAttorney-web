/**
 * Bulk Master Extractor — Single-Pass 8-Table Processor (DB-first Phase 1)
 *
 * Combines 7 separate opinions extractors + appeal Phase 2 into ONE
 * streaming pass over CourtListener opinion bodies.
 *
 * 2026-05-04 Phase 2 rewrite: Phase 1 reads from cl_opinion_bodies (DB,
 * 1.5M rows) via chunked keyset pagination on opinion_id. The previous
 * csv-parse-over-bz2 design silently corrupted rows when legal text
 * contained unquoted commas (relax_quotes shifted trailing columns —
 * same bug class that broke T5 and T6). cl_opinion_bodies is the already-
 * loaded DB version of the same source data, so no parser is involved.
 * See docs/plans/2026-05-04-phase2-bulk-master-db-first-design.md.
 *
 * Phase 0: Load citation-map for appeal correlator (522 MB bz2 → citingOpinionIds Set)
 *          NOTE: Phase 0 still uses csv-parse over the citation-map bz2.
 *          Lower corruption risk (two-bigint schema, no legal text). Migration
 *          tracked separately as cl_citations bulk-load follow-up.
 * Phase 1: Chunked keyset over cl_opinion_bodies, run ALL 8 extractors per record.
 * Phase 2: Post-stream aggregation + SQL generation for all 8 tables.
 * Phase 3: Apply all SQL to Supabase in batches.
 *
 * Tables populated:
 *   1. judge_quotes              — verbatim judicial holding quotes
 *   2. sentencing_distributions  — per-judge sentencing percentiles
 *   3. officer_reliability       — officer testimony + credibility scores
 *   4. judge_prosecutor_pairings — judge-prosecutor motion grant rates
 *   5. bench_jury_divergence     — bench vs jury acquittal rate divergence
 *   6. judge_profiles UPDATE     — aggregate bench/jury acquittal rates
 *   7. co_defendant_analysis     — co-defendant outcome divergences
 *   8. plea_discount_curves      — plea vs trial sentence discount modeling
 *   9. appellate_trends          — appeal reversal/affirmance rates by issue
 *
 * Prerequisites:
 *   - cl_opinion_bodies populated (1.5M rows; loaded via scripts/cl-bulk-loader.mjs)
 *   - data/bulk-verify/cl-bulk/citation-map-2026-03-31.csv.bz2 (Phase 0 only, 522 MB)
 *   - data/bulk-verify/statute-case-law-dump.json
 *   - All target tables created (migrations applied)
 *   - judge_profiles table populated
 *
 * Usage:
 *   node scripts/bulk-master-extractor.mjs                            # Generate SQL only
 *   node scripts/bulk-master-extractor.mjs --apply                    # Generate + apply
 *   node scripts/bulk-master-extractor.mjs --dry-run                  # Stats only
 *   node scripts/bulk-master-extractor.mjs --skip-appeal-phase0       # Skip citation-map load
 *   node scripts/bulk-master-extractor.mjs --tables judge_quotes,sentencing_distributions
 *   node scripts/bulk-master-extractor.mjs --limit 100                # First N cluster matches
 *   node scripts/bulk-master-extractor.mjs --apply --chunk-size 2000  # smaller DB chunks
 *   node scripts/bulk-master-extractor.mjs --apply --resume-from 5000000  # opinion_id > 5M
 *   node scripts/bulk-master-extractor.mjs --apply --no-delta-gate    # reserved/no-op (full scan is default)
 *
 * Verification gate: pg_stat_user_tables.n_tup_ins / n_tup_upd on each
 * of the 8 target tables IS ground truth. Compare to script-reported
 * counters; mismatch = halt.
 */

import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";
import { query, end as endDb } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 500;

const OPINIONS_BZ2 = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-2026-03-31.csv.bz2");
const OPINIONS_FILTERED = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-filtered.csv");
const CITATION_MAP_BZ2 = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "citation-map-2026-03-31.csv.bz2");
const DUMP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "master-extractor-updates");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");
const skipAppealPhase0 = args.includes("--skip-appeal-phase0");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// Phase 1 DB-first keyset pagination flags (mirrors bulk-extract-charge-types.mjs).
// Phase 1 source switched from csv-parse over 50 GB bz2 to chunked SQL over
// cl_opinion_bodies (1.5M rows). See docs/plans/2026-05-04-phase2-bulk-master-db-first-design.md.
const chunkSizeIdx = args.indexOf("--chunk-size");
const chunkSize = chunkSizeIdx >= 0 ? parseInt(args[chunkSizeIdx + 1], 10) : 5000;
const resumeIdx = args.indexOf("--resume-from");
const resumeFrom = resumeIdx >= 0 ? parseInt(args[resumeIdx + 1], 10) : 0;
const noDeltaGate = args.includes("--no-delta-gate");
const PHASE1_MIN_TEXT_LEN = 200;

// Parse --tables flag: comma-separated list of table names to run
const ALL_TABLE_NAMES = [
  "judge_quotes", "sentencing_distributions", "officer_reliability",
  "judge_prosecutor_pairings", "bench_jury_divergence", "co_defendant_analysis",
  "plea_discount_curves", "appellate_trends",
];
const tablesIdx = args.indexOf("--tables");
const enabledTables = new Set(
  tablesIdx >= 0 ? args[tablesIdx + 1].split(",").map(t => t.trim()) : ALL_TABLE_NAMES
);

// ════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ════════════════════════════════════════════════════════════════════════════

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("'").join("''") + "'";
}

function escArrayLiteral(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map(function (s) {
    const inner = String(s).split("\\").join("\\\\").split('"').join('\\"');
    return '"' + inner + '"';
  });
  const literal = "{" + items.join(",") + "}";
  return "'" + literal.split("'").join("''") + "'::text[]";
}

function escJsonb(obj) {
  const json = JSON.stringify(obj);
  return "'" + json.split("'").join("''") + "'::jsonb";
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function findBzcat() {
  const paths = [
    "C:\\Program Files\\Git\\usr\\bin\\bzcat.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe",
    "bzcat",
  ];
  for (const p of paths) {
    if (p === "bzcat") return p;
    try { if (fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
  }
  return "bzcat";
}

function stripHtml(html) {
  if (!html) return "";
  const parts = html.split("<");
  const out = [];
  for (const part of parts) {
    const closeIdx = part.indexOf(">");
    out.push(closeIdx >= 0 ? part.slice(closeIdx + 1) : part);
  }
  return out.join("").trim();
}

function getText(record) {
  let text = record.plain_text || "";
  if (text.length < 200) {
    const html = record.html_with_citations || record.html || record.html_columbia || "";
    if (html && html.length > 200) {
      text = stripHtml(html);
    }
  }
  return text;
}

let supabaseToken = null;
function loadToken() {
  if (supabaseToken) return;
  const parentEnv = fs.readFileSync(
    path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
  );
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.slice(22).trim();
      break;
    }
  }
}

function supabaseQuery(sql) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: "/v1/projects/" + PROJECT_REF + "/database/query",
      method: "POST",
      headers: {
        Authorization: "Bearer " + supabaseToken,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, function (res) {
      let data = "";
      res.on("data", function (d) { data += d; });
      res.on("end", function () {
        if (res.statusCode >= 400) reject(new Error("SQL " + res.statusCode + ": " + data.slice(0, 300)));
        else { try { resolve(JSON.parse(data)); } catch (e) { resolve(data); } }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function loadServiceKey() {
  const envPath = path.resolve(PROJECT_ROOT, ".env.local");
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      return line.slice("SUPABASE_SERVICE_ROLE_KEY=".length).trim();
    }
  }
  return null;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function median(sorted) {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ════════════════════════════════════════════════════════════════════════════
// SIGNAL CONSTANTS, exact copies from individual extractors
// ════════════════════════════════════════════════════════════════════════════

// ── 1. Judge Quotes ────────────────────────────────────────────────────────

const JUDGE_PHRASE_ANCHORS = [
  "we hold that",
  "we held that",
  "this court holds",
  "this court held",
  "we conclude that",
  "we concluded that",
  "we find that",
  "we found that",
  "it is ordered that",
  "it is hereby ordered",
  "we reverse",
  "we affirm",
  "we therefore hold",
];

const TOPIC_SIGNALS = [
  ["suppression", "suppress", "suppression"],
  ["dismissal", "dismiss", "dismissal"],
  ["sentencing", "sentenc"],
  ["mistrial", "mistrial"],
  ["habeas", "habeas"],
  ["plea", "plea"],
  ["ineffective_assistance", "ineffective", "strickland"],
  ["jury_instruction", "jury instruction"],
  ["probable_cause", "probable cause"],
  ["search_seizure", "search and seizure", "fourth amendment"],
];

// ── 2. Sentencing Outlier ──────────────────────────────────────────────────

const SENTENCING_PATTERNS = [
  "sentenced to",
  "term of imprisonment of",
  "imprisonment for",
  "sentence of",
  "years in prison",
  "months in prison",
  "-year sentence",
  "-month sentence",
];

const DURATION_UNITS = {
  "year": 12, "years": 12,
  "month": 1, "months": 1,
  "day": 1 / 30, "days": 1 / 30,
};

// ── 3. Officer Reliability ─────────────────────────────────────────────────

const OFFICER_TITLES = [
  "officer ",
  "detective ",
  "sergeant ",
  "deputy ",
  "trooper ",
  "agent ",
  "corporal ",
  "lieutenant ",
];

const CREDIBILITY_NEGATIVE = [
  "not credible",
  "lacked credibility",
  "incredible",
  "discredited",
  "impeached",
  "contradicted by",
  "inconsistent with",
  "suppressed",
  "brady",
  "false testimony",
  "fabricated",
  "excessive force",
  "dishonest",
  "untrustworthy",
  "perjured",
  "bias",
];

// ── 4. Judge-Prosecutor Pairing ────────────────────────────────────────────

const PROSECUTOR_PATTERNS = [
  "assistant district attorney ",
  "assistant state attorney ",
  "assistant united states attorney ",
  "prosecutor ",
  "district attorney ",
  "state attorney ",
  "ada ",
  "ausa ",
  "the state, represented by ",
  "the government, represented by ",
];

const MOTION_SIGNALS = [
  ["suppress_motion", "motion to suppress", "suppression motion", "motion for suppression"],
  ["dismiss_motion", "motion to dismiss", "motion for dismissal"],
  ["in_limine_motion", "motion in limine"],
  ["new_trial_motion", "motion for new trial", "motion for a new trial"],
  ["mistrial_motion", "motion for mistrial", "motion for a mistrial"],
  ["continuance_motion", "motion for continuance", "motion to continue"],
  ["severance_motion", "motion for severance", "motion to sever"],
  ["change_of_venue_motion", "motion for change of venue", "change of venue motion"],
  ["discovery_motion", "motion for discovery", "motion to compel discovery", "discovery motion"],
  ["franks_motion", "franks hearing", "franks motion"],
  ["speedy_trial_motion", "motion for speedy trial", "speedy trial motion"],
  ["competency_motion", "motion for competency", "competency hearing"],
  ["recusal_motion", "motion to recuse", "motion for recusal", "motion for disqualification"],
  ["bill_of_particulars", "bill of particulars", "motion for bill of particulars"],
  ["pretrial_release_motion", "motion for pretrial release", "motion for bond reduction", "motion to modify bond"],
  ["judgment_acquittal_motion", "motion for judgment of acquittal", "judgment of acquittal", "rule 29 motion"],
  ["arrest_judgment_motion", "motion in arrest of judgment"],
  ["withdraw_plea_motion", "motion to withdraw plea", "motion to withdraw guilty plea"],
];

const RULING_GRANTED = [
  "the motion is granted", "motion was granted", "motion granted", "granted the motion",
  "suppressed the evidence", "evidence was suppressed", "suppression was proper",
  "reversed on this ground", "reversed and remanded",
];

const RULING_DENIED = [
  "the motion is denied", "motion was denied", "motion denied", "denied the motion",
  "affirmed the denial", "properly denied", "no abuse of discretion in denying",
  "the motion is overruled",
];

// ── 5. Bench/Jury Divergence ───────────────────────────────────────────────

const BENCH_SIGNALS = [
  "bench trial",
  "non-jury trial",
  "tried without a jury",
  "tried to the court",
  "court trial",
  "waived jury",
  "waiver of jury",
  "stipulated bench trial",
];

const JURY_SIGNALS = [
  "jury trial",
  "tried before a jury",
  "jury returned a verdict",
  "jury found",
  "jury convicted",
  "jury acquitted",
  "the jury",
  "jury deliberat",
];

const BJ_ACQUITTAL_SIGNALS = [
  "acquitted",
  "not guilty",
  "judgment of acquittal",
  "directed verdict",
];

const BJ_CONVICTION_SIGNALS = [
  "convicted",
  "found guilty",
  "guilty verdict",
];

const BJ_DISMISSAL_SIGNALS = [
  "dismissed",
  "nolle prosequi",
  "nol pros",
];

// ── 6. Co-Defendant Divergence ─────────────────────────────────────────────

const CO_DEFENDANT_SIGNALS = [
  "co-defendant",
  "codefendant",
  "jointly charged",
  "jointly indicted",
  "tried together",
  "severed from",
  "companion case",
  "related case",
  "co-conspirator",
];

const CD_ACQUITTAL_SIGNALS = ["acquitted", "not guilty", "dismissed", "acquittal"];
const CD_CONVICTION_SIGNALS = ["convicted", "found guilty", "guilty verdict", "conviction"];
const CD_PLEA_SIGNALS = ["plea", "pled guilty", "pleaded guilty", "plea of guilty"];
const CD_SENTENCING_SIGNALS = ["sentenced to", "sentence to", "term of imprisonment", "imposed sentence"];

const CD_LEGAL_ISSUES = [
  ["fourth_amendment", "fourth amendment", "search and seizure"],
  ["fifth_amendment", "fifth amendment", "miranda"],
  ["sixth_amendment", "sixth amendment", "right to counsel"],
  ["brady_violation", "brady violation", "brady material"],
  ["ineffective_assistance", "ineffective assistance", "strickland"],
  ["double_jeopardy", "double jeopardy"],
  ["hearsay", "hearsay"],
  ["sufficiency_of_evidence", "insufficient evidence", "sufficiency of the evidence"],
];

// ── 7. Plea Discount ──────────────────────────────────────────────────────

const PLEA_CASE_SIGNALS = [
  "guilty plea",
  "pled guilty",
  "pleaded guilty",
  "plea of guilty",
  "plea agreement",
  "plea bargain",
  "plea deal",
  "nolo contendere",
  "no contest",
  "plea colloquy",
  "entered a plea",
  "accepted the plea",
];

const TRIAL_CASE_SIGNALS = [
  "jury trial",
  "bench trial",
  "trial by jury",
  "tried before",
  "went to trial",
  "jury returned",
  "jury found",
  "the verdict",
  "found guilty after trial",
  "convicted after trial",
];

const SENTENCE_PHRASES = [
  "sentenced to ",
  "sentence of ",
  "term of imprisonment of ",
  "imprisonment for ",
  "incarceration for ",
  "confinement for ",
];

// ── 8. Appeal Correlator ───────────────────────────────────────────────────

const ISSUE_SIGNALS = [
  ["fourth_amendment", "fourth amendment", "4th amendment", "search and seizure", "warrantless search", "probable cause", "reasonable suspicion"],
  ["fifth_amendment", "fifth amendment", "5th amendment", "miranda", "self-incrimination", "custodial interrogation", "right to remain silent"],
  ["sixth_amendment", "sixth amendment", "6th amendment", "right to counsel", "confrontation clause", "cross-examination", "compulsory process"],
  ["eighth_amendment", "eighth amendment", "8th amendment", "cruel and unusual", "excessive bail", "excessive fine"],
  ["fourteenth_amendment", "fourteenth amendment", "14th amendment", "due process", "equal protection"],
  ["brady_violation", "brady violation", "brady material", "exculpatory evidence", "brady v. maryland"],
  ["giglio_violation", "giglio material", "giglio violation", "impeachment evidence"],
  ["ineffective_assistance", "ineffective assistance", "strickland", "ineffective counsel"],
  ["speedy_trial", "speedy trial", "right to speedy trial", "speedy trial act"],
  ["double_jeopardy", "double jeopardy", "twice placed in jeopardy"],
  ["chain_of_custody", "chain of custody", "break in the chain"],
  ["hearsay", "hearsay", "hearsay exception", "out-of-court statement"],
  ["expert_testimony", "daubert", "frye", "expert witness", "expert testimony", "scientific evidence"],
  ["identification", "eyewitness identification", "show-up identification", "photographic lineup", "suggestive lineup"],
  ["confession", "involuntary confession", "coerced confession", "voluntariness"],
  ["jury_instruction", "jury instruction", "jury charge", "erroneous instruction"],
  ["prosecutorial_misconduct", "prosecutorial misconduct", "improper argument", "golden rule argument"],
  ["sufficiency_of_evidence", "sufficiency of the evidence", "insufficient evidence"],
  ["sentencing", "sentencing guidelines", "mitigating factor", "aggravating factor", "departure from guidelines"],
  ["jurisdiction", "subject matter jurisdiction", "personal jurisdiction", "venue"],
];

const REVERSAL_SIGNALS = [
  "reversed", "reverse the", "we reverse",
  "vacated", "we vacate",
  "remanded", "remand for",
  "reversed and remanded",
];

const AFFIRMANCE_SIGNALS = [
  "affirmed", "we affirm", "judgment affirmed",
  "affirm the",
];

// ════════════════════════════════════════════════════════════════════════════
// EXTRACTION FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

// ── Shared: Judge matching ─────────────────────────────────────────────────

let judgeMap = new Map();   // lowercased name → {id, name}
let judgeById = new Map();  // id string → {id, name}

function matchJudge(authorField) {
  if (!authorField) return null;
  const lower = authorField.toLowerCase().trim();
  if (!lower) return null;
  for (const [name, judge] of judgeMap) {
    if (lower.indexOf(name) >= 0 || name.indexOf(lower) >= 0) return judge;
  }
  return null;
}

// Strict exact-name lookup, used for pairings and bench/jury divergence where
// substring collisions would corrupt judge-specific aggregates (findings #5/#6).
function exactJudge(authorField) {
  if (!authorField) return null;
  const key = authorField.toLowerCase().trim();
  if (!key) return null;
  return judgeMap.get(key) || null;
}

// ── 1. Judge Quotes ────────────────────────────────────────────────────────

const quoteResults = [];    // flat array of {judge_id, quote, topic, case_cited, source_url, cluster_id}
let quotesExtracted = 0;

function extractSentence(text, matchIndex) {
  let start = 0;
  for (let i = matchIndex - 1; i >= 0; i--) {
    if (text[i] === "." || text[i] === ";" || text[i] === "\n") {
      start = i + 1;
      break;
    }
  }
  while (start < text.length && (text[start] === " " || text[start] === "\t" || text[start] === "\r" || text[start] === "\n")) start++;

  let end = text.length;
  for (let i = matchIndex; i < text.length; i++) {
    if (text[i] === "." || text[i] === ";") {
      end = i + 1;
      break;
    }
  }

  let sentence = text.slice(start, end).trim();
  if (sentence.length > 500) sentence = sentence.slice(0, 497) + "...";
  return sentence;
}

function classifyQuoteTopic(quote) {
  const lower = quote.toLowerCase();
  for (const [topic, ...phrases] of TOPIC_SIGNALS) {
    for (const phrase of phrases) {
      if (lower.indexOf(phrase) >= 0) return topic;
    }
  }
  return "general";
}

function extractJudgeQuotes(clusterId, lower, text, judge, dumpRow, record) {
  const quotes = [];
  const seen = new Set();
  const maxQuotes = 10;

  for (const anchor of JUDGE_PHRASE_ANCHORS) {
    let idx = 0;
    while (quotes.length < maxQuotes) {
      idx = lower.indexOf(anchor, idx);
      if (idx === -1) break;

      const sentence = extractSentence(text, idx);
      if (seen.has(sentence) || sentence.length < 40) { idx += anchor.length; continue; }

      seen.add(sentence);
      quotes.push({
        quote: sentence,
        topic: classifyQuoteTopic(sentence),
      });
      idx += anchor.length;
    }
    if (quotes.length >= maxQuotes) break;
  }

  const caseName = dumpRow ? (dumpRow.case_name || "") : "";
  for (const q of quotes) {
    quoteResults.push({
      judge_id: judge ? judge.id : null,
      quote: q.quote,
      topic: q.topic,
      case_cited: caseName,
      source_url: "https://www.courtlistener.com/opinion/" + clusterId + "/",
      cluster_id: clusterId,
    });
    quotesExtracted++;
  }
}

// ── 2. Sentencing Outlier ──────────────────────────────────────────────────

// Map<"judge_id|jurisdiction|charge_slug", {judge_id, jurisdiction, charge_slug, sentences: number[], clusters: Set}>
const sentencingAccum = new Map();
let sentencingExtracted = 0;

function extractNumberAfterPhrase(text, phraseIdx, phraseLen) {
  let start = phraseIdx + phraseLen;
  while (start < text.length && text[start] === " ") start++;
  let end = start;
  while (end < text.length && ((text[end] >= "0" && text[end] <= "9") || text[end] === ".")) end++;
  if (end === start) return null;
  const num = parseFloat(text.slice(start, end));
  return isNaN(num) ? null : num;
}

function readUnitWord(text, numEndIdx) {
  let idx = numEndIdx;
  while (idx < text.length && text[idx] === " ") idx++;
  let end = idx;
  while (end < text.length && ((text[end] >= "a" && text[end] <= "z") || (text[end] >= "A" && text[end] <= "Z"))) end++;
  return text.slice(idx, end).toLowerCase();
}

function extractSentencing(clusterId, lower, judge, dumpRow, record) {
  const sentences = [];

  for (const pattern of SENTENCING_PATTERNS) {
    let searchIdx = 0;
    while (searchIdx < lower.length) {
      const idx = lower.indexOf(pattern, searchIdx);
      if (idx < 0) break;

      const num = extractNumberAfterPhrase(lower, idx, pattern.length);
      if (num !== null && num > 0) {
        // Find where the number ends to read the unit
        let numStart = idx + pattern.length;
        while (numStart < lower.length && lower[numStart] === " ") numStart++;
        let numEnd = numStart;
        while (numEnd < lower.length && ((lower[numEnd] >= "0" && lower[numEnd] <= "9") || lower[numEnd] === ".")) numEnd++;

        const unit = readUnitWord(lower, numEnd);
        let months = num;
        if (unit && DURATION_UNITS[unit]) {
          months = num * DURATION_UNITS[unit];
        } else if (pattern.indexOf("year") >= 0) {
          months = num * 12;
        } else if (pattern.indexOf("day") >= 0) {
          months = num / 30;
        }

        if (months > 0 && months < 1200) {
          sentences.push(months);
        }
      }
      searchIdx = idx + 1;
    }
  }

  if (sentences.length === 0) return;

  const uniqueSentences = [];
  const seenSet = new Set();
  for (const s of sentences) {
    if (!seenSet.has(s)) {
      seenSet.add(s);
      uniqueSentences.push(s);
    }
  }

  const judgeId = judge ? judge.id : "unknown";
  const jurisdiction = dumpRow ? (dumpRow.jurisdiction || "unknown") : "unknown";
  const chargeSlug = dumpRow ? (dumpRow.statute_slug || "unknown") : "unknown";
  const key = judgeId + "|" + jurisdiction + "|" + chargeSlug;

  if (!sentencingAccum.has(key)) {
    sentencingAccum.set(key, {
      judge_id: judge ? judge.id : null,
      jurisdiction: jurisdiction,
      charge_slug: chargeSlug,
      sentences: [],
      clusters: new Set(),
    });
  }

  const entry = sentencingAccum.get(key);
  for (const s of uniqueSentences) entry.sentences.push(s);
  entry.clusters.add(clusterId);
  sentencingExtracted++;
}

// ── 3. Officer Reliability ─────────────────────────────────────────────────

// Map<"Title Surname", {title, name, testimony_count, discredited_count, clusters: Set}>
const officerAccum = new Map();
let officerExtracted = 0;

function extractOfficerName(text, titleEndIdx) {
  let start = titleEndIdx;
  while (start < text.length && text[start] === " ") start++;
  let end = start;
  while (end < text.length && end - start < 40) {
    const ch = text[end];
    if (ch === "," || ch === "." || ch === ";" || ch === ":" || ch === "(" || ch === "\n") break;
    end++;
  }
  const name = text.slice(start, end).trim();
  if (name.length < 2) return null;
  if (name[0] < "A" || name[0] > "Z") return null;
  return name;
}

function extractOfficerReliability(clusterId, lower, text) {
  let foundAny = false;

  // First pass: find all officer mentions and count them
  const localOfficers = new Map();

  for (const title of OFFICER_TITLES) {
    let searchIdx = 0;
    while (true) {
      const idx = lower.indexOf(title, searchIdx);
      if (idx === -1) break;
      const titleEndIdx = idx + title.length;
      const name = extractOfficerName(text, titleEndIdx);
      if (name) {
        const key = title.trim() + " " + name;
        if (!localOfficers.has(key)) {
          localOfficers.set(key, { title: title.trim(), name: name, testimony_count: 0, discredited_count: 0 });
        }
        localOfficers.get(key).testimony_count++;
        searchIdx = titleEndIdx;
      } else {
        searchIdx = idx + 1;
      }
    }
  }

  // Second pass: check credibility signals in context around each mention
  for (const title of OFFICER_TITLES) {
    let searchIdx = 0;
    while (true) {
      const idx = lower.indexOf(title, searchIdx);
      if (idx === -1) break;
      const titleEndIdx = idx + title.length;
      const name = extractOfficerName(text, titleEndIdx);
      if (name) {
        const key = title.trim() + " " + name;
        const officer = localOfficers.get(key);
        if (officer) {
          const contextStart = Math.max(0, idx - 1500);
          const contextEnd = Math.min(lower.length, titleEndIdx + 1500);
          const context = lower.slice(contextStart, contextEnd);
          for (const signal of CREDIBILITY_NEGATIVE) {
            if (context.indexOf(signal) >= 0) {
              officer.discredited_count++;
              break;
            }
          }
        }
        searchIdx = titleEndIdx;
      } else {
        searchIdx = idx + 1;
      }
    }
  }

  // Merge local into global
  for (const [key, info] of localOfficers) {
    if (!officerAccum.has(key)) {
      officerAccum.set(key, {
        title: info.title,
        name: info.name,
        testimony_count: 0,
        discredited_count: 0,
        clusters: new Set(),
      });
    }
    const global = officerAccum.get(key);
    global.testimony_count += info.testimony_count;
    global.discredited_count += info.discredited_count;
    global.clusters.add(clusterId);
    foundAny = true;
  }

  if (foundAny) officerExtracted++;
}

// ── 4. Judge-Prosecutor Pairing ────────────────────────────────────────────

// Nested composite Map to avoid pipe-delimiter collisions in prosecutor names
// or motion types (finding #8):
//   Map<judge_id, Map<prosecutor_name, Map<motion_type, {grant_count, deny_count, clusters: Set}>>>
const pairingAccum = new Map();
let pairingExtracted = 0;

function extractProsecutors(text, lower) {
  const prosecutors = new Set();
  for (const pattern of PROSECUTOR_PATTERNS) {
    let idx = lower.indexOf(pattern);
    while (idx >= 0) {
      const nameStart = idx + pattern.length;
      let nameEnd = nameStart;
      while (nameEnd < text.length) {
        const char = text[nameEnd];
        if (char === "," || char === "." || char === ";") break;
        if (char === " " && nameEnd > nameStart + 2) {
          if (nameEnd + 1 < text.length && text[nameEnd + 1] >= "a" && text[nameEnd + 1] <= "z") break;
        }
        nameEnd++;
      }
      const name = text.slice(nameStart, nameEnd).trim();
      if (name.length >= 2 && name[0] >= "A" && name[0] <= "Z") {
        prosecutors.add(name);
      }
      idx = lower.indexOf(pattern, idx + 1);
    }
  }
  return Array.from(prosecutors);
}

function extractMotionOutcomes(lower) {
  const motions = new Set();
  const outcomes = {};

  for (const [canonical, ...phrases] of MOTION_SIGNALS) {
    for (const phrase of phrases) {
      if (lower.indexOf(phrase) >= 0) { motions.add(canonical); break; }
    }
  }

  for (const motion of motions) {
    let granted = false;
    let denied = false;
    for (const phrase of RULING_GRANTED) {
      if (lower.indexOf(phrase) >= 0) { granted = true; break; }
    }
    for (const phrase of RULING_DENIED) {
      if (lower.indexOf(phrase) >= 0) { denied = true; break; }
    }
    outcomes[motion] = { granted: granted, denied: denied };
  }

  return outcomes;
}

function extractJudgeProsecutorPairing(clusterId, lower, text, judge, dumpRow, record) {
  // Need judge
  // Prefer Supabase UUID from matched judge; CourtListener author_id is numeric and won't match
  let judgeId = judge ? String(judge.id) : null;
  if (!judgeId) return; // skip if no judge match, pairings table requires valid UUID
  if (!judgeId) return;

  const prosecutors = extractProsecutors(text, lower);
  if (prosecutors.length === 0) return;

  const outcomes = extractMotionOutcomes(lower);
  if (Object.keys(outcomes).length === 0) return;

  if (!pairingAccum.has(judgeId)) pairingAccum.set(judgeId, new Map());
  const byProsecutor = pairingAccum.get(judgeId);

  for (const prosecutor of prosecutors) {
    if (!byProsecutor.has(prosecutor)) byProsecutor.set(prosecutor, new Map());
    const byMotion = byProsecutor.get(prosecutor);

    for (const motionType of Object.keys(outcomes)) {
      const outcome = outcomes[motionType];
      if (!byMotion.has(motionType)) {
        byMotion.set(motionType, { grant_count: 0, deny_count: 0, clusters: new Set() });
      }
      const p = byMotion.get(motionType);
      if (outcome.granted) p.grant_count++;
      if (outcome.denied) p.deny_count++;
      p.clusters.add(clusterId);
    }
  }

  pairingExtracted++;
}

// ── 5. Bench/Jury Divergence ───────────────────────────────────────────────

// Map<"judge_id|charge_slug", {bench: string[], jury: string[]}>
const benchJuryAccum = new Map();
let benchJuryExtracted = 0;

function classifyBenchJuryTrial(lower) {
  let trialType = null;
  for (const sig of BENCH_SIGNALS) {
    if (lower.indexOf(sig) >= 0) { trialType = "bench"; break; }
  }
  if (!trialType) {
    for (const sig of JURY_SIGNALS) {
      if (lower.indexOf(sig) >= 0) { trialType = "jury"; break; }
    }
  }

  let outcome = null;
  for (const sig of BJ_ACQUITTAL_SIGNALS) {
    if (lower.indexOf(sig) >= 0) { outcome = "acquittal"; break; }
  }
  if (!outcome) {
    for (const sig of BJ_CONVICTION_SIGNALS) {
      if (lower.indexOf(sig) >= 0) { outcome = "conviction"; break; }
    }
  }
  if (!outcome) {
    for (const sig of BJ_DISMISSAL_SIGNALS) {
      if (lower.indexOf(sig) >= 0) { outcome = "dismissal"; break; }
    }
  }

  return { trialType: trialType, outcome: outcome };
}

function extractBenchJuryDivergence(clusterId, lower, judge, dumpRow) {
  const { trialType, outcome } = classifyBenchJuryTrial(lower);
  if (!trialType || !outcome) return;
  if (!judge) return;

  const charges = [];
  if (dumpRow && dumpRow.charge_slug) charges.push(dumpRow.charge_slug);
  if (charges.length === 0 && dumpRow && dumpRow.statute_slug) charges.push(dumpRow.statute_slug);
  if (charges.length === 0) return;

  for (const chargeSlug of charges) {
    const key = judge.id + "|" + chargeSlug;
    if (!benchJuryAccum.has(key)) {
      benchJuryAccum.set(key, { bench: [], jury: [], clusters: new Set() });
    }
    const entry = benchJuryAccum.get(key);
    entry[trialType].push(outcome);
    entry.clusters.add(clusterId);
  }

  benchJuryExtracted++;
}

// ── 6. Co-Defendant Divergence ─────────────────────────────────────────────

const coDefResults = [];    // flat array of {primary_case_id, outcome_diff, divergence_factors, source_urls}
let coDefExtracted = 0;

function extractCoDefendantDivergence(clusterId, lower) {
  for (const signal of CO_DEFENDANT_SIGNALS) {
    const sigLower = signal.toLowerCase();
    let idx = lower.indexOf(sigLower);
    while (idx >= 0) {
      const startIdx = Math.max(0, idx - 1500);
      const endIdx = Math.min(lower.length, idx + 1500);
      const context = lower.slice(startIdx, endIdx);

      let primaryOutcome = "unknown";
      let coDefendantOutcome = "unknown";
      const markerPos = idx - startIdx;

      // Acquittal check
      for (const acq of CD_ACQUITTAL_SIGNALS) {
        const acqIdx = context.indexOf(acq);
        if (acqIdx >= 0) {
          if (acqIdx < markerPos) primaryOutcome = "acquitted";
          else coDefendantOutcome = "acquitted";
          break;
        }
      }

      // Conviction check
      for (const conv of CD_CONVICTION_SIGNALS) {
        const convIdx = context.indexOf(conv);
        if (convIdx >= 0) {
          if (convIdx < markerPos) {
            if (primaryOutcome === "unknown") primaryOutcome = "convicted";
          } else {
            if (coDefendantOutcome === "unknown") coDefendantOutcome = "convicted";
          }
          break;
        }
      }

      // Plea check
      for (const plea of CD_PLEA_SIGNALS) {
        const pleaIdx = context.indexOf(plea);
        if (pleaIdx >= 0) {
          if (pleaIdx < markerPos) {
            if (primaryOutcome === "unknown") primaryOutcome = "plea";
          } else {
            if (coDefendantOutcome === "unknown") coDefendantOutcome = "plea";
          }
          break;
        }
      }

      // Sentencing check
      for (const sent of CD_SENTENCING_SIGNALS) {
        const sentIdx = context.indexOf(sent);
        if (sentIdx >= 0) {
          if (sentIdx < markerPos) {
            if (primaryOutcome !== "acquitted") primaryOutcome = "sentenced";
          } else {
            if (coDefendantOutcome !== "acquitted") coDefendantOutcome = "sentenced";
          }
          break;
        }
      }

      // Legal issues
      const legalIssues = [];
      for (const [canonical, ...phrases] of CD_LEGAL_ISSUES) {
        for (const phrase of phrases) {
          if (context.indexOf(phrase.toLowerCase()) >= 0) {
            legalIssues.push(canonical);
            break;
          }
        }
      }

      // Only record if genuine divergence
      if (primaryOutcome !== "unknown" && coDefendantOutcome !== "unknown" && primaryOutcome !== coDefendantOutcome) {
        coDefResults.push({
          primary_case_id: clusterId,
          outcome_diff: "primary " + primaryOutcome + ", co-defendant " + coDefendantOutcome,
          divergence_factors: {
            co_defendant_signal: signal,
            primary_outcome: primaryOutcome,
            co_defendant_outcome: coDefendantOutcome,
            legal_issues: legalIssues,
          },
          source_url: "https://www.courtlistener.com/opinion/" + clusterId + "/",
        });
        coDefExtracted++;
      }

      idx = lower.indexOf(sigLower, idx + 1);
    }
  }
}

// ── 7. Plea Discount ──────────────────────────────────────────────────────

// Map<"jurisdiction|charge_slug", {jurisdiction, charge_slug, plea_sentences: number[], trial_sentences: number[], clusters: Set}>
const pleaAccum = new Map();
let pleaExtracted = 0;

function extractPleaSentenceMonths(text, phraseIdx, phraseLen) {
  let pos = phraseIdx + phraseLen;
  while (pos < text.length && text[pos] === " ") pos++;

  // Check for "life"
  if (text.slice(pos, pos + 4).toLowerCase() === "life") return 600;

  let numStr = "";
  while (pos < text.length && ((text[pos] >= "0" && text[pos] <= "9") || text[pos] === ".")) {
    numStr += text[pos];
    pos++;
  }
  if (!numStr) return null;
  const num = parseFloat(numStr);
  if (isNaN(num) || num <= 0) return null;

  while (pos < text.length && text[pos] === " ") pos++;
  const remaining = text.slice(pos, pos + 10).toLowerCase();
  if (remaining.indexOf("year") === 0) return num * 12;
  if (remaining.indexOf("month") === 0) return num;
  if (remaining.indexOf("day") === 0) return Math.round((num / 30) * 10) / 10;
  if (remaining.indexOf("week") === 0) return Math.round((num / 4.3) * 10) / 10;

  return null;
}

function extractPleaDiscount(clusterId, lower, dumpRow) {
  // Determine case type: plea or trial (mutually exclusive, plea takes priority)
  let isPlea = false;
  for (const sig of PLEA_CASE_SIGNALS) {
    if (lower.indexOf(sig) >= 0) { isPlea = true; break; }
  }

  let isTrial = false;
  if (!isPlea) {
    for (const sig of TRIAL_CASE_SIGNALS) {
      if (lower.indexOf(sig) >= 0) { isTrial = true; break; }
    }
  }

  if (!isPlea && !isTrial) return;

  // Extract sentence lengths
  const sentences = [];
  for (const phrase of SENTENCE_PHRASES) {
    let searchFrom = 0;
    while (true) {
      const idx = lower.indexOf(phrase, searchFrom);
      if (idx < 0) break;
      const months = extractPleaSentenceMonths(lower, idx, phrase.length);
      if (months !== null && months > 0 && months <= 1200) {
        sentences.push(months);
      }
      searchFrom = idx + phrase.length;
    }
  }

  if (sentences.length === 0) return;

  const jurisdiction = dumpRow ? (dumpRow.jurisdiction || "unknown") : "unknown";
  let chargeSlug = dumpRow ? (dumpRow.charge_slug || dumpRow.charge_type || "unknown") : "unknown";
  chargeSlug = chargeSlug.toLowerCase().split(" ").join("_").split("-").join("_");

  const groupKey = jurisdiction + "|" + chargeSlug;
  if (!pleaAccum.has(groupKey)) {
    pleaAccum.set(groupKey, {
      jurisdiction: jurisdiction,
      charge_slug: chargeSlug,
      plea_sentences: [],
      trial_sentences: [],
      clusters: new Set(),
    });
  }
  const g = pleaAccum.get(groupKey);
  g.clusters.add(clusterId);

  if (isPlea) {
    for (const s of sentences) g.plea_sentences.push(s);
  } else {
    for (const s of sentences) g.trial_sentences.push(s);
  }

  pleaExtracted++;
}

// ── 8. Appeal Correlator (Phase 2, during main stream) ────────────────────

const appealClassifications = [];   // {opinionId, clusterId, argumentType, jurisdiction, year, outcome}
let appealExtracted = 0;

// These get populated in Phase 0
let citingOpinionIds = new Set();
let citingMap = new Map();          // cited_opinion_id → [citing_opinion_id, ...]
let clusterToJurisdiction = {};
let clusterToYear = {};

function classifyReversal(lower) {
  for (const signal of REVERSAL_SIGNALS) {
    if (lower.indexOf(signal) >= 0) return "reversed";
  }
  for (const signal of AFFIRMANCE_SIGNALS) {
    if (lower.indexOf(signal) >= 0) return "affirmed";
  }
  return "other";
}

function extractArgumentType(lower) {
  for (const [canonical, ...phrases] of ISSUE_SIGNALS) {
    for (const phrase of phrases) {
      if (lower.indexOf(phrase) >= 0) return canonical;
    }
  }
  return null;
}

function extractAppealClassification(opinionId, clusterId, lower) {
  const outcome = classifyReversal(lower);
  const argumentType = extractArgumentType(lower);

  const jurisdiction = clusterToJurisdiction[clusterId] || "unknown";
  const year = clusterToYear[clusterId] || null;

  if (argumentType && year) {
    appealClassifications.push({
      opinionId: opinionId,
      clusterId: clusterId,
      argumentType: argumentType,
      jurisdiction: jurisdiction,
      year: parseInt(year, 10),
      outcome: outcome,
    });
    appealExtracted++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 0: Load citation-map for appeal correlator
// ════════════════════════════════════════════════════════════════════════════

async function runPhase0() {
  const appealEnabled = enabledTables.has("appellate_trends");
  if (!appealEnabled) {
    console.log("  appellate_trends not in --tables, skipping Phase 0.\n");
    return;
  }

  if (skipAppealPhase0) {
    // Try to load from previously saved Phase 1 output
    const savedFile = path.join(PROJECT_ROOT, "data", "bulk-verify", "good-law-graph", "appeal-citing-map.json");
    if (fs.existsSync(savedFile)) {
      console.log("  --skip-appeal-phase0: loading from saved Phase 1 output...");
      const data = JSON.parse(fs.readFileSync(savedFile, "utf8"));
      clusterToJurisdiction = data.clusterToJurisdiction || {};
      clusterToYear = data.clusterToYear || {};
      const rawMap = data.citingMap || {};
      for (const cited of Object.keys(rawMap)) {
        for (const citing of rawMap[cited]) {
          citingOpinionIds.add(String(citing));
        }
        citingMap.set(cited, rawMap[cited].map(String));
      }
      console.log("  Loaded " + citingOpinionIds.size + " citing opinion IDs from saved file.\n");
      return;
    }
    console.log("  --skip-appeal-phase0 but no saved file found, streaming citation-map...\n");
  }

  if (!fs.existsSync(CITATION_MAP_BZ2)) {
    console.log("  WARNING: citation-map CSV not found, skipping appeal correlator.");
    enabledTables.delete("appellate_trends");
    return;
  }

  console.log("  Streaming citation-map CSV (522 MB bz2)...");
  const bzcatPath = findBzcat();
  const bzcat = spawn(bzcatPath, [CITATION_MAP_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", function () {});

  const parser = bzcat.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true,
  }));

  let rowCount = 0;
  let matchCount = 0;
  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 1000000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write("    " + (rowCount / 1000000).toFixed(1) + "M rows, " + matchCount + " citations (" + elapsed.toFixed(0) + "s)\n");
      }

      const citedOpinionId = record.cited_opinion_id;
      const citingOpinionId = record.citing_opinion_id;
      if (!citedOpinionId || !citingOpinionId) continue;

      if (!citingMap.has(citedOpinionId)) {
        citingMap.set(citedOpinionId, []);
      }
      citingMap.get(citedOpinionId).push(citingOpinionId);
      citingOpinionIds.add(String(citingOpinionId));
      matchCount++;
    }
  } catch (parseErr) {
    console.log("\n  CSV parse error at " + (rowCount / 1000000).toFixed(1) + "M rows (continuing with collected data): " + parseErr.message.slice(0, 120));
    try { bzcat.kill(); } catch (e) {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log("  Citation-map complete: " + rowCount + " rows in " + (elapsed / 60).toFixed(1) + " min");
  console.log("  Unique citing opinions: " + citingOpinionIds.size + "\n");
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1: Main stream, run all extractors per record
// ════════════════════════════════════════════════════════════════════════════

async function runPhase1(targetClusters, clusterToDumpRow) {
  // DB-FIRST PHASE 1 (replaces broken csv-parse stream over 50 GB bz2).
  //
  // Source: cl_opinion_bodies (1.5M rows) — already loaded from CL bulk file
  // by scripts/cl-bulk-loader.mjs. Schema: opinion_id BIGINT PK, cluster_id
  // BIGINT, plain_text TEXT, author_str TEXT, text_length INT.
  //
  // Why DB instead of CSV: csv-parse with relax_quotes:true silently SHIFTS
  // trailing columns when legal text contains unquoted commas. Same bug
  // class that broke T5 (#307) and T6 smoke (#306). Direct DB JOIN avoids
  // the parser-corruption surface entirely. See memory
  // lesson-cl-csv-parse-corruption-2026-05-04.md.
  //
  // Keyset pagination on opinion_id (unique PK). cluster_id ordering is NOT
  // used because some clusters span chunk boundaries with multiple opinions,
  // and bulk-master-extractor processes EVERY opinion per cluster (majority
  // + concurring + dissent). opinion_id keyset guarantees no slicing loss.
  console.log("  Streaming cl_opinion_bodies (DB, keyset by opinion_id, chunk=" + chunkSize + ")...");
  console.log("  Resume:     opinion_id > " + resumeFrom);
  console.log("  Min text:   " + PHASE1_MIN_TEXT_LEN + " chars");
  console.log("  Delta gate: " + (noDeltaGate ? "DISABLED (--no-delta-gate)" : "JS-side via targetClusters/citingOpinionIds") + "\n");

  await query("SET statement_timeout = '300s'");

  const processedClusters = new Set();
  let rowCount = 0;
  let matchCount = 0;
  let limitReached = false;
  const startTime = Date.now();

  const e1 = enabledTables.has("judge_quotes");
  const e2 = enabledTables.has("sentencing_distributions");
  const e3 = enabledTables.has("officer_reliability");
  const e4 = enabledTables.has("judge_prosecutor_pairings");
  const e5 = enabledTables.has("bench_jury_divergence");
  const e6 = enabledTables.has("co_defendant_analysis");
  const e7 = enabledTables.has("plea_discount_curves");
  const e8 = enabledTables.has("appellate_trends");

  let cursor = resumeFrom;

  while (!limitReached) {
    let rows;
    try {
      rows = await query(
        "SELECT opinion_id::text AS id, cluster_id::text AS cluster_id, " +
        "       plain_text, author_str AS author " +
        "FROM cl_opinion_bodies " +
        "WHERE opinion_id > $1 AND text_length >= $2 " +
        "ORDER BY opinion_id LIMIT $3",
        [cursor, PHASE1_MIN_TEXT_LEN, chunkSize]
      );
    } catch (e) {
      console.log("\n  Chunk fetch error at opinion_id=" + cursor + ": " + e.message.slice(0, 200));
      console.log("  Stopping; collected data preserved for Phase 2.");
      break;
    }
    if (rows.length === 0) {
      console.log("\n  Reached end of cl_opinion_bodies at opinion_id=" + cursor + ".");
      break;
    }

    for (const record of rows) {
      rowCount++;
      cursor = parseInt(record.id, 10);

      if (rowCount % 50000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(
          "  " + (rowCount / 1000).toFixed(0) + "K rows | " +
          matchCount + " matched | " +
          "quotes: " + quotesExtracted + " | " +
          "sentencing: " + sentencingExtracted + " | " +
          "officers: " + officerExtracted + " | " +
          "pairings: " + pairingExtracted + " | " +
          "bench/jury: " + benchJuryExtracted + " | " +
          "co-def: " + coDefExtracted + " | " +
          "plea: " + pleaExtracted + " | " +
          "appeal: " + appealExtracted + " | " +
          elapsed.toFixed(0) + "s elapsed\n"
        );
      }

      const clusterId = record.cluster_id;
      const opinionId = record.id;

      const isTarget = clusterId && targetClusters.has(clusterId);
      const isCiting = e8 && opinionId && citingOpinionIds.has(String(opinionId));

      if (!isTarget && !isCiting) continue;

      // Get text once, share across extractors. Gate per-extractor by length,
      // originals require 200/300/500 depending on extractor. Short orders
      // produce false positives in detectors expecting multi-page opinions.
      const text = getText(record);
      if (text.length < 200) continue;
      const lower = text.toLowerCase();
      const haveShort = text.length >= 200;  // judge_quotes
      const haveMid = text.length >= 300;    // plea_discount
      const haveLong = text.length >= 500;   // sentencing, officer, pairing, bench/jury, co-def

      if (isTarget) {
        // Process EVERY opinion per cluster (majority + concurring + dissent).
        // Only co-defendant analysis dedupes by cluster (it does this internally).
        matchCount++;

        const dumpRow = clusterToDumpRow.get(clusterId);
        const judge = matchJudge(record.author);
        const strictJudge = exactJudge(record.author);

        if (e1 && haveShort) extractJudgeQuotes(clusterId, lower, text, judge, dumpRow, record);
        if (e2 && haveLong) extractSentencing(clusterId, lower, judge, dumpRow, record);
        if (e3 && haveLong) extractOfficerReliability(clusterId, lower, text);
        if (e4 && haveLong) extractJudgeProsecutorPairing(clusterId, lower, text, strictJudge, dumpRow, record);
        if (e5 && haveLong) extractBenchJuryDivergence(clusterId, lower, strictJudge, dumpRow);
        if (e6 && haveLong) extractCoDefendantDivergence(clusterId, lower);
        if (e7 && haveMid) extractPleaDiscount(clusterId, lower, dumpRow);

        // Limit counts unique clusters, not opinions. Track first-seen.
        if (!processedClusters.has(clusterId)) {
          processedClusters.add(clusterId);
          if (processedClusters.size >= limit) {
            limitReached = true;
            break;
          }
        }
      }

      if (isCiting) {
        extractAppealClassification(String(opinionId), String(clusterId), lower);
      }
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log("\n  Stream complete: " + rowCount + " rows in " + (elapsed / 60).toFixed(1) + " min");
  console.log("  Clusters matched: " + matchCount + (limitReached ? " (limit reached)" : ""));
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: Post-stream aggregation + SQL generation
// ════════════════════════════════════════════════════════════════════════════

function generateAllSQL() {
  const allStmts = {};

  // ── 1. Judge Quotes (flat inserts) ───────────────────────────────────────
  if (enabledTables.has("judge_quotes") && quoteResults.length > 0) {
    const stmts = [];
    for (const r of quoteResults) {
      stmts.push(
        "INSERT INTO judge_quotes (judge_id, quote, topic, case_cited, source_url, cluster_id) VALUES (" +
        (r.judge_id ? esc(r.judge_id) : "NULL") + ", " +
        esc(r.quote) + ", " +
        esc(r.topic) + ", " +
        esc(r.case_cited) + ", " +
        esc(r.source_url) + ", " +
        esc(r.cluster_id) +
        ") ON CONFLICT DO NOTHING;"
      );
    }
    allStmts.judge_quotes = stmts;
    console.log("  judge_quotes: " + stmts.length + " INSERTs");
  }

  // ── 2. Sentencing Distributions (upserts) ────────────────────────────────
  if (enabledTables.has("sentencing_distributions")) {
    const stmts = [];
    for (const [, entry] of sentencingAccum) {
      if (entry.sentences.length < 3) continue;
      const sorted = entry.sentences.sort(function (a, b) { return a - b; });
      const p25 = Math.round(percentile(sorted, 25) * 100) / 100;
      const med = Math.round(percentile(sorted, 50) * 100) / 100;
      const p75 = Math.round(percentile(sorted, 75) * 100) / 100;
      const urls = Array.from(entry.clusters).map(function (cid) {
        return "https://www.courtlistener.com/opinion/" + cid + "/";
      });

      stmts.push(
        "INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)\n" +
        "VALUES (" + esc(entry.judge_id) + ", " + esc(entry.jurisdiction) + ", " + esc(entry.charge_slug) + ", " +
        med + ", " + p25 + ", " + p75 + ", " + entry.sentences.length + ", " + escArrayLiteral(urls) + ")\n" +
        "ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET\n" +
        "  median_months = EXCLUDED.median_months,\n" +
        "  p25 = EXCLUDED.p25,\n" +
        "  p75 = EXCLUDED.p75,\n" +
        "  sample_size = EXCLUDED.sample_size,\n" +
        "  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);"
      );
    }
    allStmts.sentencing_distributions = stmts;
    console.log("  sentencing_distributions: " + stmts.length + " UPSERTs (sample >= 3)");
  }

  // ── 3. Officer Reliability (inserts) ─────────────────────────────────────
  if (enabledTables.has("officer_reliability")) {
    const stmts = [];
    for (const [, info] of officerAccum) {
      if (info.testimony_count < 2) continue;
      const reliabilityScore = Math.max(0, Math.min(1, 1.0 - info.discredited_count / info.testimony_count));
      const clusterArr = Array.from(info.clusters);
      const verificationUrl = "https://www.courtlistener.com/opinion/" + clusterArr[0] + "/";

      stmts.push(
        "INSERT INTO officer_reliability (officer_name, court, jurisdiction, testimony_count, discredited_count, reliability_score, brady_history, source_urls) VALUES (" +
        esc(info.name) + ", 'state', 'multi', " +
        info.testimony_count + ", " + info.discredited_count + ", " +
        reliabilityScore.toFixed(3) + ", " +
        "'" + JSON.stringify(clusterArr.map(String)) + "'::jsonb, " +
        escArrayLiteral([verificationUrl]) +
        ") ON CONFLICT DO NOTHING;"
      );
    }
    allStmts.officer_reliability = stmts;
    console.log("  officer_reliability: " + stmts.length + " INSERTs (testimony >= 2)");
  }

  // ── 4. Judge-Prosecutor Pairings (inserts) ───────────────────────────────
  if (enabledTables.has("judge_prosecutor_pairings")) {
    const stmts = [];
    for (const [judgeId, byProsecutor] of pairingAccum) {
      for (const [prosecutor, byMotion] of byProsecutor) {
        for (const [motionType, data] of byMotion) {
          const sampleSize = data.grant_count + data.deny_count;
          if (sampleSize < 2) continue;
          const grantRate = data.grant_count / sampleSize;
          const urls = Array.from(data.clusters).map(function (cid) {
            return "https://www.courtlistener.com/opinion/" + cid + "/";
          });

          stmts.push(
            "INSERT INTO judge_prosecutor_pairings (judge_id, prosecutor_name, motion_type, grant_rate, sample_size, source_urls) VALUES (" +
            esc(judgeId) + ", " + esc(prosecutor) + ", " + esc(motionType) + ", " +
            grantRate + ", " + sampleSize + ", " + escArrayLiteral(urls) +
            ") ON CONFLICT DO NOTHING;"
          );
        }
      }
    }
    allStmts.judge_prosecutor_pairings = stmts;
    console.log("  judge_prosecutor_pairings: " + stmts.length + " INSERTs (sample >= 2)");
  }

  // ── 5. Bench/Jury Divergence (inserts + judge_profiles UPDATE) ───────────
  if (enabledTables.has("bench_jury_divergence")) {
    const insertStmts = [];
    const judgeAggregates = new Map();

    for (const [key, trials] of benchJuryAccum) {
      const sepIdx = key.indexOf("|");
      const judgeId = key.slice(0, sepIdx);
      const chargeSlug = key.slice(sepIdx + 1);

      if (trials.bench.length < 2 || trials.jury.length < 2) continue;

      const benchAcquittals = trials.bench.filter(function (o) { return o === "acquittal"; }).length;
      const juryAcquittals = trials.jury.filter(function (o) { return o === "acquittal"; }).length;
      const benchRate = benchAcquittals / trials.bench.length;
      const juryRate = juryAcquittals / trials.jury.length;
      const urls = Array.from(trials.clusters).map(function (cid) {
        return "https://www.courtlistener.com/opinion/" + cid + "/";
      });

      insertStmts.push(
        "INSERT INTO bench_jury_divergence (judge_id, charge_slug, bench_acquittal_rate, jury_acquittal_rate, bench_sample, jury_sample, source_urls) VALUES (" +
        esc(judgeId) + ", " + esc(chargeSlug) + ", " +
        benchRate + ", " + juryRate + ", " +
        trials.bench.length + ", " + trials.jury.length + ", " +
        escArrayLiteral(urls) +
        ") ON CONFLICT DO NOTHING;"
      );

      // Aggregate for judge_profiles UPDATE
      if (!judgeAggregates.has(judgeId)) {
        judgeAggregates.set(judgeId, { benchRates: [], juryRates: [] });
      }
      judgeAggregates.get(judgeId).benchRates.push(benchRate);
      judgeAggregates.get(judgeId).juryRates.push(juryRate);
    }

    const updateStmts = [];
    for (const [judgeId, rates] of judgeAggregates) {
      const avgBench = rates.benchRates.reduce(function (a, b) { return a + b; }, 0) / rates.benchRates.length;
      const avgJury = rates.juryRates.reduce(function (a, b) { return a + b; }, 0) / rates.juryRates.length;
      updateStmts.push(
        "UPDATE judge_profiles SET bench_acquittal_rate = " + avgBench + ", jury_acquittal_rate = " + avgJury +
        " WHERE id = " + esc(judgeId) + ";"
      );
    }

    allStmts.bench_jury_divergence = insertStmts;
    allStmts.judge_profiles_update = updateStmts;
    console.log("  bench_jury_divergence: " + insertStmts.length + " INSERTs + " + updateStmts.length + " judge_profiles UPDATEs (bench >= 2 AND jury >= 2)");
  }

  // ── 6. Co-Defendant Analysis (inserts) ───────────────────────────────────
  if (enabledTables.has("co_defendant_analysis") && coDefResults.length > 0) {
    const stmts = [];
    for (const r of coDefResults) {
      stmts.push(
        "INSERT INTO co_defendant_analysis (primary_case_id, co_defendant_case_id, outcome_diff, divergence_factors, source_urls) VALUES (" +
        esc(r.primary_case_id) + ", NULL, " +
        esc(r.outcome_diff) + ", " +
        escJsonb(r.divergence_factors) + ", " +
        "ARRAY[" + esc(r.source_url) + "]::text[]" +
        ") ON CONFLICT DO NOTHING;"
      );
    }
    allStmts.co_defendant_analysis = stmts;
    console.log("  co_defendant_analysis: " + stmts.length + " INSERTs");
  }

  // ── 7. Plea Discount Curves (inserts) ────────────────────────────────────
  if (enabledTables.has("plea_discount_curves")) {
    const stmts = [];
    for (const [, g] of pleaAccum) {
      if (g.plea_sentences.length < 3 || g.trial_sentences.length < 3) continue;

      const pleaSorted = g.plea_sentences.slice().sort(function (a, b) { return a - b; });
      const trialSorted = g.trial_sentences.slice().sort(function (a, b) { return a - b; });

      const baseSentence = median(trialSorted);
      const pleaSentence = median(pleaSorted);
      const cooperationBonus = baseSentence - pleaSentence;

      if (baseSentence <= 0) continue;

      const urls = Array.from(g.clusters).map(function (cid) {
        return "https://www.courtlistener.com/opinion/" + cid + "/";
      });

      stmts.push(
        "INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES (" +
        esc(g.jurisdiction) + ", " + esc(g.charge_slug) + ", " +
        esc(Math.round(baseSentence * 10) / 10) + ", " +
        esc(Math.round(pleaSentence * 10) / 10) + ", " +
        esc(Math.round(cooperationBonus * 10) / 10) + ", " +
        esc(g.plea_sentences.length + g.trial_sentences.length) + ", " +
        escArrayLiteral(urls) +
        ") ON CONFLICT DO NOTHING;"
      );
    }
    allStmts.plea_discount_curves = stmts;
    console.log("  plea_discount_curves: " + stmts.length + " INSERTs (plea >= 3 AND trial >= 3)");
  }

  // ── 8. Appellate Trends (upserts) ────────────────────────────────────────
  if (enabledTables.has("appellate_trends") && appealClassifications.length > 0) {
    // Group by (argumentType, jurisdiction, year)
    const trends = new Map();
    for (const c of appealClassifications) {
      const key = c.argumentType + "|" + c.jurisdiction + "|" + c.year;
      if (!trends.has(key)) {
        trends.set(key, { argumentType: c.argumentType, jurisdiction: c.jurisdiction, year: c.year, reversed: 0, affirmed: 0, other: 0 });
      }
      const group = trends.get(key);
      if (c.outcome === "reversed") group.reversed++;
      else if (c.outcome === "affirmed") group.affirmed++;
      else group.other++;
    }

    const stmts = [];
    for (const [, group] of trends) {
      const total = group.reversed + group.affirmed + group.other;
      if (total < 3) continue;
      const reverseRate = (group.reversed / total).toFixed(4);
      const affirmRate = (group.affirmed / total).toFixed(4);
      const sourceUrl = "https://www.courtlistener.com/";

      stmts.push(
        "INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)\n" +
        "VALUES (" + esc(group.argumentType) + ", " + esc(group.jurisdiction) + ", " + group.year + ", " +
        reverseRate + ", " + affirmRate + ", " + total + ", " + escArrayLiteral([sourceUrl]) + ")\n" +
        "ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET\n" +
        "  reverse_rate = EXCLUDED.reverse_rate,\n" +
        "  affirm_rate = EXCLUDED.affirm_rate,\n" +
        "  sample_size = EXCLUDED.sample_size,\n" +
        "  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);"
      );
    }
    allStmts.appellate_trends = stmts;
    console.log("  appellate_trends: " + stmts.length + " UPSERTs (sample >= 3)");
  }

  return allStmts;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3: Apply SQL to Supabase in batches
// ════════════════════════════════════════════════════════════════════════════

async function applyBatch(tableName, stmts) {
  if (!stmts || stmts.length === 0) return;

  console.log("\n  --- Applying " + tableName + ": " + stmts.length + " statements ---");
  let applied = 0;
  let errors = 0;
  const applyStart = Date.now();

  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const batch = stmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stmts.length / BATCH_SIZE);

    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      const rate = (applied / ((Date.now() - applyStart) / 1000)).toFixed(0);
      process.stdout.write("    Batch " + batchNum + "/" + totalBatches + ": " + batch.length + ", " + rate + "/sec\n");
    } catch (e) {
      errors++;
      console.error("    Batch " + batchNum + ": " + e.message.slice(0, 200));
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n"));
          applied += batch.length;
          errors--;
        } catch (retryErr) {
          console.error("    Retry failed: " + retryErr.message.slice(0, 100));
        }
      }
    }

    if (i + BATCH_SIZE < stmts.length) await sleep(500);
  }

  console.log("    " + tableName + " complete: applied=" + applied + " errors=" + errors);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=== BULK MASTER EXTRACTOR, Single-Pass 8-Table Processor ===\n");
  console.log("Enabled tables: " + Array.from(enabledTables).join(", "));
  console.log("Mode: " + (dryRun ? "DRY RUN" : applyMode ? "GENERATE + APPLY" : "GENERATE SQL ONLY"));
  console.log("Limit: " + (limit === Infinity ? "none" : limit));
  console.log("");

  // ── Validate files ───────────────────────────────────────────────────────
  if (!fs.existsSync(OPINIONS_BZ2)) {
    console.error("ERROR: opinions CSV not found: " + OPINIONS_BZ2);
    process.exit(1);
  }
  if (!fs.existsSync(DUMP_FILE)) {
    console.error("ERROR: dump not found: " + DUMP_FILE);
    process.exit(1);
  }

  // ── Load dump file ───────────────────────────────────────────────────────
  console.log("Loading dump file...");
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));

  // ── Load jurisdiction_statutes resolver ──────────────────────────────────
  // The dump file has jurisdiction_statute_id (FK) but NOT jurisdiction/
  // charge_slug/statute_slug. Without this resolver, sentencing/plea/bench-jury
  // aggregators collapse all rows under "unknown|unknown" and appeal correlator
  // gets no jurisdiction. This is a pre-existing bug in the individual scripts.
  console.log("Loading jurisdiction_statutes resolver...");
  const jurStatuteMap = new Map(); // id → {jurisdiction, charge_slug, statute_number}
  {
    const serviceKey = loadServiceKey();
    if (!serviceKey) {
      console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY not found. Cannot resolve jurisdiction_statutes.");
      process.exit(1);
    }
    // Paginate, PostgREST caps at 1000 rows per request (max-rows config)
    let offset = 0;
    while (offset < 100000) {
      const pageRows = await new Promise(function (resolve, reject) {
        const req = https.request({
          hostname: "jxjbjmgdukwkoclydqdr.supabase.co",
          path: "/rest/v1/jurisdiction_statutes?select=id,jurisdiction,common_charge_slug,statute_number&order=id",
          method: "GET",
          headers: {
            apikey: serviceKey,
            Authorization: "Bearer " + serviceKey,
            Range: offset + "-" + (offset + 999),
            "Range-Unit": "items",
          },
        }, function (res) {
          let data = "";
          res.on("data", function (d) { data += d; });
          res.on("end", function () {
            if (res.statusCode >= 400) reject(new Error("jurisdiction_statutes " + res.statusCode + ": " + data.slice(0, 200)));
            else { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }
          });
        });
        req.on("error", reject);
        req.end();
      });
      for (const row of pageRows) {
        if (row.id) {
          jurStatuteMap.set(row.id, {
            jurisdiction: row.jurisdiction || null,
            charge_slug: row.common_charge_slug || null,
            statute_number: row.statute_number || null,
          });
        }
      }
      if (pageRows.length < 1000) break;
      offset += 1000;
    }
    console.log("Loaded " + jurStatuteMap.size + " jurisdiction_statute rows\n");
  }

  const targetClusters = new Set();
  const clusterToDumpRow = new Map();

  for (const r of dump) {
    // Enrich dump row with resolved jurisdiction + charge_slug from FK
    if (r.jurisdiction_statute_id) {
      const resolved = jurStatuteMap.get(r.jurisdiction_statute_id);
      if (resolved) {
        // Attach under the names the extractors read (jurisdiction, charge_slug, statute_slug)
        r.jurisdiction = resolved.jurisdiction;
        r.charge_slug = resolved.charge_slug;
        r.statute_slug = resolved.charge_slug; // alias, scripts use both names
        r.charge_type = resolved.charge_slug;  // alias for plea discount
      }
    }
    if (r.courtlistener_cluster_id) {
      const clusterId = String(r.courtlistener_cluster_id);
      targetClusters.add(clusterId);
      if (!clusterToDumpRow.has(clusterId)) {
        clusterToDumpRow.set(clusterId, r);
      }
      // For appeal correlator, populate jurisdiction/year maps
      if (r.jurisdiction) clusterToJurisdiction[clusterId] = r.jurisdiction;
      if (r.year) clusterToYear[clusterId] = r.year;
    }
  }
  console.log("Target clusters: " + targetClusters.size);
  const resolvedCount = Array.from(clusterToDumpRow.values()).filter(function (r) { return r.jurisdiction; }).length;
  console.log("Clusters with resolved jurisdiction: " + resolvedCount + "\n");

  // ── Load judge profiles ──────────────────────────────────────────────────
  const needsJudges = enabledTables.has("judge_quotes") ||
    enabledTables.has("sentencing_distributions") ||
    enabledTables.has("judge_prosecutor_pairings") ||
    enabledTables.has("bench_jury_divergence");

  if (needsJudges) {
    // PostgREST silently caps at 1000 rows regardless of ?limit= value.
    // Must paginate via Range header to load all 15,000+ judges.
    console.log("Loading judge profiles...");
    const serviceKey = loadServiceKey();
    if (serviceKey) {
      try {
        var PAGE_SIZE = 1000;
        var allJudges = [];
        var offset = 0;

        while (true) {
          var page = await new Promise(function (resolve, reject) {
            const req = https.request({
              hostname: "jxjbjmgdukwkoclydqdr.supabase.co",
              path: "/rest/v1/judge_profiles?select=id,full_name&order=id",
              method: "GET",
              headers: {
                apikey: serviceKey,
                Authorization: "Bearer " + serviceKey,
                Range: offset + "-" + (offset + PAGE_SIZE - 1),
                Prefer: "count=exact",
              },
            }, function (res) {
              let data = "";
              res.on("data", function (d) { data += d; });
              res.on("end", function () {
                if (res.statusCode >= 400 && res.statusCode !== 416) {
                  reject(new Error("Judge load " + res.statusCode + ": " + data.slice(0, 200)));
                } else if (res.statusCode === 416) {
                  resolve([]);
                } else {
                  try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
                }
              });
            });
            req.on("error", reject);
            req.end();
          });

          if (page.length === 0) break;
          allJudges.push.apply(allJudges, page);
          if (page.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        for (const j of allJudges) {
          if (j.id && j.full_name) {
            judgeMap.set(j.full_name.toLowerCase(), { id: j.id, name: j.full_name });
            judgeById.set(String(j.id), { id: j.id, name: j.full_name });
          }
        }
        console.log("Loaded " + judgeMap.size + " judges\n");
      } catch (e) {
        console.warn("WARNING: could not load judge profiles: " + e.message.slice(0, 100));
        console.warn("Extractors requiring judges will skip judge matching.\n");
      }
    } else {
      console.warn("WARNING: SUPABASE_SERVICE_ROLE_KEY not found. Judge matching disabled.\n");
    }
  }

  // ── Phase 0: Citation-map for appeal correlator ──────────────────────────
  console.log("=== PHASE 0: Citation-Map Loading ===");
  const phase0Start = Date.now();
  await runPhase0();
  const phase0Elapsed = (Date.now() - phase0Start) / 1000;
  console.log("Phase 0 complete: " + phase0Elapsed.toFixed(0) + "s\n");

  // ── Phase 1: Main stream ─────────────────────────────────────────────────
  console.log("=== PHASE 1: Streaming Opinions CSV ===");
  const phase1Start = Date.now();
  await runPhase1(targetClusters, clusterToDumpRow);
  const phase1Elapsed = (Date.now() - phase1Start) / 1000;
  console.log("Phase 1 complete: " + (phase1Elapsed / 60).toFixed(1) + " min\n");

  // ── Stats ────────────────────────────────────────────────────────────────
  console.log("=== EXTRACTION SUMMARY ===");
  console.log("  judge_quotes:              " + quotesExtracted + " quotes");
  console.log("  sentencing_distributions:  " + sentencingExtracted + " opinions with sentence data (" + sentencingAccum.size + " groups)");
  console.log("  officer_reliability:       " + officerExtracted + " opinions with officer data (" + officerAccum.size + " officers)");
  let pairingUniqueCount = 0;
  for (const byProsecutor of pairingAccum.values()) {
    for (const byMotion of byProsecutor.values()) {
      pairingUniqueCount += byMotion.size;
    }
  }
  console.log("  judge_prosecutor_pairings: " + pairingExtracted + " opinions with pairings (" + pairingUniqueCount + " unique pairings)");
  console.log("  bench_jury_divergence:     " + benchJuryExtracted + " classified (" + benchJuryAccum.size + " judge-charge groups)");
  console.log("  co_defendant_analysis:     " + coDefExtracted + " divergences found");
  console.log("  plea_discount_curves:      " + pleaExtracted + " opinions classified (" + pleaAccum.size + " groups)");
  console.log("  appellate_trends:          " + appealExtracted + " appeal opinions classified");
  console.log("");

  if (dryRun) {
    console.log("Dry run complete. No SQL generated or applied.");
    return;
  }

  // ── Phase 2: Generate SQL ────────────────────────────────────────────────
  console.log("=== PHASE 2: SQL Generation ===");
  const allStmts = generateAllSQL();
  console.log("");

  // ── Save SQL files ───────────────────────────────────────────────────────
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let totalStmts = 0;
  for (const tableName of Object.keys(allStmts)) {
    const stmts = allStmts[tableName];
    if (stmts && stmts.length > 0) {
      const outPath = path.join(OUTPUT_DIR, tableName + "-updates.sql");
      fs.writeFileSync(outPath, stmts.join("\n\n"));
      totalStmts += stmts.length;
    }
  }
  console.log("Saved SQL files to: " + OUTPUT_DIR);
  console.log("Total statements: " + totalStmts + "\n");

  if (!applyMode) {
    console.log("To apply: node scripts/bulk-master-extractor.mjs --apply");
    return;
  }

  // ── Phase 3: Apply ──────────────────────────────────────────────────────
  console.log("=== PHASE 3: Applying to Supabase ===");
  loadToken();

  // Apply in order: flat inserts first, then upserts, then UPDATEs
  const applyOrder = [
    "judge_quotes",
    "sentencing_distributions",
    "officer_reliability",
    "judge_prosecutor_pairings",
    "bench_jury_divergence",
    "judge_profiles_update",
    "co_defendant_analysis",
    "plea_discount_curves",
    "appellate_trends",
  ];

  const applyStart = Date.now();
  for (const tableName of applyOrder) {
    if (allStmts[tableName] && allStmts[tableName].length > 0) {
      await applyBatch(tableName, allStmts[tableName]);
    }
  }
  const applyElapsed = (Date.now() - applyStart) / 1000;

  console.log("\n=== APPLY COMPLETE ===");
  console.log("Total apply time: " + (applyElapsed / 60).toFixed(1) + " min");

  const totalElapsed = (Date.now() - phase0Start) / 1000;
  console.log("\n=== TOTAL TIME: " + (totalElapsed / 60).toFixed(1) + " min ===");
}

main()
  .then(async function () { try { await endDb(); } catch (e) {} })
  .catch(async function (e) {
    console.error("FATAL:", e.stack || e.message);
    try { await endDb(); } catch (_) {}
    process.exit(1);
  });
