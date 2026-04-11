/**
 * Legal Research — Generic All-State Statute Verification + Case Law
 *
 * For each jurisdiction_statute row:
 *   1. Constructs Justia URL from statute_number + jurisdiction
 *   2. For federal: constructs Cornell LII URL
 *   3. HTTP GET to confirm the page exists
 *   4. Updates DB: source_urls[], statute_url, statute_source, confidence_score, verified_at
 *   5. (When COURTLISTENER_TOKEN available) Searches for citing case law
 *
 * Usage:
 *   node scripts/legal-research-all.mjs                          # All jurisdictions
 *   node scripts/legal-research-all.mjs FL                       # Single jurisdiction
 *   node scripts/legal-research-all.mjs FL dui-dwi               # Single statute
 *   node scripts/legal-research-all.mjs --dry-run                # Show URLs without fetching
 *   node scripts/legal-research-all.mjs --summary                # Summary only (no verification)
 *
 * Rate limiting: 1.5 seconds between Justia fetches (respectful scraping).
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const FETCH_DELAY_MS = 1500;

// Read tokens
const parentEnv = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "ImNotAnAttorney", ".env.local"),
  "utf8"
);
const supabaseToken = parentEnv.match(/SUPABASE_ACCESS_TOKEN=([^\r\n]+)/)?.[1];
if (!supabaseToken) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const webEnv = fs.readFileSync(
  path.resolve(__dirname, "..", ".env.local"),
  "utf8"
);
const courtlistenerToken = webEnv.match(/COURTLISTENER_TOKEN=([^\r\n]+)/)?.[1] || null;

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const summaryOnly = args.includes("--summary");
const unverifiedOnly = args.includes("--unverified-only");
const positionalArgs = args.filter((a) => !a.startsWith("--"));
// Keep original case for "federal" but uppercase state codes
const rawJur = positionalArgs[0] || null;
const targetJurisdiction = rawJur === null ? null : (rawJur.toLowerCase() === "federal" ? "federal" : rawJur.toUpperCase());
const targetSlug = positionalArgs[1] || null;

// ── Jurisdiction → State Name Map ───────────────────────────────────────────

const STATE_NAMES = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri",
  MT: "montana", NE: "nebraska", NV: "nevada", NH: "new-hampshire", NJ: "new-jersey",
  NM: "new-mexico", NY: "new-york", NC: "north-carolina", ND: "north-dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode-island", SC: "south-carolina",
  SD: "south-dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont",
  VA: "virginia", WA: "washington", WV: "west-virginia", WI: "wisconsin", WY: "wyoming",
  DC: "district-of-columbia",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(body);
            }
          } else {
            reject(new Error(`SQL ${res.statusCode}: ${body.slice(0, 300)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function httpGet(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const timeoutMs = 10000;
    const req = protocol.get(
      url,
      { headers: { "User-Agent": "INAA-Legal-Research/1.0 (legal research tool)" } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith("/")) {
            const u = new URL(url);
            redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
          }
          return resolve(httpGet(redirectUrl, maxRedirects - 1));
        }
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error("Timeout")); });
  });
}

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArray(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const items = arr.map((s) => `"${String(s).split('"').join('\\"').split("'").join("''")}"` );
  return `'{${items.join(",")}}'`;
}

// ── URL Construction ────────────────────────────────────────────────────────

/**
 * Parse statute_number into a {title/chapter, section} pair regardless of state format.
 *
 * Formats seen:
 *   FL:   "316.193"              → chapter=316, section=316.193
 *   GA:   "O.C.G.A. § 40-6-391" → title=40, section=40-6-391
 *   IL:   "625 ILCS 5/11-501"   → chapter=625-ilcs-5, section=11-501
 *   MI:   "MCL 257.625(1)"      → section=257-625
 *   NC:   "N.C.G.S. § 20-138.1" → chapter=20, section=20-138-1
 *   NJ:   "N.J.S.A. 39:4-50"    → title=39, section=39-4-50
 *   PA:   "75 Pa.C.S. § 3802"   → title=75, section=3802
 *   Fed:  "18 U.S.C. § 1111"    → title=18, section=1111
 */
function parseStatuteNumber(raw) {
  if (!raw) return null;
  // Take first statute before semicolons, strip parenthetical subdivisions
  const cleaned = raw.split(";")[0].trim().replace(/\(.*$/, "").trim();
  // Remove common prefix annotations
  const stripped = cleaned
    .replace(/O\.C\.G\.A\.\s*§?\s*/i, "")
    .replace(/N\.C\.G\.S\.\s*§?\s*/i, "")
    .replace(/N\.J\.S\.A\.\s*/i, "")
    .replace(/Pa\.C\.S\.\s*§?\s*/i, "")
    .replace(/MCL\s*/i, "")
    .replace(/§\s*/g, "")
    .trim();
  return stripped;
}

/**
 * Build Justia search URL for a state statute.
 * Justia hosts codes at law.justia.com/codes/{state-name}/
 */
function buildJustiaSearchURL(jurisdiction, statuteNumber) {
  if (!statuteNumber || jurisdiction === "federal") return null;
  const stateName = STATE_NAMES[jurisdiction];
  if (!stateName) return null;
  return `https://law.justia.com/codes/${stateName}/`;
}

/**
 * Build a Justia direct statute URL per state's known format.
 * Returns null if unable to construct — caller falls back to search URL.
 */
function buildJustiaStatuteURL(jurisdiction, statuteNumber) {
  if (!statuteNumber || jurisdiction === "federal") return null;
  const stateName = STATE_NAMES[jurisdiction];
  if (!stateName) return null;

  const raw = statuteNumber.split(";")[0].trim().replace(/\(.*$/, "").trim();

  // FL: "316.193" → /chapter-316/section-316-193/
  if (jurisdiction === "FL") {
    const parts = raw.split(".");
    if (parts.length >= 2) {
      const chapter = parts[0];
      const section = raw.replace(/\./g, "-");
      return `https://law.justia.com/codes/florida/chapter-${chapter}/section-${section}/`;
    }
  }

  // GA: "O.C.G.A. § 40-6-391" → /title-40/chapter-6/section-40-6-391/
  if (jurisdiction === "GA") {
    const num = raw.replace(/O\.C\.G\.A\.\s*§?\s*/i, "").trim();
    const parts = num.split("-");
    if (parts.length >= 3) {
      return `https://law.justia.com/codes/georgia/title-${parts[0]}/chapter-${parts[1]}/section-${num}/`;
    }
  }

  // IL: "625 ILCS 5/11-501" → /chapter-625/act-625-ilcs-5/section-625-ilcs-5-11-501/
  if (jurisdiction === "IL") {
    const ilMatch = raw.match(/(\d+)\s*ILCS\s*(\d+)\/(\S+)/i);
    if (ilMatch) {
      const [, chapter, act, section] = ilMatch;
      return `https://law.justia.com/codes/illinois/chapter-${chapter}/act-${chapter}-ilcs-${act}/section-${chapter}-ilcs-${act}-${section}/`;
    }
  }

  // MI: "MCL 257.625" → /chapter-257/section-257-625/
  if (jurisdiction === "MI") {
    const num = raw.replace(/MCL\s*/i, "").trim();
    const parts = num.split(".");
    if (parts.length >= 2) {
      const chapter = parts[0];
      const section = num.replace(/\./g, "-");
      return `https://law.justia.com/codes/michigan/chapter-${chapter}/section-${section}/`;
    }
  }

  // NC: "N.C.G.S. § 20-138.1" → /chapter-20/article-2c/section-20-138-1/
  // NC articles vary, so skip article and try section directly
  if (jurisdiction === "NC") {
    const num = raw.replace(/N\.C\.G\.S\.\s*§?\s*/i, "").trim();
    const chapterMatch = num.match(/^(\d+)/);
    if (chapterMatch) {
      const section = num.replace(/\./g, "-");
      return `https://law.justia.com/codes/north-carolina/chapter-${chapterMatch[1]}/section-${section}/`;
    }
  }

  // NJ: "N.J.S.A. 39:4-50" → /title-39/section-39-4-50/
  if (jurisdiction === "NJ") {
    const num = raw.replace(/N\.J\.S\.A\.\s*/i, "").trim();
    const titleMatch = num.match(/^(\d+[a-zA-Z]*)/);
    if (titleMatch) {
      const section = num.replace(/:/g, "-");
      return `https://law.justia.com/codes/new-jersey/title-${titleMatch[1]}/section-${section}/`;
    }
  }

  // PA: "75 Pa.C.S. § 3802" → /title-75/section-3802/
  if (jurisdiction === "PA") {
    const paMatch = raw.match(/(\d+)\s*Pa\.C\.S\.\s*§?\s*(\d+)/i);
    if (paMatch) {
      return `https://law.justia.com/codes/pennsylvania/title-${paMatch[1]}/section-${paMatch[2]}/`;
    }
  }

  // Generic fallback: try to extract numbers and build a URL
  const numbers = raw.match(/\d+[\d\-.:]*/g);
  if (numbers && numbers.length > 0) {
    const section = numbers.join("-").replace(/\./g, "-").replace(/:/g, "-");
    return `https://law.justia.com/codes/${stateName}/section-${section}/`;
  }

  return null;
}

/**
 * Build Cornell LII URL for federal statutes.
 * Pattern: https://www.law.cornell.edu/uscode/text/{title}/{section}
 * Handles: "18 U.S.C. § 1111", "21 USC 841(a)(1)", "26 USC 7201"
 */
function buildCornellURL(statuteNumber) {
  if (!statuteNumber) return null;

  const cleaned = statuteNumber
    .split(";")[0].trim()
    .replace(/\(.*$/, "").trim()
    .replace(/§/g, "")
    .replace(/U\.S\.C\./gi, "USC")
    .trim();
  const match = cleaned.match(/(\d+)\s*USC\s*(\d+[a-zA-Z]*)/i);
  if (!match) return null;

  const title = match[1];
  const section = match[2];
  return `https://www.law.cornell.edu/uscode/text/${title}/${section}`;
}

/**
 * Build FL Online Sunshine URL (keeps the gold-standard FL verification).
 */
function buildFLStatuteURL(statuteNumber) {
  if (!statuteNumber) return null;
  const baseStatute = statuteNumber.split(";")[0].trim().split("(")[0].trim();
  const parts = baseStatute.split(".");
  if (parts.length < 2) return null;
  const chapter = parseInt(parts[0], 10);
  if (isNaN(chapter)) return null;
  const rangeStart = Math.floor(chapter / 100) * 100;
  const rangeEnd = rangeStart + 99;
  const rangeDir = `${String(rangeStart).padStart(4, "0")}-${String(rangeEnd).padStart(4, "0")}`;
  const chapterDir = String(chapter).padStart(4, "0");
  return `http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=${rangeDir}/${chapterDir}/Sections/${baseStatute}.html`;
}

// ── Verification Logic ──────────────────────────────────────────────────────

async function verifyStatute(statute) {
  const { id, jurisdiction, common_charge_slug, statute_number, statute_title } = statute;
  const sourceUrls = [];
  let confidenceScore = 0;
  const notes = [];
  let primaryUrl = null;
  let statuteSource = null;

  const label = `[${jurisdiction}/${common_charge_slug}] §${statute_number || "?"}`;

  // 1. Primary verification source
  if (jurisdiction === "federal") {
    // Federal → Cornell LII (HTTP fetch works, no Cloudflare)
    const cornellURL = buildCornellURL(statute_number);
    if (cornellURL) {
      primaryUrl = cornellURL;
      statuteSource = "Cornell LII";

      if (dryRun) {
        console.log(`  ${label} → ${cornellURL}`);
        sourceUrls.push(cornellURL);
        confidenceScore = 0.3;
      } else {
        try {
          const res = await httpGet(cornellURL);
          if (res.status === 200 && res.body.length > 2000) {
            const hasContent = res.body.includes("uscode") || res.body.includes("U.S. Code");
            if (hasContent) {
              sourceUrls.push(cornellURL);
              confidenceScore += 0.5;
              notes.push("Cornell LII: statute page confirmed");
            } else {
              notes.push("Cornell LII: page loaded but unclear content");
              confidenceScore += 0.2;
              sourceUrls.push(cornellURL);
            }
          } else {
            notes.push(`Cornell LII: HTTP ${res.status}`);
          }
        } catch (e) {
          notes.push(`Cornell LII: ${e.message}`);
        }
      }
    }
  } else if (jurisdiction === "FL") {
    // FL → FL Online Sunshine (HTTP fetch works, gold standard)
    const flURL = buildFLStatuteURL(statute_number);
    if (flURL) {
      primaryUrl = flURL;
      statuteSource = "FL Online Sunshine";

      if (!dryRun) {
        try {
          const res = await httpGet(flURL);
          if (res.status === 200 && res.body.length > 1000) {
            const hasContent = res.body.includes("App_mode=Display_Statute") && !res.body.includes("Statute does not exist");
            if (hasContent) {
              sourceUrls.push(flURL);
              confidenceScore += 0.4;
              notes.push("FL Online Sunshine: confirmed");
            }
          }
        } catch (e) {
          notes.push(`FL Online Sunshine: ${e.message}`);
        }
      } else {
        sourceUrls.push(flURL);
        confidenceScore = 0.3;
      }
    }
  } else {
    // All other states → Justia URL as reference (no HTTP fetch — Cloudflare blocks it).
    // Justia URL gives LOW confidence (0.15). CourtListener case law boosts it to MEDIUM.
    const justiaURL = buildJustiaStatuteURL(jurisdiction, statute_number);
    if (justiaURL) {
      primaryUrl = justiaURL;
      statuteSource = "Justia (reference)";
      sourceUrls.push(justiaURL);
      confidenceScore += 0.15;
      notes.push("Justia: URL constructed as reference (Cloudflare blocks HTTP verification)");

      if (dryRun) {
        console.log(`  ${label} → ${justiaURL}`);
      }
    }
  }

  // 2. Secondary: Justia landing page as backup reference
  if (jurisdiction !== "federal" && jurisdiction !== "FL") {
    const justiaLanding = buildJustiaSearchURL(jurisdiction, statute_number);
    if (justiaLanding && !sourceUrls.includes(justiaLanding)) {
      sourceUrls.push(justiaLanding);
    }
  }

  // 3. Determine confidence tier
  const tier =
    confidenceScore >= 0.9 ? "VERIFIED" :
    confidenceScore >= 0.6 ? "HIGH" :
    confidenceScore >= 0.3 ? "MEDIUM" :
    confidenceScore > 0 ? "LOW" : "UNVERIFIED";

  // 4. Update DB
  if (!dryRun && !summaryOnly) {
    const sql = `UPDATE jurisdiction_statutes SET
      source_urls = ${escArray(sourceUrls)},
      statute_url = ${esc(primaryUrl)},
      statute_source = ${esc(statuteSource)},
      confidence_score = ${confidenceScore.toFixed(2)},
      verified_at = now(),
      verification_notes = ${esc(notes.join("; "))}
    WHERE id = ${esc(id)}`;

    await supabaseQuery(sql);
  }

  return { slug: common_charge_slug, jurisdiction, confidenceScore, tier, sourceUrls, notes };
}

// ── CourtListener Case Law Search ───────────────────────────────────────────

const CL_COURT_MAP = {
  AL: "ala%2Calactapp%2Calacrimapp", AK: "alaska%2Calaskactapp",
  AZ: "ariz%2Carizctapp%2Cariztaxct", AR: "ark%2Carkctapp",
  CA: "cal%2Ccalctapp", CO: "colo%2Ccoloctapp",
  CT: "conn%2Cconnappct%2Cconnsuperct", DE: "del%2Cdelch%2Cdelsuperct",
  FL: "fla%2Cfladistctapp", GA: "ga%2Cgactapp",
  HI: "haw%2Chawapp", ID: "idaho%2Cidahoctapp",
  IL: "ill%2Cillappct", IN: "ind%2Cindctapp",
  IA: "iowa%2Ciowactapp", KS: "kan%2Ckanctapp",
  KY: "ky%2Ckyctapp", LA: "la%2Clactapp",
  ME: "me", MD: "md%2Cmdctspecapp",
  MA: "mass%2Cmassappct", MI: "mich%2Cmichctapp",
  MN: "minn%2Cminnctapp", MS: "miss%2Cmissctapp",
  MO: "mo%2Cmoctapp", MT: "mont",
  NE: "neb%2Cnebctapp", NV: "nev",
  NH: "nh", NJ: "nj%2Cnjsuperctappdiv",
  NM: "nm%2Cnmctapp", NY: "ny%2Cnyappterm%2Cnyappdiv%2Cnysupct",
  NC: "nc%2Cncctapp", ND: "nd%2Cndctapp",
  OH: "ohio%2Cohioctapp", OK: "okla%2Coklacivapp%2Coklacrimapp",
  OR: "or%2Corctapp", PA: "pa%2Cpasuperct%2Cpacommwct",
  RI: "ri", SC: "sc%2Cscctapp",
  SD: "sd", TN: "tenn%2Ctennctapp%2Ctenncrimapp",
  TX: "tex%2Ctexapp%2Ctexcrimapp", UT: "utah%2Cutahctapp",
  VT: "vt", VA: "va%2Cvactapp",
  WA: "wash%2Cwashctapp", WV: "wva",
  WI: "wis%2Cwisctapp", WY: "wyo",
  DC: "dc%2Cdcctapp",
  federal: "scotus%2Cca1%2Cca2%2Cca3%2Cca4%2Cca5%2Cca6%2Cca7%2Cca8%2Cca9%2Cca10%2Cca11%2Ccadc",
};

async function searchCaseLaw(statuteNumber, jurisdictionStatuteId, jurisdiction) {
  if (!courtlistenerToken) return [];
  const baseStatute = statuteNumber.split(";")[0].trim().split("(")[0].trim();
  const searchQuery = encodeURIComponent(`"${baseStatute}"`);
  const courts = CL_COURT_MAP[jurisdiction] || "";

  const url = `https://www.courtlistener.com/api/rest/v4/search/?type=o&q=${searchQuery}${courts ? "&court=" + courts : ""}&order_by=citeCount+desc`;

  return new Promise((resolve) => {
    https
      .get(url, {
        headers: {
          Authorization: `Token ${courtlistenerToken}`,
          "User-Agent": "INAA-Legal-Research/1.0",
        },
      }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if (res.statusCode !== 200) { resolve([]); return; }
          try {
            const data = JSON.parse(body);
            const withCitations = (data.results || []).filter((r) => r.citation && r.citation.length > 0);
            resolve(withCitations.slice(0, 5));
          } catch { resolve([]); }
        });
      })
      .on("error", () => resolve([]));
  });
}

async function storeCaseLaw(cases, jurisdictionStatuteId) {
  if (cases.length === 0) return 0;
  let stored = 0;

  for (const c of cases) {
    const caseName = c.caseName || "Unknown";
    const citationRaw = Array.isArray(c.citation) ? c.citation.filter((x) => typeof x === "string" && x.length > 0) : [];
    const citation = citationRaw.length > 0 ? citationRaw[0] : "";
    const court = c.court || "";
    const year = c.dateFiled ? new Date(c.dateFiled).getFullYear() : null;
    const holding = (c.syllabus || c.posture || "").slice(0, 500);
    const clusterUrl = c.absolute_url ? `https://www.courtlistener.com${c.absolute_url}` : "";
    const allCitationUrls = [clusterUrl, ...(c.citation || []).slice(1)].filter(Boolean);

    // SAFETY: is_good_law explicitly NULL on insert. Must be verified by
    // classify-case-law.mjs (negative treatment check) before any code can
    // cite this case. Per CASE persona — never assume good law.
    const sql = `INSERT INTO statute_case_law
      (jurisdiction_statute_id, case_name, citation, court, year, holding, source_urls, courtlistener_cluster_id, confidence_score, is_good_law)
    VALUES
      (${esc(jurisdictionStatuteId)}, ${esc(caseName)}, ${esc(citation)}, ${esc(court)}, ${year || "NULL"}, ${esc(holding)}, ${escArray(allCitationUrls)}, ${esc(c.cluster_id ? String(c.cluster_id) : null)}, 0.40, NULL)
    ON CONFLICT DO NOTHING`;

    try {
      await supabaseQuery(sql);
      stored++;
    } catch (e) { /* skip */ }
  }
  return stored;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== INAA Legal Research — All-State Verification ===");
  console.log(`CourtListener: ${courtlistenerToken ? "token found" : "NO token — case law disabled"}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : summaryOnly ? "SUMMARY ONLY" : "LIVE"}`);
  if (targetJurisdiction) console.log(`Target: ${targetJurisdiction}${targetSlug ? " / " + targetSlug : ""}`);

  // Build query
  const q = "'";
  let sql = `SELECT id, jurisdiction, common_charge_slug, statute_number, statute_title, confidence_score
    FROM jurisdiction_statutes`;
  const conditions = [];
  if (targetJurisdiction) conditions.push(`jurisdiction = ${q}${targetJurisdiction}${q}`);
  if (targetSlug) conditions.push(`common_charge_slug = ${q}${targetSlug}${q}`);
  if (unverifiedOnly) conditions.push(`verified_at IS NULL`);
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY jurisdiction, common_charge_slug";

  const statutes = await supabaseQuery(sql);
  console.log(`\n${statutes.length} statutes to verify\n`);

  if (summaryOnly) {
    // Just show current state
    const byJurisdiction = {};
    for (const s of statutes) {
      if (!byJurisdiction[s.jurisdiction]) byJurisdiction[s.jurisdiction] = { total: 0, verified: 0, unverified: 0 };
      byJurisdiction[s.jurisdiction].total++;
      if (s.confidence_score > 0) byJurisdiction[s.jurisdiction].verified++;
      else byJurisdiction[s.jurisdiction].unverified++;
    }
    console.log("Current verification state:");
    for (const [jur, counts] of Object.entries(byJurisdiction).sort()) {
      console.log(`  ${jur}: ${counts.verified}/${counts.total} verified (${counts.unverified} unverified)`);
    }
    return;
  }

  const results = {
    byJurisdiction: {},
    totalVerified: 0,
    totalFailed: 0,
    totalCaseLaw: 0,
  };

  let currentJurisdiction = null;

  for (let i = 0; i < statutes.length; i++) {
    const statute = statutes[i];

    // Print jurisdiction header
    if (statute.jurisdiction !== currentJurisdiction) {
      currentJurisdiction = statute.jurisdiction;
      console.log(`\n--- ${currentJurisdiction} ---`);
      results.byJurisdiction[currentJurisdiction] = { verified: 0, failed: 0, caseLaw: 0, total: 0 };
    }

    const jr = results.byJurisdiction[currentJurisdiction];
    jr.total++;

    try {
      const result = await verifyStatute(statute);

      if (result.confidenceScore > 0) {
        jr.verified++;
        results.totalVerified++;
        if (!dryRun) process.stdout.write(`  [${i + 1}/${statutes.length}] ${result.slug}: ${result.tier} (${result.confidenceScore.toFixed(2)})\n`);
      } else {
        jr.failed++;
        results.totalFailed++;
        if (!dryRun) process.stdout.write(`  [${i + 1}/${statutes.length}] ${result.slug}: UNVERIFIED\n`);
      }

      // Case law search — boosts confidence when courts cite the statute
      if (courtlistenerToken && statute.statute_number && !dryRun) {
        const cases = await searchCaseLaw(statute.statute_number, statute.id, statute.jurisdiction);
        if (cases.length > 0) {
          const stored = await storeCaseLaw(cases, statute.id);
          jr.caseLaw += stored;
          results.totalCaseLaw += stored;

          // Boost confidence: if courts cite this statute, it's real
          // 1 case = +0.15, 2 = +0.20, 3+ = +0.25 (enough to reach MEDIUM from Justia-only)
          if (result.confidenceScore < 0.5 && cases.length >= 1) {
            const boost = cases.length >= 3 ? 0.25 : cases.length >= 2 ? 0.20 : 0.15;
            const newScore = Math.min(0.60, result.confidenceScore + boost);
            await supabaseQuery(`UPDATE jurisdiction_statutes SET confidence_score = ${newScore.toFixed(2)} WHERE id = ${esc(statute.id)}`);
            result.confidenceScore = newScore;
            // Re-classify tier
            if (result.confidenceScore >= 0.3 && result.tier !== "MEDIUM") {
              result.tier = "MEDIUM";
            }
          }
        }
        await sleep(750); // CourtListener rate limit
      }

      // Rate limit primary source
      if (!dryRun && i < statutes.length - 1) {
        await sleep(FETCH_DELAY_MS);
      }
    } catch (e) {
      jr.failed++;
      results.totalFailed++;
      console.error(`  [${i + 1}/${statutes.length}] ${statute.common_charge_slug}: ERROR — ${e.message}`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n\n=== VERIFICATION SUMMARY ===");
  console.log(`Total statutes:    ${statutes.length}`);
  console.log(`Verified:          ${results.totalVerified}`);
  console.log(`Failed/Unverified: ${results.totalFailed}`);
  console.log(`Case law stored:   ${results.totalCaseLaw}`);

  console.log("\nPer-jurisdiction:");
  const sorted = Object.entries(results.byJurisdiction).sort(([a], [b]) => a.localeCompare(b));
  for (const [jur, r] of sorted) {
    const pct = r.total > 0 ? Math.round((r.verified / r.total) * 100) : 0;
    const bar = "#".repeat(Math.round(pct / 5)).padEnd(20);
    console.log(`  ${jur.padEnd(10)} ${String(r.verified).padStart(3)}/${String(r.total).padStart(3)} [${bar}] ${pct}%${r.caseLaw > 0 ? ` (+${r.caseLaw} case law)` : ""}`);
  }

  // Flag jurisdictions with failures
  const failedJurisdictions = sorted.filter(([, r]) => r.failed > 0);
  if (failedJurisdictions.length > 0) {
    console.log("\n⚠ Jurisdictions with unverified statutes:");
    for (const [jur, r] of failedJurisdictions) {
      console.log(`  ${jur}: ${r.failed} statutes need review`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
