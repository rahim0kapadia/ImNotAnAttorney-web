/**
 * Verify Case Law via Caselaw Access Project (CAP) Static Files
 *
 * Cross-references every statute_case_law row against the Harvard Caselaw
 * Access Project static archive at static.case.law. CAP has 6.7M cases —
 * complete US case law from 1658 to ~2018.
 *
 * For each case in DB:
 *   1. Parse the citation (e.g., "100 So. 3d 1" → reporter=so3d, vol=100, page=1)
 *   2. Fetch https://static.case.law/<reporter>/<vol>/CasesMetadata.json (cached)
 *   3. Search for matching citation
 *   4. If found: append CAP URL to source_urls[], bump confidence_score
 *   5. If NOT found AND not in CourtListener (cluster_id null): DELETE the row
 *
 * Per the hard rule: "If we can't verify it, delete it."
 *
 * Safe to run in parallel with the main pipeline — only operates on existing rows.
 *
 * Usage:
 *   node scripts/verify-via-cap.mjs              # Verify all unverified rows
 *   node scripts/verify-via-cap.mjs --limit 500  # Verify in batches
 *   node scripts/verify-via-cap.mjs --dry-run    # Show what would change
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const CAP_DELAY_MS = 500; // Be polite to static.case.law
const CACHE_DIR = path.join(PROJECT_ROOT, ".cap-cache");

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;

// Read token
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
);
let supabaseToken = null;
for (const line of parentEnv.split("\n")) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    supabaseToken = line.slice(22).trim();
    break;
  }
}
if (!supabaseToken) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

// Ensure cache dir exists
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve([]); }
        } else {
          reject(new Error(`SQL ${res.statusCode}: ${body.slice(0, 300)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "INAA-Legal-Research/1.0 (legal research, contact: rahim0kapadia@gmail.com)",
      },
    }, (res) => {
      if (res.statusCode === 404) { resolve(null); return; }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error("Invalid JSON")); }
      });
    }).on("error", reject);
  });
}

// ── Citation Parsing (split+walk, no regex) ───────────────────────────────
//
// Maps citation reporter abbreviations to CAP static.case.law slugs.
// Citation format: "<volume> <reporter> <page>" or with parenthetical suffix.

const REPORTER_MAP = {
  "u.s.": "us",
  "us": "us",
  "s.ct.": "sct",
  "sct": "sct",
  "l.ed.": "led",
  "l.ed.2d": "led2d",
  "f.": "f",
  "f.2d": "f2d",
  "f.3d": "f3d",
  "f.4th": "f4th",
  "f.supp.": "fsupp",
  "f.supp.2d": "fsupp2d",
  "f.supp.3d": "fsupp3d",
  "so.": "so",
  "so.2d": "so2d",
  "so.3d": "so3d",
  "n.e.": "ne",
  "n.e.2d": "ne2d",
  "n.e.3d": "ne3d",
  "n.w.": "nw",
  "n.w.2d": "nw2d",
  "p.": "p",
  "p.2d": "p2d",
  "p.3d": "p3d",
  "s.e.": "se",
  "s.e.2d": "se2d",
  "s.w.": "sw",
  "s.w.2d": "sw2d",
  "s.w.3d": "sw3d",
  "a.": "a",
  "a.2d": "a2d",
  "a.3d": "a3d",
  "cal.": "cal",
  "cal.2d": "cal2d",
  "cal.3d": "cal3d",
  "cal.4th": "cal4th",
  "cal.5th": "cal5th",
  "cal.app.": "calapp",
  "cal.app.2d": "calapp2d",
  "cal.app.3d": "calapp3d",
  "cal.app.4th": "calapp4th",
  "cal.app.5th": "calapp5th",
  "cal.rptr.": "calrptr",
  "cal.rptr.2d": "calrptr2d",
  "cal.rptr.3d": "calrptr3d",
  "n.y.": "ny",
  "n.y.2d": "ny2d",
  "n.y.3d": "ny3d",
  "n.y.s.": "nys",
  "n.y.s.2d": "nys2d",
  "n.y.s.3d": "nys3d",
  "ill.": "ill",
  "ill.2d": "ill2d",
  "ill.app.": "illapp",
  "ill.app.2d": "illapp2d",
  "ill.app.3d": "illapp3d",
  "ill.dec.": "illdec",
  "tex.": "tex",
  "tex.crim.": "texcrim",
  "ohio st.": "ohiost",
  "ohio st.2d": "ohiost2d",
  "ohio st.3d": "ohiost3d",
  "ohio app.": "ohioapp",
  "ohio app.2d": "ohioapp2d",
  "ohio app.3d": "ohioapp3d",
  "mass.": "mass",
  "mass.app.": "massapp",
  "mass.app.ct.": "massappct",
};

function isDigit(c) { return c >= "0" && c <= "9"; }

function parseCitation(citation) {
  if (!citation || typeof citation !== "string") return null;
  // Strip parenthetical "(Fla. 2020)" type suffixes
  const parenIdx = citation.indexOf("(");
  const cleaned = (parenIdx >= 0 ? citation.slice(0, parenIdx) : citation).trim();

  // Split by whitespace
  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 3) return null;

  // First part should be volume number
  const volume = parseInt(parts[0], 10);
  if (isNaN(volume)) return null;

  // Last part should be page number
  const page = parseInt(parts[parts.length - 1], 10);
  if (isNaN(page)) return null;

  // Middle parts are the reporter — try multiple normalizations
  const reporterRaw = parts.slice(1, -1).join(" ").toLowerCase();

  // Direct lookup
  let reporterSlug = REPORTER_MAP[reporterRaw];

  if (!reporterSlug) {
    // Strip all spaces (e.g., "so. 3d" → "so.3d")
    const noSpace = reporterRaw.split(" ").join("");
    reporterSlug = REPORTER_MAP[noSpace];
  }

  if (!reporterSlug) {
    // Strip all periods AND spaces
    const stripped = reporterRaw.split(".").join("").split(" ").join("");
    reporterSlug = REPORTER_MAP[stripped];
  }

  if (!reporterSlug) return null;
  return { reporter: reporterSlug, volume, page, cite: cleaned };
}

// ── CAP Volume Cache ──────────────────────────────────────────────────────
// Volume metadata files are large (100KB-2MB). Cache locally to fetch once.

async function getVolumeMetadata(reporter, volume) {
  const cacheFile = path.join(CACHE_DIR, `${reporter}-${volume}.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    } catch {
      // Corrupted cache, refetch
    }
  }

  const url = `https://static.case.law/${reporter}/${volume}/CasesMetadata.json`;
  try {
    const data = await httpGetJson(url);
    if (data) {
      fs.writeFileSync(cacheFile, JSON.stringify(data));
    }
    return data;
  } catch (e) {
    return null;
  }
}

function normalizeCiteForCompare(s) {
  return s.split(" ").join("").toLowerCase();
}

function findInVolume(metadata, citation) {
  if (!metadata || !Array.isArray(metadata)) return null;
  const targetNorm = normalizeCiteForCompare(citation);
  for (const c of metadata) {
    if (!c.citations) continue;
    for (const cite of c.citations) {
      if (!cite.cite) continue;
      const candidateNorm = normalizeCiteForCompare(cite.cite);
      if (candidateNorm === targetNorm) {
        return c;
      }
    }
  }
  return null;
}

function buildCapUrl(reporter, volume, caseId) {
  return `https://static.case.law/${reporter}/${volume}/CasesMetadata.json#case=${caseId}`;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== CAP Verification Script ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}, Limit: ${limit}\n`);

  // Fetch rows that have no CAP verification yet (no static.case.law URL in source_urls)
  const rows = await supabaseQuery(
    `SELECT id, case_name, citation, courtlistener_cluster_id, source_urls
     FROM statute_case_law
     WHERE NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(source_urls, ARRAY[]::text[])) AS u
       WHERE u LIKE '%static.case.law%'
     )
     LIMIT ${limit}`
  );

  console.log(`${rows.length} rows to verify against CAP\n`);

  const stats = { verified: 0, notFound: 0, deleted: 0, parseErrors: 0, fetchErrors: 0 };
  let lastReporter = null;
  let lastVolume = null;
  let cachedMetadata = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const parsed = parseCitation(row.citation);

    if (!parsed) {
      process.stdout.write(`[${i + 1}/${rows.length}] PARSE_ERR: ${row.citation}\n`);
      stats.parseErrors++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${rows.length}] ${row.citation} -> ${parsed.reporter}/${parsed.volume}/${parsed.page} ... `);

    // Cache last fetched volume to avoid re-downloading
    let metadata;
    if (lastReporter === parsed.reporter && lastVolume === parsed.volume && cachedMetadata) {
      metadata = cachedMetadata;
    } else {
      metadata = await getVolumeMetadata(parsed.reporter, parsed.volume);
      lastReporter = parsed.reporter;
      lastVolume = parsed.volume;
      cachedMetadata = metadata;
      // Only sleep when we actually fetched
      if (metadata) await sleep(CAP_DELAY_MS);
    }

    if (!metadata) {
      console.log("FETCH_ERR (volume not in CAP)");
      stats.fetchErrors++;
      continue;
    }

    const found = findInVolume(metadata, row.citation);

    if (found) {
      const capUrl = buildCapUrl(parsed.reporter, parsed.volume, found.id);
      const realName = found.name_abbreviation || found.name || "?";
      console.log(`VERIFIED: ${realName.slice(0, 50)}`);
      stats.verified++;

      if (!dryRun) {
        try {
          await supabaseQuery(
            `UPDATE statute_case_law SET
              source_urls = array_append(COALESCE(source_urls, '{}'), ${esc(capUrl)}),
              confidence_score = LEAST(1.00, COALESCE(confidence_score, 0) + 0.30)
             WHERE id = ${esc(row.id)}`
          );
        } catch (err) {
          console.log(`  DB err: ${err.message}`);
        }
      }
    } else {
      // Not found in CAP. If also no CourtListener cluster, DELETE per hard rule.
      if (!row.courtlistener_cluster_id) {
        console.log("NOT_FOUND + no CL cluster -> DELETE");
        stats.deleted++;
        if (!dryRun) {
          try {
            await supabaseQuery(`DELETE FROM statute_case_law WHERE id = ${esc(row.id)}`);
          } catch (err) {
            console.log(`  DB err: ${err.message}`);
          }
        }
      } else {
        console.log("NOT_FOUND (kept — has CL cluster)");
        stats.notFound++;
      }
    }
  }

  console.log("\n=== RESULTS ===");
  console.log(`Verified in CAP   : ${stats.verified}`);
  console.log(`Not found in CAP  : ${stats.notFound} (kept — has CourtListener cluster)`);
  console.log(`Deleted           : ${stats.deleted} (no CAP, no CourtListener)`);
  console.log(`Parse errors      : ${stats.parseErrors}`);
  console.log(`Fetch errors      : ${stats.fetchErrors}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
