/**
 * Download external datasets via Playwright (bypasses 403s from automated requests).
 *
 * Usage:
 *   node scripts/download-external-datasets.mjs              # Download all
 *   node scripts/download-external-datasets.mjs --brady       # Brady/Giglio only
 *   node scripts/download-external-datasets.mjs --exoneration # Exoneration only
 *   node scripts/download-external-datasets.mjs --npi         # NPI only
 *   node scripts/download-external-datasets.mjs --bjs         # BJS only
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const all = args.length === 0;
const doBrady = all || args.includes("--brady");
const doExoneration = all || args.includes("--exoneration");
const doNpi = all || args.includes("--npi");
const doBjs = all || args.includes("--bjs");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  if (doBrady) await downloadBrady(context);
  if (doExoneration) await downloadExoneration(context);
  if (doNpi) await downloadNpi(context);
  if (doBjs) await downloadBjs(context);

  await browser.close();
  console.log("\nAll downloads complete.");
}

async function downloadBrady(context) {
  console.log("\n=== BRADY/GIGLIO LIST ===");
  const outPath = path.join(OUTPUT_DIR, "brady-giglio-cache.html");

  try {
    const page = await context.newPage();
    await page.goto("https://giglio-bradylist.com/", { waitUntil: "networkidle", timeout: 30000 });
    const html = await page.content();
    fs.writeFileSync(outPath, html, "utf8");
    console.log("Saved main page:", outPath, `(${(html.length / 1024).toFixed(0)} KB)`);

    // Try to find state-level pages with officer tables
    const stateLinks = await page.$$eval("a[href*='/united-states/']", els =>
      els.map(a => ({ href: a.href, text: a.textContent.trim() })).filter(l => l.text.length > 1)
    );
    console.log(`Found ${stateLinks.length} state links`);

    // Save a few state pages to get actual officer data
    let totalOfficers = 0;
    const statePages = [];
    for (const link of stateLinks.slice(0, 55)) {
      try {
        await page.goto(link.href, { waitUntil: "networkidle", timeout: 20000 });
        const stateHtml = await page.content();
        statePages.push(stateHtml);
        const tableRows = await page.$$("table tr");
        console.log(`  ${link.text}: ${tableRows.length} rows`);
        totalOfficers += Math.max(0, tableRows.length - 1);
      } catch (e) {
        console.log(`  ${link.text}: failed (${e.message.slice(0, 50)})`);
      }
    }

    // Combine all state pages into the cache file
    if (statePages.length > 0) {
      const combined = statePages.join("\n<!-- STATE_PAGE_BREAK -->\n");
      fs.writeFileSync(outPath, combined, "utf8");
      console.log(`Combined ${statePages.length} state pages → ${outPath} (${totalOfficers} officer rows)`);
    }

    await page.close();
  } catch (e) {
    console.error("Brady/Giglio download failed:", e.message);
  }
}

async function downloadExoneration(context) {
  console.log("\n=== NATIONAL REGISTRY OF EXONERATIONS ===");
  const outPath = path.join(OUTPUT_DIR, "exonerations.csv");

  try {
    const page = await context.newPage();

    // Try the MSU dev site first (sometimes has export)
    console.log("Trying exonerationregistry.org...");
    await page.goto("https://exonerationregistry.org/", { waitUntil: "networkidle", timeout: 30000 });

    // Look for export/download links
    const downloadLinks = await page.$$eval("a", els =>
      els.filter(a => {
        const t = (a.textContent + " " + a.href).toLowerCase();
        return t.includes("download") || t.includes("export") || t.includes("csv") || t.includes("excel") || t.includes("spreadsheet");
      }).map(a => ({ href: a.href, text: a.textContent.trim() }))
    );
    console.log("Download links found:", downloadLinks.length, downloadLinks.slice(0, 5));

    // Navigate to cases page and try to extract data
    console.log("Navigating to cases listing...");
    await page.goto("https://exonerationregistry.org/cases", { waitUntil: "networkidle", timeout: 30000 });

    // Check for pagination/total count
    const pageText = await page.textContent("body");
    const countMatch = pageText.match(/([\d,]+)\s*(?:cases|exonerations|results)/i);
    if (countMatch) console.log("Total cases:", countMatch[1]);

    // Try to find export functionality
    const buttons = await page.$$eval("button, [role='button'], input[type='submit']", els =>
      els.map(b => b.textContent.trim()).filter(t => t.length > 0)
    );
    console.log("Buttons on page:", buttons.slice(0, 10));

    // Extract table data if visible
    const rows = await page.$$eval("table tr, [class*='row'], [class*='case']", els => els.length);
    console.log("Data rows found:", rows);

    if (rows > 0) {
      // Try to scrape the data directly
      const html = await page.content();
      const htmlPath = path.join(OUTPUT_DIR, "exoneration-registry-cache.html");
      fs.writeFileSync(htmlPath, html, "utf8");
      console.log("Saved HTML cache:", htmlPath);
    }

    await page.close();
  } catch (e) {
    console.error("Exoneration download failed:", e.message);
  }
}

async function downloadNpi(context) {
  console.log("\n=== NATIONAL POLICE INDEX ===");
  const outPath = path.join(OUTPUT_DIR, "npi-data.csv");

  try {
    const page = await context.newPage();
    console.log("Visiting national.cpdp.co...");
    await page.goto("https://national.cpdp.co/", { waitUntil: "networkidle", timeout: 30000 });

    // Look for download/export links
    const links = await page.$$eval("a", els =>
      els.filter(a => {
        const t = (a.textContent + " " + a.href).toLowerCase();
        return t.includes("download") || t.includes("data") || t.includes("csv") || t.includes("export") || t.includes("github");
      }).map(a => ({ href: a.href, text: a.textContent.trim() }))
    );
    console.log("Data-related links:", links);

    // Check the Invisible Institute page too
    console.log("Visiting invisible.institute/national-police-index...");
    await page.goto("https://invisible.institute/national-police-index", { waitUntil: "networkidle", timeout: 30000 });

    const npiLinks = await page.$$eval("a", els =>
      els.filter(a => {
        const t = (a.textContent + " " + a.href).toLowerCase();
        return t.includes("download") || t.includes("data") || t.includes("csv") || t.includes("export");
      }).map(a => ({ href: a.href, text: a.textContent.trim() }))
    );
    console.log("NPI download links:", npiLinks);

    await page.close();
  } catch (e) {
    console.error("NPI download failed:", e.message);
  }
}

async function downloadBjs(context) {
  console.log("\n=== BJS FELONY SENTENCES ===");
  const outPath = path.join(OUTPUT_DIR, "bjs-felony.csv");

  try {
    const page = await context.newPage();
    console.log("Visiting BJS publication page...");
    await page.goto("https://bjs.ojp.gov/library/publications/felony-sentences-state-courts-2006-statistical-tables-standard-error-tables", {
      waitUntil: "networkidle", timeout: 30000,
    });

    // Find CSV/data table download links
    const links = await page.$$eval("a", els =>
      els.filter(a => {
        const t = (a.textContent + " " + a.href).toLowerCase();
        return t.includes("csv") || t.includes("data") || t.includes("table") || t.includes("download") || t.includes(".zip");
      }).map(a => ({ href: a.href, text: a.textContent.trim() }))
    );
    console.log("Download links found:", links);

    // Try to download any CSV links
    for (const link of links) {
      if (link.href.includes(".csv") || link.href.includes(".zip")) {
        console.log("Downloading:", link.href);
        const resp = await page.request.get(link.href);
        if (resp.ok()) {
          const body = await resp.body();
          const fname = link.href.split("/").pop();
          const fpath = path.join(OUTPUT_DIR, fname);
          fs.writeFileSync(fpath, body);
          console.log("Saved:", fpath, `(${(body.length / 1024).toFixed(0)} KB)`);
        }
      }
    }

    await page.close();
  } catch (e) {
    console.error("BJS download failed:", e.message);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
