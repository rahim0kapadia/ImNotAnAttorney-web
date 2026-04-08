/**
 * Scrub Enrichment Citations
 *
 * SAFETY: enrichment files contain inline case citations and statute section
 * references that the LLM agents smuggled in despite instructions. Most cannot
 * be verified. The user's rule: if we can't verify it, delete it.
 *
 * This script DELETES (does not just scrub) any enrichment item containing:
 *   1. Case citations: "X v. Y" / "State v. X" / "People v. X" / "Commonwealth v. X"
 *   2. Inline pinpoint statute citations with section numbers
 *   3. The leftover [verify with attorney] placeholder from earlier scrub runs
 *
 * Items REMAINING after the scrub are general legal concepts (e.g., "Challenge
 * the traffic stop validity", "Rising blood alcohol defense", "Self-defense")
 * — these are legal categories, not factual citations that need verification.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENRICH_DIR = path.join(PROJECT_ROOT, "data", "charge-taxonomy", "enrichment");

const dryRun = process.argv.includes("--dry-run");

// ── Item Validation (line scanning, no regex on full file) ─────────────────

// Returns true if an enrichment item contains unverifiable content that
// should cause the entire item to be deleted.
function isUnverifiable(item) {
  if (typeof item !== "string") return false;

  // 1. Contains a case citation pattern: "Word v. Word"
  if (containsCaseCitation(item)) return true;

  // 1b. Contains a bare case-derived term (Miranda, Brady, Terry, Padilla, etc.)
  // These are well-known but per the rule: no verification URL = no inclusion.
  if (containsBareCaseName(item)) return true;

  // 2. Contains the leftover [verify with attorney] placeholder
  if (item.indexOf("[verify with attorney]") !== -1) return true;
  if (item.indexOf("verify with attorney") !== -1) return true;
  if (item.indexOf("ask your attorney") !== -1) return true;
  if (item.toLowerCase().indexOf("attorney verify") !== -1) return true;
  if (item.toLowerCase().indexOf("ask attorney") !== -1) return true;
  if (item.toLowerCase().indexOf("your attorney can") !== -1) return true;
  if (item.toLowerCase().indexOf("consult your attorney") !== -1) return true;
  if (item.toLowerCase().indexOf("with your attorney") !== -1) return true;

  // 3. Contains an inline statute § with a section number
  // Pattern: "§ 123.45" or "§ ABC-123" — anything after § with digits
  if (containsInlineStatuteCite(item)) return true;

  // 4. Contains state code prefixes that indicate a pinpoint cite
  // e.g., "Tex. Penal Code §", "KRS §", "Minn. Stat. §", "Fla. Stat. §"
  const lower = item.toLowerCase();
  const PINPOINT_PREFIXES = [
    "tex. penal code",
    "tex. transp. code",
    "tex. code crim. proc.",
    "tex. admin. code",
    "krs §",
    "krs ",
    "minn. stat.",
    "minn. const.",
    "fla. stat.",
    "fla. r. crim.",
    "cal. penal code",
    "cal. veh. code",
    "ohio rev. code",
    "ors §",
    "rcw ",
    "nrs ",
    "n.j.s.a.",
    "pa.c.s.",
    "n.y. penal",
    "ga. code",
    "ill. comp. stat.",
    "wis. stat.",
    "ariz. rev. stat.",
    "iowa code",
    "miss. code",
    "mont. code",
    "neb. rev. stat.",
    "n.h. rev. stat.",
    "n.m. stat.",
    "n.c. gen. stat.",
    "n.d. cent. code",
    "okla. stat.",
    "r.i. gen. laws",
    "s.c. code",
    "s.d. codified laws",
    "tenn. code",
    "utah code",
    "vt. stat.",
    "va. code",
    "w. va. code",
    "wyo. stat.",
    "u.s.c. §",
    "u.s.c.",
    "cfr §",
    "c.f.r.",
    "c.r.s.",
    "i.c. §",
    "mcl ",
    "mca ",
    "ic §",
    "ars §",
    "rsa ",
    "k.s.a.",
    "lsa-r.s.",
    "d.c. code",
    "del. code",
    "haw. rev. stat.",
    "hrs §",
    "hrs ",
    "idaho code",
    "md. code",
    "md. crim.",
    "ill comp. stat",
    "ilcs",
  ];
  for (const prefix of PINPOINT_PREFIXES) {
    if (lower.indexOf(prefix) !== -1) return true;
  }

  // 4b. Detect bare state-code abbreviations followed by digits/dashes
  // e.g., "AS 28.35.031" (Alaska), "OAC 3701-53" (Ohio admin), "OAR 257-030" (Oregon),
  //       "HB 19-1263" (bill number), "501 CMR 2.00" (Massachusetts admin),
  //       "625 ILCS 5/11-501" (Illinois), "OAR 257-030"
  if (containsBareCodeRef(item)) return true;

  // 5. Inline state constitution article references with numbers
  // e.g., "Art. 14", "Art. 1 § 10", "Article I, § 10"
  if (containsArticleCite(item)) return true;

  return false;
}

function containsCaseCitation(text) {
  // Strict: any " v. " between two words containing uppercase letters
  // is a case citation. This catches H.J. Inc. v. Northwestern, post-Mathis v. United, etc.
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(" v. ", i);
    if (idx === -1) return false;
    // Walk back to find the word/phrase before " v. "
    let beforeStart = idx - 1;
    while (beforeStart >= 0 && isCaseNameChar(text[beforeStart])) beforeStart--;
    beforeStart++;
    // Walk forward to find the word after " v. "
    let afterEnd = idx + 4;
    while (afterEnd < text.length && isCaseNameChar(text[afterEnd])) afterEnd++;
    const before = text.slice(beforeStart, idx);
    const after = text.slice(idx + 4, afterEnd);
    // Both sides must contain at least one uppercase letter (case names always have one)
    if (before && after && hasUpperCaseLetter(before) && hasUpperCaseLetter(after)) {
      return true;
    }
    i = idx + 4;
  }
  return false;
}

// Chars that can appear in a case name (broader than ident chars)
function isCaseNameChar(c) {
  if (!c) return false;
  return (
    (c >= "A" && c <= "Z") ||
    (c >= "a" && c <= "z") ||
    (c >= "0" && c <= "9") ||
    c === "-" ||
    c === "'" ||
    c === "."
  );
}

function hasUpperCaseLetter(s) {
  if (!s) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c >= "A" && c <= "Z") return true;
  }
  return false;
}

// Bare case-derived terms — well-known case names used as standalone references
// (e.g., "Miranda warnings", "Brady disclosure", "Terry stop"). Per the strict
// rule, anything related to case law without a verification URL is unverifiable.
const BARE_CASE_NAMES = [
  "Miranda",
  "Brady",
  "Terry stop",
  "Terry frisk",
  "Padilla",
  "Crawford",
  "Apprendi",
  "Alleyne",
  "Bruen",
  "Mapp",
  "Gideon",
  "Sitz",
  "Batson",
  "McNeely",
  "Birchfield",
  "Riley",
  "Carpenter",
  "Heien",
  "Rodriguez",
  "Whren",
  "Strickland",
  "Daubert",
  "Frye",
  "Melendez-Diaz",
  "Bullcoming",
  "Confrontation Clause",
  "Sixth Amendment right to counsel",
];

// Detect "AS 28.35.031" / "OAC 3701-53" / "HB 19-1263" / "501 CMR 2.00" patterns:
// short uppercase token (or digits) + space + digits (with dashes/dots/slashes).
// These are state code references that the LLM hallucinates without verification.
const BARE_CODE_TOKENS = [
  "AS ",     // Alaska Statutes
  "OAC ",    // Ohio Admin Code
  "OAR ",    // Oregon Admin Rules
  "ORC ",    // Ohio Revised Code
  "HB ",     // House Bill
  "SB ",     // Senate Bill
  "CMR ",    // Code of Massachusetts Regulations
  "ILCS ",   // Illinois Compiled Statutes
  "USC ",    // US Code
  "CFR ",    // Code of Federal Regulations
  "DCMR ",   // DC Municipal Regulations
  "RCW ",    // Revised Code of Washington
  "NRS ",    // Nevada Revised Statutes
  "ARS ",    // Arizona Revised Statutes
  "MCL ",    // Michigan Compiled Laws
  "MCA ",    // Montana Code Annotated
  "RSA ",    // New Hampshire Revised Statutes
  "KRS ",    // Kentucky Revised Statutes
  "HRS ",    // Hawaii Revised Statutes
  "KSA ",    // Kansas Statutes Annotated
  "TCA ",    // Tennessee Code Annotated
  "ALM ",    // Annotated Laws of Massachusetts
  "MGL ",    // Mass General Laws
  "MGLA ",   // Mass General Laws Annotated
  "IC ",     // Indiana Code (and others)
  "OS ",     // Oklahoma Statutes
];

function containsBareCodeRef(text) {
  for (const token of BARE_CODE_TOKENS) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = text.indexOf(token, searchFrom);
      if (idx === -1) break;
      // Check word boundary before
      const charBefore = idx > 0 ? text[idx - 1] : " ";
      if (isIdentChar(charBefore)) {
        searchFrom = idx + 1;
        continue;
      }
      // Check that next chars after token are digits (with possible §)
      let after = text.slice(idx + token.length, Math.min(idx + token.length + 30, text.length));
      // Skip leading § if present
      if (after.startsWith("§")) after = after.slice(1).trimStart();
      // First non-space char must be a digit
      const firstChar = after.trimStart()[0];
      if (firstChar && firstChar >= "0" && firstChar <= "9") return true;
      searchFrom = idx + token.length;
    }
  }
  // Also catch leading-digit code: "625 ILCS 5/11-501", "42 Pa.C.S."
  // Check for: digit(s) + space + uppercase code letters
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c >= "0" && c <= "9") {
      // Walk forward to end of digits
      let j = i;
      while (j < text.length && text[j] >= "0" && text[j] <= "9") j++;
      // Check if next is space + uppercase letters (code reference)
      if (j < text.length - 2 && text[j] === " " && isUpperCaseChar(text[j + 1]) && isUpperCaseChar(text[j + 2])) {
        // Could be "625 ILCS" — confirm by checking that uppercase run is 3-6 chars
        let k = j + 1;
        while (k < text.length && text[k] >= "A" && text[k] <= "Z") k++;
        const codeLen = k - (j + 1);
        if (codeLen >= 3 && codeLen <= 6) return true;
      }
      i = j;
    } else {
      i++;
    }
  }
  return false;
}

function containsBareCaseName(text) {
  // Bare case-name detection — case-derived terms like "Miranda warnings" or
  // "post-Miranda admissions". A hyphen before/after still counts as a match
  // because "pre-Miranda" is still referencing the case.
  for (const name of BARE_CASE_NAMES) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = text.indexOf(name, searchFrom);
      if (idx === -1) break;
      const charBefore = idx > 0 ? text[idx - 1] : " ";
      const charAfter = idx + name.length < text.length ? text[idx + name.length] : " ";
      // Word boundary OR hyphen on either side counts as a match.
      // Avoids matching "Miranda" inside "Mirandaville" but catches "pre-Miranda".
      const beforeOK = !isIdentChar(charBefore) || charBefore === "-";
      const afterOK = !isIdentChar(charAfter) || charAfter === "-";
      if (beforeOK && afterOK) return true;
      searchFrom = idx + 1;
    }
  }
  return false;
}

function containsInlineStatuteCite(text) {
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf("§", i);
    if (idx === -1) return false;
    // Look for digits within next 30 chars
    const slice = text.slice(idx, Math.min(idx + 30, text.length));
    if (slice.split("").some((c) => c >= "0" && c <= "9")) return true;
    i = idx + 1;
  }
  return false;
}

function containsArticleCite(text) {
  // "Art. N" or "Article N" with a number nearby
  const lower = text.toLowerCase();
  const candidates = ["art. ", "article "];
  for (const cand of candidates) {
    let i = 0;
    while (i < lower.length) {
      const idx = lower.indexOf(cand, i);
      if (idx === -1) break;
      const after = text.slice(idx + cand.length, Math.min(idx + cand.length + 15, text.length));
      // Check if next non-space chars are a number or roman numeral
      const stripped = after.trimStart();
      if (stripped.length > 0) {
        const ch = stripped[0];
        if ((ch >= "0" && ch <= "9") || ch === "I" || ch === "V" || ch === "X") {
          return true;
        }
      }
      i = idx + cand.length;
    }
  }
  return false;
}

function isIdentChar(c) {
  if (!c) return false;
  return (
    (c >= "A" && c <= "Z") ||
    (c >= "a" && c <= "z") ||
    c === "-" ||
    c === "'"
  );
}

function isUpperCaseChar(c) {
  return c && c >= "A" && c <= "Z";
}

// Scan a JSON enrichment entry and DELETE all unverifiable items
function scrubEntry(entry) {
  let totalDeleted = 0;
  const filterArray = (arr) => {
    if (!Array.isArray(arr)) return arr;
    const cleaned = [];
    for (const item of arr) {
      if (isUnverifiable(item)) {
        totalDeleted++;
      } else {
        cleaned.push(item);
      }
    }
    return cleaned;
  };

  return {
    cleaned: {
      ...entry,
      prosecution_strengths: filterArray(entry.prosecution_strengths),
      defense_opportunities: filterArray(entry.defense_opportunities),
      common_defenses: filterArray(entry.common_defenses),
    },
    count: totalDeleted,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(ENRICH_DIR)) {
    console.error(`Enrichment dir not found: ${ENRICH_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(ENRICH_DIR).filter((f) => f.endsWith(".json"));
  console.log(`Scanning ${files.length} enrichment files...`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  let totalScrubbed = 0;
  let totalFiles = 0;

  for (const file of files) {
    const filepath = path.join(ENRICH_DIR, file);
    let entries;
    try {
      entries = JSON.parse(fs.readFileSync(filepath, "utf8"));
    } catch (e) {
      console.error(`  ${file}: invalid JSON, skipping`);
      continue;
    }

    if (!Array.isArray(entries)) {
      console.error(`  ${file}: not an array, skipping`);
      continue;
    }

    let fileScrubbed = 0;
    const cleaned = entries.map((entry) => {
      const result = scrubEntry(entry);
      fileScrubbed += result.count;
      return result.cleaned;
    });

    if (fileScrubbed > 0) {
      console.log(`  ${file}: scrubbed ${fileScrubbed} citations`);
      totalScrubbed += fileScrubbed;
      totalFiles++;
      if (!dryRun) {
        fs.writeFileSync(filepath, JSON.stringify(cleaned, null, 2), "utf8");
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Files affected : ${totalFiles}`);
  console.log(`Citations scrubbed : ${totalScrubbed}`);
  if (dryRun) console.log(`(dry run — no changes written)`);
}

main();
