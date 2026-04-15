/**
 * Download All External Defense Intelligence Datasets
 *
 * Grabs every free dataset we've identified in parallel.
 * Each download is independent — failures don't block others.
 *
 * Datasets:
 *   1. JUSTFAIR — 600K+ federal sentencing records with judge demographics (OSF/GitHub)
 *   2. National Police Index — officer employment histories, 24 states (GitHub clone + pipeline)
 *   3. FJC Integrated Database — federal criminal defendant data 1996-present (fjc.gov)
 *   4. Mapping Police Violence — 15K+ police killings since 2013 (mappingpoliceviolence.org)
 *   5. Fatal Encounters — police-involved deaths since 2000 (fatalencounters.org)
 *   6. Measures for Justice — county-level criminal justice metrics (manual portal)
 *   7. FBI Crime Data — UCR/NIBRS arrest rates (bulk CSV from cde.ucr.cjis.gov)
 *
 * Usage:
 *   node scripts/download-all-external-datasets.mjs           # Download all
 *   node scripts/download-all-external-datasets.mjs --list    # Show what will be downloaded
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { execSync, exec } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data", "external-intel");

const args = process.argv.slice(2);
const listOnly = args.includes("--list");

// Ensure output directories exist
const DIRS = [
  path.join(DATA_DIR, "justfair"),
  path.join(DATA_DIR, "npi"),
  path.join(DATA_DIR, "fjc"),
  path.join(DATA_DIR, "mpv"),
  path.join(DATA_DIR, "fatal-encounters"),
  path.join(DATA_DIR, "fbi-crime"),
  path.join(DATA_DIR, "mfj"),
];

for (const d of DIRS) fs.mkdirSync(d, { recursive: true });

// ── Download helper ────────────────────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, { headers: { "User-Agent": "INAA-DefenseIntel/1.0" } }, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
      file.on("error", (e) => { fs.unlinkSync(dest); reject(e); });
    }).on("error", (e) => { fs.unlinkSync(dest); reject(e); });
  });
}

function shellAsync(cmd, cwd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, maxBuffer: 50 * 1024 * 1024, timeout: 600000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd}: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

// ── Dataset definitions ────────────────────────────────────────────────────

const DATASETS = [
  {
    name: "JUSTFAIR (federal sentencing + judge demographics)",
    dir: "justfair",
    type: "git-clone",
    repo: "https://github.com/QSIDE-JUSTFAIR/Minnesota_Sentences.git",
    note: "Main dataset on OSF (osf.io/nseh5). GitHub has Minnesota subset. Full dataset requires OSF download — checking for direct file links.",
    fallback_urls: [
      // OSF API endpoint for the project files
      "https://api.osf.io/v2/nodes/nseh5/files/osfstorage/",
    ],
  },
  {
    name: "National Police Index (officer employment histories)",
    dir: "npi",
    type: "git-clone",
    repo: "https://github.com/National-Police-Index/us-post-data.git",
    note: "345MB repo. Contains pipeline + processed data for AZ, CA, GA. Full 24-state data requires running their pipeline or Dropbox access.",
  },
  {
    name: "FJC Integrated Database (federal criminal defendants)",
    dir: "fjc",
    type: "download",
    urls: [
      // Criminal defendant data — the FJC serves these as direct downloads
      // These are the standard FJC IDB criminal defendant files
      { url: "https://www.fjc.gov/sites/default/files/idb/textfiles/cr96to25.zip", dest: "cr96to25.zip" },
      { url: "https://www.fjc.gov/sites/default/files/idb/codebooks/Criminal%20Code%20Book%201996%20Forward.pdf", dest: "criminal-codebook.pdf" },
    ],
  },
  {
    name: "Mapping Police Violence (15K+ police killings)",
    dir: "mpv",
    type: "download",
    urls: [
      { url: "https://mappingpoliceviolence.org/s/MPVDatasetDownload.xlsx", dest: "MPVDatasetDownload.xlsx" },
    ],
  },
  {
    name: "Fatal Encounters (police-involved deaths since 2000)",
    dir: "fatal-encounters",
    type: "download",
    urls: [
      // Fatal Encounters provides a Google Sheets export
      { url: "https://docs.google.com/spreadsheets/d/1dKmaV_JiWcG8XBoRgP8b4e9Eopkpgt7FL7nyspvzAsE/export?format=csv", dest: "fatal-encounters.csv" },
    ],
  },
  {
    name: "FBI Crime Data Explorer (UCR bulk downloads)",
    dir: "fbi-crime",
    type: "note-only",
    note: "FBI CDE bulk CSVs require browser download from https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads — no direct API. Download 'Arrests' and 'Offenses Known' CSV bundles manually.",
  },
  {
    name: "Measures for Justice (county-level metrics)",
    dir: "mfj",
    type: "note-only",
    note: "Portal at https://app.measuresforjustice.org/portal — select state, download county data as CSV. No bulk API. Do one state at a time.",
  },
];

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== EXTERNAL DEFENSE INTELLIGENCE DATASET DOWNLOADER ===\n");

  if (listOnly) {
    for (const ds of DATASETS) {
      console.log(`[${ds.type}] ${ds.name}`);
      console.log(`  Dir: data/external-intel/${ds.dir}/`);
      if (ds.note) console.log(`  Note: ${ds.note}`);
      console.log();
    }
    return;
  }

  const results = [];

  for (const ds of DATASETS) {
    console.log(`\n--- ${ds.name} ---`);
    const dir = path.join(DATA_DIR, ds.dir);

    try {
      if (ds.type === "git-clone") {
        const repoDir = path.join(dir, path.basename(ds.repo, ".git"));
        if (fs.existsSync(repoDir)) {
          console.log(`  Already cloned: ${repoDir}`);
          console.log("  Pulling latest...");
          await shellAsync("git pull", repoDir);
        } else {
          console.log(`  Cloning ${ds.repo}...`);
          await shellAsync(`git clone --depth 1 ${ds.repo}`, dir);
        }
        results.push({ name: ds.name, status: "OK", detail: repoDir });

      } else if (ds.type === "download") {
        for (const { url, dest } of ds.urls) {
          const destPath = path.join(dir, dest);
          if (fs.existsSync(destPath)) {
            const stat = fs.statSync(destPath);
            console.log(`  Already exists: ${dest} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
          } else {
            console.log(`  Downloading: ${dest}...`);
            await download(url, destPath);
            const stat = fs.statSync(destPath);
            console.log(`  Done: ${dest} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
          }
        }
        results.push({ name: ds.name, status: "OK" });

      } else if (ds.type === "note-only") {
        console.log(`  MANUAL: ${ds.note}`);
        results.push({ name: ds.name, status: "MANUAL", detail: ds.note });
      }
    } catch (e) {
      console.error(`  ERROR: ${e.message.slice(0, 200)}`);
      results.push({ name: ds.name, status: "FAILED", detail: e.message.slice(0, 200) });
    }
  }

  // Now try to get JUSTFAIR files from OSF API
  console.log("\n--- JUSTFAIR: Checking OSF for downloadable files ---");
  try {
    const osfRes = await fetch("https://api.osf.io/v2/nodes/nseh5/files/osfstorage/", {
      headers: { "User-Agent": "INAA-DefenseIntel/1.0" },
    });
    if (osfRes.ok) {
      const osfData = await osfRes.json();
      const files = osfData.data || [];
      console.log(`  Found ${files.length} items on OSF:`);
      for (const f of files) {
        const name = f.attributes?.name || "unknown";
        const kind = f.attributes?.kind || "unknown";
        const size = f.attributes?.size;
        const downloadUrl = f.links?.download;
        console.log(`  - ${name} (${kind}${size ? `, ${(size / 1024 / 1024).toFixed(1)}MB` : ""})`);
        if (kind === "file" && downloadUrl) {
          const dest = path.join(DATA_DIR, "justfair", name);
          if (!fs.existsSync(dest)) {
            console.log(`    Downloading from OSF...`);
            await download(downloadUrl, dest);
            console.log(`    Done.`);
          } else {
            console.log(`    Already exists.`);
          }
        } else if (kind === "folder") {
          // List folder contents
          const folderUrl = f.relationships?.files?.links?.related?.href;
          if (folderUrl) {
            const folderRes = await fetch(folderUrl, { headers: { "User-Agent": "INAA-DefenseIntel/1.0" } });
            if (folderRes.ok) {
              const folderData = await folderRes.json();
              for (const ff of (folderData.data || [])) {
                const fname = ff.attributes?.name || "unknown";
                const fsize = ff.attributes?.size;
                const fdownload = ff.links?.download;
                console.log(`    - ${fname}${fsize ? ` (${(fsize / 1024 / 1024).toFixed(1)}MB)` : ""}`);
                if (fdownload) {
                  const fdest = path.join(DATA_DIR, "justfair", fname);
                  if (!fs.existsSync(fdest)) {
                    console.log(`      Downloading...`);
                    await download(fdownload, fdest);
                    console.log(`      Done.`);
                  } else {
                    console.log(`      Already exists.`);
                  }
                }
              }
            }
          }
        }
      }
    } else {
      console.log(`  OSF API returned ${osfRes.status}`);
    }
  } catch (e) {
    console.error(`  OSF error: ${e.message.slice(0, 200)}`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DOWNLOAD SUMMARY");
  console.log("=".repeat(60));
  for (const r of results) {
    const icon = r.status === "OK" ? "OK" : r.status === "MANUAL" ? "MANUAL" : "FAILED";
    console.log(`  [${icon}] ${r.name}`);
    if (r.status === "MANUAL") console.log(`         ${r.detail}`);
    if (r.status === "FAILED") console.log(`         ${r.detail}`);
  }

  console.log("\nManual steps remaining:");
  console.log("  1. FBI Crime Data: https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads");
  console.log("     Download 'Arrests' + 'Offenses Known' CSV bundles → data/external-intel/fbi-crime/");
  console.log("  2. Measures for Justice: https://app.measuresforjustice.org/portal");
  console.log("     Select FL (priority), download county CSV → data/external-intel/mfj/");
  console.log("  3. FL Scoresheets: FOIA request to FL DOC for Criminal Punishment Code scoresheets");
  console.log("  4. Maryland MSCCSP: https://msccsp.org/data/download/ — fill form, no IRB");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
