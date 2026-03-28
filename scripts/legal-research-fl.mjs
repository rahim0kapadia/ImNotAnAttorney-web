/**
 * Legal Research Skill — Level 1: FL Statute Verification + Case Law
 *
 * For each jurisdiction_statute row in FL:
 *   1. Constructs FL Online Sunshine URL from statute_number
 *   2. Fetches the page to verify statute exists
 *   3. Extracts statute title from the page
 *   4. Constructs Justia verification URL
 *   5. Updates jurisdiction_statutes with source_urls, confidence_score, verified_at
 *   6. (When COURTLISTENER_TOKEN available) Searches for citing case law
 *
 * Usage:
 *   node scripts/legal-research-fl.mjs                   # All FL statutes
 *   node scripts/legal-research-fl.mjs dui-dwi           # Single charge
 *   node scripts/legal-research-fl.mjs --dry-run         # Show URLs without fetching
 *
 * Rate limiting: 2 seconds between FL Online Sunshine fetches (respectful scraping).
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const JURISDICTION = "FL";
const FETCH_DELAY_MS = 2000; // Be respectful to state servers

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

// Optional: CourtListener token
const webEnv = fs.readFileSync(
  path.resolve(__dirname, "..", ".env.local"),
  "utf8"
);
const courtlistenerToken = webEnv.match(/COURTLISTENER_TOKEN=([^\r\n]+)/)?.[1] || null;

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targetSlug = args.find((a) => !a.startsWith("--")) || null;

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
    protocol
      .get(url, { headers: { "User-Agent": "INAA-Legal-Research/1.0 (legal research tool)" } }, (res) => {
        // Handle redirects
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
      })
      .on("error", reject);
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

// ── FL Online Sunshine URL Construction ────────────────────────────────────

/**
 * Builds the FL Online Sunshine URL for a statute number.
 * FL statutes follow pattern: chapter.section (e.g., "316.193")
 * URL pattern: http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=CCCC-CCCC/CCCC/Sections/CCCC.SSS.html
 * where CCCC = chapter padded to ranges
 */
function buildFLStatuteURL(statuteNumber) {
  if (!statuteNumber) return null;

  // Extract the base statute (before any parenthetical subdivisions)
  // "316.193(2)(a)" → "316.193"
  // "777.04; 782.04" → "777.04" (take first)
  const baseStatute = statuteNumber.split(";")[0].trim().split("(")[0].trim();
  const parts = baseStatute.split(".");
  if (parts.length < 2) return null;

  const chapter = parseInt(parts[0], 10);
  if (isNaN(chapter)) return null;

  // Calculate the chapter range directory (e.g., 316 → 0300-0399)
  const rangeStart = Math.floor(chapter / 100) * 100;
  const rangeEnd = rangeStart + 99;
  const rangeDir = `${String(rangeStart).padStart(4, "0")}-${String(rangeEnd).padStart(4, "0")}`;
  const chapterDir = String(chapter).padStart(4, "0");

  return `http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=${rangeDir}/${chapterDir}/Sections/${baseStatute}.html`;
}

/**
 * Builds the Justia verification URL for a FL statute.
 * Pattern: https://law.justia.com/codes/florida/title-XLVI/chapter-316/section-316-193/
 */
function buildJustiaURL(statuteNumber) {
  if (!statuteNumber) return null;
  const baseStatute = statuteNumber.split(";")[0].trim().split("(")[0].trim();
  const parts = baseStatute.split(".");
  if (parts.length < 2) return null;
  const chapter = parts[0];
  const section = baseStatute.split(".").join("-");
  return `https://law.justia.com/codes/florida/chapter-${chapter}/section-${section}/`;
}

// ── Verification Logic ──────────────────────────────────────────────────────

async function verifyFLStatute(statute) {
  const { id, common_charge_slug, statute_number, statute_title } = statute;
  const sourceUrls = [];
  let confidenceScore = 0;
  const notes = [];

  console.log(`\n  [${common_charge_slug}] §${statute_number || "unknown"} — ${statute_title || "?"}`);

  // 1. FL Online Sunshine
  const flURL = buildFLStatuteURL(statute_number);
  if (flURL) {
    if (dryRun) {
      console.log(`    [DRY RUN] Would fetch: ${flURL}`);
      sourceUrls.push(flURL);
      confidenceScore = 0.3;
    } else {
      try {
        const res = await httpGet(flURL);
        if (res.status === 200 && res.body.length > 1000) {
          // Check if the page has actual statute content (not a 404 page)
          const hasStatuteContent = res.body.includes("App_mode=Display_Statute") && !res.body.includes("Statute does not exist");
          if (hasStatuteContent) {
            sourceUrls.push(flURL);
            confidenceScore += 0.4;
            notes.push("FL Online Sunshine: statute page found");

            // Extract title from page if available
            const titleMatch = res.body.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
              notes.push(`Page title: ${titleMatch[1].trim().slice(0, 100)}`);
            }

            console.log(`    ✓ FL Online Sunshine: verified (${res.body.length} bytes)`);
          } else {
            notes.push("FL Online Sunshine: page loaded but no statute content");
            console.log(`    ✗ FL Online Sunshine: page exists but no statute content`);
          }
        } else if (res.status === 200) {
          notes.push(`FL Online Sunshine: thin page (${res.body.length} bytes)`);
          console.log(`    ? FL Online Sunshine: thin page (${res.body.length} bytes)`);
        } else {
          notes.push(`FL Online Sunshine: HTTP ${res.status}`);
          console.log(`    ✗ FL Online Sunshine: HTTP ${res.status}`);
        }
      } catch (e) {
        notes.push(`FL Online Sunshine: fetch error — ${e.message}`);
        console.log(`    ✗ FL Online Sunshine: ${e.message}`);
      }
    }
  } else {
    notes.push("No FL statute URL constructable from statute_number");
    console.log(`    — No FL URL constructable`);
  }

  // 2. Justia verification URL (just construct, don't fetch — respect rate limits)
  const justiaURL = buildJustiaURL(statute_number);
  if (justiaURL) {
    sourceUrls.push(justiaURL);
    if (confidenceScore > 0) {
      confidenceScore += 0.1; // Small boost for having a Justia reference
    }
    console.log(`    + Justia URL: ${justiaURL}`);
  }

  // 3. Determine confidence tier
  // 0.00 = UNVERIFIED, 0.10-0.29 = LOW, 0.30-0.59 = MEDIUM, 0.60-0.89 = HIGH, 0.90+ = VERIFIED
  const tier =
    confidenceScore >= 0.9 ? "VERIFIED" :
    confidenceScore >= 0.6 ? "HIGH" :
    confidenceScore >= 0.3 ? "MEDIUM" :
    confidenceScore > 0 ? "LOW" : "UNVERIFIED";

  console.log(`    → Confidence: ${confidenceScore.toFixed(2)} (${tier})`);

  // 4. Update DB
  if (!dryRun && (sourceUrls.length > 0 || notes.length > 0)) {
    const sql = `UPDATE jurisdiction_statutes SET
      source_urls = ${escArray(sourceUrls)},
      statute_url = ${esc(flURL)},
      statute_source = ${sourceUrls.length > 0 ? "'FL Online Sunshine'" : "NULL"},
      confidence_score = ${confidenceScore.toFixed(2)},
      verified_at = now(),
      verification_notes = ${esc(notes.join("; "))}
    WHERE id = ${esc(id)}`;

    await supabaseQuery(sql);
  }

  return { slug: common_charge_slug, confidenceScore, tier, sourceUrls };
}

// ── CourtListener Case Law Search ───────────────────────────────────────────

async function searchCaseLaw(statuteNumber, jurisdictionStatuteId) {
  if (!courtlistenerToken) {
    console.log(`    — CourtListener: no token, skipping case law search`);
    return [];
  }

  const baseStatute = statuteNumber.split(";")[0].trim().split("(")[0].trim();
  const searchQuery = encodeURIComponent(`"${baseStatute}" florida`);

  const url = `https://www.courtlistener.com/api/rest/v4/search/?type=o&q=${searchQuery}&court=flaapp1%2Cflaapp2%2Cflaapp3%2Cflaapp4%2Cflaapp5%2Cfla&order_by=dateFiled+desc`;

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
          if (res.statusCode !== 200) {
            console.log(`    ✗ CourtListener search: HTTP ${res.statusCode}`);
            resolve([]);
            return;
          }
          try {
            const data = JSON.parse(body);
            const results = (data.results || []).slice(0, 10);
            console.log(`    ✓ CourtListener: ${data.count || 0} results (using top ${results.length})`);
            resolve(results);
          } catch (e) {
            console.log(`    ✗ CourtListener parse error: ${e.message}`);
            resolve([]);
          }
        });
      })
      .on("error", (e) => {
        console.log(`    ✗ CourtListener: ${e.message}`);
        resolve([]);
      });
  });
}

async function storeCaseLaw(cases, jurisdictionStatuteId) {
  if (cases.length === 0) return;

  for (const c of cases) {
    const caseName = c.caseName || c.case_name || "Unknown";
    const citation = c.citation?.[0] || c.citations?.[0]?.volume + " " + c.citations?.[0]?.reporter + " " + c.citations?.[0]?.page || "";
    const court = c.court || "";
    const year = c.dateFiled ? new Date(c.dateFiled).getFullYear() : null;
    const holding = (c.snippet || "").slice(0, 500);
    const clusterUrl = c.absolute_url ? `https://www.courtlistener.com${c.absolute_url}` : "";

    const sql = `INSERT INTO statute_case_law
      (jurisdiction_statute_id, case_name, citation, court, year, holding, source_urls, confidence_score)
    VALUES
      (${esc(jurisdictionStatuteId)}, ${esc(caseName)}, ${esc(citation)}, ${esc(court)}, ${year || "NULL"}, ${esc(holding)}, ${escArray(clusterUrl ? [clusterUrl] : [])}, 0.30)
    ON CONFLICT DO NOTHING`;

    try {
      await supabaseQuery(sql);
    } catch (e) {
      console.log(`    ✗ Store case law failed: ${e.message}`);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== INAA Legal Research — Level 1 ===");
  console.log(`Jurisdiction: ${JURISDICTION}`);
  console.log(`CourtListener: ${courtlistenerToken ? "token found" : "NO token — case law search disabled"}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (targetSlug) console.log(`Target: ${targetSlug}`);

  // Fetch all FL statutes
  const q = String.fromCharCode(39);
  let sql = `SELECT id, common_charge_slug, statute_number, statute_title, confidence_score FROM jurisdiction_statutes WHERE jurisdiction=${q}${JURISDICTION}${q}`;
  if (targetSlug) sql += ` AND common_charge_slug=${q}${targetSlug}${q}`;
  sql += " ORDER BY common_charge_slug";

  const statutes = await supabaseQuery(sql);
  console.log(`\n${statutes.length} statutes to verify\n`);

  const results = { verified: 0, failed: 0, skipped: 0, caseLawTotal: 0 };

  for (let i = 0; i < statutes.length; i++) {
    const statute = statutes[i];
    console.log(`[${i + 1}/${statutes.length}]`);

    try {
      const result = await verifyFLStatute(statute);

      if (result.confidenceScore > 0) {
        results.verified++;
      } else {
        results.failed++;
      }

      // Case law search (if token available)
      if (courtlistenerToken && statute.statute_number) {
        const cases = await searchCaseLaw(statute.statute_number, statute.id);
        if (cases.length > 0) {
          await storeCaseLaw(cases, statute.id);
          results.caseLawTotal += cases.length;
        }
        await sleep(1000); // Rate limit CourtListener
      }

      // Rate limit FL Online Sunshine
      if (!dryRun && i < statutes.length - 1) {
        await sleep(FETCH_DELAY_MS);
      }
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      results.failed++;
    }
  }

  console.log("\n=== RESULTS ===");
  console.log(`Verified: ${results.verified}`);
  console.log(`Failed:   ${results.failed}`);
  console.log(`Case law: ${results.caseLawTotal} citations stored`);

  // Summary query
  if (!dryRun) {
    const summary = await supabaseQuery(
      `SELECT confidence_score, count(*) as cnt FROM jurisdiction_statutes WHERE jurisdiction=${q}${JURISDICTION}${q} GROUP BY confidence_score ORDER BY confidence_score DESC`
    );
    console.log("\nConfidence distribution:");
    summary.forEach((r) => console.log(`  ${r.confidence_score}: ${r.cnt} statutes`));
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
