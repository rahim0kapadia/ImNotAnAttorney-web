/**
 * Bulk Download CAP, Download all needed CasesMetadata.json files from static.case.law
 *
 * Reads the dump JSON from bulk-dump-cases.mjs, parses each citation to find
 * the reporter+volume, deduplicates, and downloads missing volumes to .cap-cache/.
 * Shared cache with verify-via-cap.mjs (same filename convention).
 *
 * Usage:
 *   node scripts/bulk-download-cap.mjs                    # Download all needed volumes
 *   node scripts/bulk-download-cap.mjs --dry-run           # List volumes without downloading
 *   node scripts/bulk-download-cap.mjs --concurrency 5     # Parallel downloads (default 3)
 *   node scripts/bulk-download-cap.mjs --input path.json   # Custom dump file
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(PROJECT_ROOT, ".cap-cache");
const DEFAULT_INPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const CAP_DELAY_MS = 500;

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const inputIdx = args.indexOf("--input");
const inputPath = inputIdx >= 0 ? path.resolve(args[inputIdx + 1]) : DEFAULT_INPUT;
const concIdx = args.indexOf("--concurrency");
const concurrency = concIdx >= 0 ? parseInt(args[concIdx + 1], 10) : 3;

// ── Reporter Map (from verify-via-cap.mjs) ──────────────────────────────────

const REPORTER_MAP = {
  "u.s.": "us", "us": "us",
  "s.ct.": "sct", "sct": "sct",
  "l.ed.": "led", "l.ed.2d": "led2d",
  "f.": "f", "f.2d": "f2d", "f.3d": "f3d", "f.4th": "f4th",
  "f.supp.": "fsupp", "f.supp.2d": "fsupp2d", "f.supp.3d": "fsupp3d",
  "so.": "so", "so.2d": "so2d", "so.3d": "so3d",
  "n.e.": "ne", "n.e.2d": "ne2d", "n.e.3d": "ne3d",
  "n.w.": "nw", "n.w.2d": "nw2d",
  "p.": "p", "p.2d": "p2d", "p.3d": "p3d",
  "s.e.": "se", "s.e.2d": "se2d",
  "s.w.": "sw", "s.w.2d": "sw2d", "s.w.3d": "sw3d",
  "a.": "a", "a.2d": "a2d", "a.3d": "a3d",
  "cal.": "cal", "cal.2d": "cal2d", "cal.3d": "cal3d", "cal.4th": "cal4th", "cal.5th": "cal5th",
  "cal.app.": "calapp", "cal.app.2d": "calapp2d", "cal.app.3d": "calapp3d",
  "cal.app.4th": "calapp4th", "cal.app.5th": "calapp5th",
  "cal.rptr.": "calrptr", "cal.rptr.2d": "calrptr2d", "cal.rptr.3d": "calrptr3d",
  "n.y.": "ny", "n.y.2d": "ny2d", "n.y.3d": "ny3d",
  "n.y.s.": "nys", "n.y.s.2d": "nys2d", "n.y.s.3d": "nys3d",
  "ill.": "ill", "ill.2d": "ill2d",
  "ill.app.": "illapp", "ill.app.2d": "illapp2d", "ill.app.3d": "illapp3d",
  "ill.dec.": "illdec",
  "tex.": "tex", "tex.crim.": "texcrim",
  "ohio st.": "ohiost", "ohio st.2d": "ohiost2d", "ohio st.3d": "ohiost3d",
  "ohio app.": "ohioapp", "ohio app.2d": "ohioapp2d", "ohio app.3d": "ohioapp3d",
  "mass.": "mass", "mass.app.": "massapp", "mass.app.ct.": "massappct",
  // Additional state reporters
  "wis.": "wis", "wis.2d": "wis2d",
  "minn.": "minn",
  "mich.": "mich", "mich.app.": "michapp",
  "conn.": "conn", "conn.app.": "connapp",
  "md.": "md", "md.app.": "mdapp",
  "n.j.": "nj", "n.j.super.": "njsuper",
  "pa.": "pa", "pa.super.": "pasuper", "pa.commw.": "pacommw",
  "va.": "va", "va.app.": "vaapp",
  "wash.": "wash", "wash.2d": "wash2d", "wash.app.": "washapp",
  "or.": "or", "or.app.": "orapp",
  "ga.": "ga", "ga.app.": "gaapp",
  "fla.": "fla",
  "a.d.": "ad", "a.d.2d": "ad2d", "a.d.3d": "ad3d",
  "misc.": "misc", "misc.2d": "misc2d", "misc.3d": "misc3d",
  "b.r.": "br",
  "f.appx.": "fappx",
};

// ── Citation Parser (from verify-via-cap.mjs) ───────────────────────────────

function isDigit(c) { return c >= "0" && c <= "9"; }

function parseCitation(citation) {
  if (!citation || typeof citation !== "string") return null;
  const parenIdx = citation.indexOf("(");
  const cleaned = (parenIdx >= 0 ? citation.slice(0, parenIdx) : citation).trim();
  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 3) return null;
  const volume = parseInt(parts[0], 10);
  if (isNaN(volume)) return null;
  const page = parseInt(parts[parts.length - 1], 10);
  if (isNaN(page)) return null;
  const reporterRaw = parts.slice(1, -1).join(" ").toLowerCase();
  let reporterSlug = REPORTER_MAP[reporterRaw];
  if (!reporterSlug) {
    const noSpace = reporterRaw.split(" ").join("");
    reporterSlug = REPORTER_MAP[noSpace];
  }
  if (!reporterSlug) {
    const stripped = reporterRaw.split(".").join("").split(" ").join("");
    reporterSlug = REPORTER_MAP[stripped];
  }
  if (!reporterSlug) return null;
  return { reporter: reporterSlug, volume, page, cite: cleaned };
}

// ── HTTP Fetch ──────────────────────────────────────────────────────────────

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "INAA-BulkVerify/1.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        httpGetJson(res.headers.location).then(resolve, reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(30000, () => { req.destroy(); resolve(null); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK DOWNLOAD CAP VOLUMES ===\n");

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Dump file not found: ${inputPath}`);
    console.error("Run bulk-dump-cases.mjs first.");
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  console.log(`Loaded ${rows.length} rows from dump.\n`);

  // Parse all citations and find unique (reporter, volume) pairs
  const volumeSet = new Map(); // "reporter-volume" → { reporter, volume, count }
  let parseable = 0;
  let unparseable = 0;
  const unparseableCitations = [];

  for (const row of rows) {
    const parsed = parseCitation(row.citation);
    if (parsed) {
      parseable++;
      const key = `${parsed.reporter}-${parsed.volume}`;
      const existing = volumeSet.get(key);
      if (existing) {
        existing.count++;
      } else {
        volumeSet.set(key, { reporter: parsed.reporter, volume: parsed.volume, count: 1 });
      }
    } else {
      unparseable++;
      if (unparseableCitations.length < 20) {
        unparseableCitations.push(row.citation || "(null)");
      }
    }
  }

  const volumes = Array.from(volumeSet.values()).sort((a, b) => b.count - a.count);

  console.log(`Citations parseable:     ${parseable}`);
  console.log(`Citations unparseable:   ${unparseable}`);
  console.log(`Unique volumes needed:   ${volumes.length}`);

  if (unparseableCitations.length > 0) {
    console.log(`\nSample unparseable citations:`);
    for (const c of unparseableCitations) {
      console.log(`  - ${c}`);
    }
  }

  // Check cache
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  let alreadyCached = 0;
  let toDownload = [];

  for (const vol of volumes) {
    const cacheFile = path.join(CACHE_DIR, `${vol.reporter}-${vol.volume}.json`);
    if (fs.existsSync(cacheFile)) {
      alreadyCached++;
    } else {
      toDownload.push(vol);
    }
  }

  console.log(`\nAlready cached:          ${alreadyCached}`);
  console.log(`To download:             ${toDownload.length}`);

  if (dryRun) {
    console.log("\n--- DRY RUN, Volumes to download ---");
    for (const vol of toDownload) {
      console.log(`  ${vol.reporter}/${vol.volume} (${vol.count} citations)`);
    }
    console.log("\nDry run complete. No files downloaded.");
    return;
  }

  if (toDownload.length === 0) {
    console.log("\nAll volumes already cached. Nothing to download.");
    return;
  }

  // Download with concurrency control
  console.log(`\nDownloading ${toDownload.length} volumes (concurrency: ${concurrency})...\n`);

  let downloaded = 0;
  let failed = 0;
  let idx = 0;

  async function downloadWorker(workerId) {
    while (idx < toDownload.length) {
      const current = idx++;
      const vol = toDownload[current];
      const url = `https://static.case.law/${vol.reporter}/${vol.volume}/CasesMetadata.json`;
      const cacheFile = path.join(CACHE_DIR, `${vol.reporter}-${vol.volume}.json`);

      try {
        const data = await httpGetJson(url);
        if (data) {
          fs.writeFileSync(cacheFile, JSON.stringify(data));
          downloaded++;
          process.stdout.write(`  [${current + 1}/${toDownload.length}] ${vol.reporter}/${vol.volume}, ${Array.isArray(data) ? data.length : "?"} cases\n`);
        } else {
          failed++;
          process.stdout.write(`  [${current + 1}/${toDownload.length}] ${vol.reporter}/${vol.volume}, FAILED (404 or timeout)\n`);
        }
      } catch (e) {
        failed++;
        process.stdout.write(`  [${current + 1}/${toDownload.length}] ${vol.reporter}/${vol.volume}, ERROR: ${e.message}\n`);
      }
      await sleep(CAP_DELAY_MS);
    }
  }

  const workers = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(downloadWorker(w));
  }
  await Promise.all(workers);

  console.log(`\n--- Summary ---`);
  console.log(`Downloaded:              ${downloaded}`);
  console.log(`Failed:                  ${failed}`);
  console.log(`Total cached now:        ${alreadyCached + downloaded}`);

  // Write download manifest for debugging
  const manifest = {
    timestamp: new Date().toISOString(),
    totalVolumes: volumes.length,
    alreadyCached,
    downloaded,
    failed,
    volumes: volumes.map(v => ({
      reporter: v.reporter,
      volume: v.volume,
      citations: v.count,
      cached: fs.existsSync(path.join(CACHE_DIR, `${v.reporter}-${v.volume}.json`)),
    })),
  };
  fs.writeFileSync(
    path.join(PROJECT_ROOT, "data", "bulk-verify", "download-manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`\nManifest: data/bulk-verify/download-manifest.json`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
