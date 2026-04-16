/**
 * Add Reference URLs (Justia, Google Scholar, FindLaw)
 *
 * Constructs additional reference URLs for each case in statute_case_law and
 * appends them to source_urls[]. Does NOT fetch the URLs (Cloudflare blocks)
 *, just stores them as cross-references for manual verification by the user.
 *
 * The URLs are predictable from citation pattern:
 *   Justia:     https://law.justia.com/cases/federal/us/<vol>/<page>/
 *   Google:     https://scholar.google.com/scholar_case?q=<encoded citation>
 *   CourtListener (search): https://www.courtlistener.com/?q=<citation>
 *
 * These don't VERIFY the case exists, they provide additional reference URLs
 * that the user (or future scripts) can use to manually validate.
 *
 * Usage:
 *   node scripts/add-reference-urls.mjs              # All rows
 *   node scripts/add-reference-urls.mjs --limit 1000
 *   node scripts/add-reference-urls.mjs --dry-run
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

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
  }
}
if (!supabaseToken) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArray(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const items = arr.map((s) => `"${String(s).split('"').join('\\"').split("'").join("''")}"`);
  return `'{${items.join(",")}}'`;
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

// Parse citation into volume/reporter/page
function parseCitation(citation) {
  if (!citation) return null;
  const parenIdx = citation.indexOf("(");
  const cleaned = (parenIdx >= 0 ? citation.slice(0, parenIdx) : citation).trim();
  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 3) return null;

  const volume = parseInt(parts[0], 10);
  const page = parseInt(parts[parts.length - 1], 10);
  if (isNaN(volume) || isNaN(page)) return null;

  const reporter = parts.slice(1, -1).join(" ");
  return { volume, reporter, page, cite: cleaned };
}

function buildJustiaUrl(parsed, caseName) {
  if (!parsed) return null;
  const reporter = parsed.reporter.toLowerCase();
  // SCOTUS pattern: /cases/federal/us/<vol>/<page>/
  if (reporter.indexOf("u.s.") !== -1 || reporter === "us") {
    return `https://law.justia.com/cases/federal/us/${parsed.volume}/${parsed.page}/`;
  }
  // For state cases, use the search URL (more reliable than guessing slug)
  if (caseName) {
    const q = encodeURIComponent(`${caseName} ${parsed.cite}`);
    return `https://law.justia.com/search?q=${q}`;
  }
  return null;
}

function buildGoogleScholarUrl(citation, caseName) {
  if (!citation) return null;
  const q = encodeURIComponent(`"${citation}"${caseName ? ` ${caseName}` : ""}`);
  return `https://scholar.google.com/scholar?q=${q}&hl=en&as_sdt=6,33`;
}

function buildCourtListenerSearchUrl(citation) {
  if (!citation) return null;
  const q = encodeURIComponent(citation);
  return `https://www.courtlistener.com/?q=${q}&type=o`;
}

function buildFindLawUrl(citation, caseName) {
  if (!caseName) return null;
  const q = encodeURIComponent(`${caseName} ${citation}`);
  return `https://caselaw.findlaw.com/search?query=${q}`;
}

async function main() {
  console.log("=== Add Reference URLs ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}, Limit: ${limit}\n`);

  // Find rows that don't have reference URLs yet
  const rows = await supabaseQuery(
    `SELECT id, case_name, citation, source_urls
     FROM statute_case_law
     WHERE NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(source_urls, ARRAY[]::text[])) AS u
       WHERE u LIKE '%scholar.google%'
     )
     LIMIT ${limit}`
  );

  console.log(`${rows.length} rows to add reference URLs to\n`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const parsed = parseCitation(row.citation);
    const refUrls = [];

    const justia = buildJustiaUrl(parsed, row.case_name);
    if (justia) refUrls.push(justia);

    const scholar = buildGoogleScholarUrl(row.citation, row.case_name);
    if (scholar) refUrls.push(scholar);

    const cl = buildCourtListenerSearchUrl(row.citation);
    if (cl) refUrls.push(cl);

    const findlaw = buildFindLawUrl(row.citation, row.case_name);
    if (findlaw) refUrls.push(findlaw);

    if (refUrls.length === 0) continue;

    if (i % 100 === 0) {
      console.log(`[${i + 1}/${rows.length}] processing...`);
    }

    if (!dryRun) {
      try {
        await supabaseQuery(
          `UPDATE statute_case_law SET
            source_urls = array_cat(COALESCE(source_urls, '{}'), ${escArray(refUrls)})
           WHERE id = ${esc(row.id)}`
        );
        updated++;
      } catch (err) {
        errors++;
      }
    } else {
      updated++;
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Updated : ${updated}`);
  console.log(`Errors  : ${errors}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
