/**
 * Playwright-automated downloads for datasets that require browser interaction.
 *
 * 1. FBI Crime Data Explorer, Arrests bulk CSV
 * 2. Measures for Justice, FL county-level data
 *
 * Usage:
 *   node scripts/browser-download-datasets.mjs
 *   node scripts/browser-download-datasets.mjs --fbi-only
 *   node scripts/browser-download-datasets.mjs --mfj-only
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FBI_DIR = path.join(PROJECT_ROOT, "data", "external-intel", "fbi-crime");
const MFJ_DIR = path.join(PROJECT_ROOT, "data", "external-intel", "mfj");

fs.mkdirSync(FBI_DIR, { recursive: true });
fs.mkdirSync(MFJ_DIR, { recursive: true });

const args = process.argv.slice(2);
const fbiOnly = args.includes("--fbi-only");
const mfjOnly = args.includes("--mfj-only");
const doFbi = !mfjOnly;
const doMfj = !fbiOnly;

async function downloadFBI(browser) {
  console.log("\n=== FBI Crime Data Explorer, Bulk Downloads ===");
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    console.log("  Navigating to CDE downloads page...");
    await page.goto("https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Wait for the page to fully render
    await page.waitForTimeout(5000);

    // Look for download links/buttons
    const downloadLinks = await page.$$eval("a[href*='.csv'], a[href*='.zip'], a[download], button:has-text('Download')",
      els => els.map(el => ({ text: el.textContent?.trim(), href: el.href || el.getAttribute("data-url") || "" }))
    );

    console.log(`  Found ${downloadLinks.length} potential download links:`);
    for (const link of downloadLinks) {
      console.log(`    - ${link.text} → ${link.href?.slice(0, 80)}`);
    }

    // Try to find and click Arrests download
    const arrestsSection = await page.$('text=/arrest/i');
    if (arrestsSection) {
      console.log("  Found 'Arrests' section, looking for download button...");
    }

    // Take a screenshot so we can see what the page looks like
    const screenshotPath = path.join(FBI_DIR, "fbi-cde-page.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    // Try direct API endpoints that the CDE SPA calls internally
    console.log("  Trying direct API endpoints...");
    const apiUrls = [
      "https://cde.ucr.cjis.gov/LATEST/webapp/api/bulk-downloads",
      "https://api.usa.gov/crime/fbi/cde/downloads",
    ];

    for (const apiUrl of apiUrls) {
      try {
        const response = await page.evaluate(async (url) => {
          const res = await fetch(url);
          if (!res.ok) return { status: res.status, body: null };
          const text = await res.text();
          return { status: res.status, body: text.slice(0, 2000) };
        }, apiUrl);
        if (response.body) {
          console.log(`  API ${apiUrl}: ${response.status}`);
          console.log(`  Response preview: ${response.body.slice(0, 300)}`);
        }
      } catch (e) {
        console.log(`  API ${apiUrl}: ${e.message.slice(0, 100)}`);
      }
    }

  } catch (e) {
    console.error(`  FBI download error: ${e.message.slice(0, 300)}`);
  } finally {
    await context.close();
  }
}

async function downloadMFJ(browser) {
  console.log("\n=== Measures for Justice, FL County Data ===");
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    console.log("  Navigating to MFJ portal...");
    await page.goto("https://app.measuresforjustice.org/portal", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    await page.waitForTimeout(3000);

    // Screenshot first to see the page
    const screenshotPath = path.join(MFJ_DIR, "mfj-portal.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    // Look for state selection
    const stateLinks = await page.$$eval("a, button",
      els => els.filter(el => /florida|FL\b/i.test(el.textContent || ""))
        .map(el => ({ text: el.textContent?.trim(), tag: el.tagName }))
    );
    console.log(`  Florida-related elements: ${stateLinks.length}`);
    for (const s of stateLinks) console.log(`    - <${s.tag}> ${s.text}`);

    // Try clicking on Florida if found
    const flLink = await page.$('text=/Florida/i');
    if (flLink) {
      console.log("  Clicking Florida...");
      await flLink.click();
      await page.waitForTimeout(3000);

      // Screenshot after selecting FL
      await page.screenshot({ path: path.join(MFJ_DIR, "mfj-florida.png"), fullPage: true });

      // Look for download buttons
      const dlButtons = await page.$$eval("a[download], a:has-text('Download'), button:has-text('Download')",
        els => els.map(el => ({ text: el.textContent?.trim(), href: el.href || "" }))
      );
      console.log(`  Download buttons after FL selection: ${dlButtons.length}`);

      // Try to intercept downloads
      if (dlButtons.length > 0) {
        for (const btn of dlButtons) {
          console.log(`    - ${btn.text} → ${btn.href?.slice(0, 80)}`);
        }
        // Click first download button
        const dlBtn = await page.$('a:has-text("Download"), button:has-text("Download")');
        if (dlBtn) {
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
            dlBtn.click(),
          ]);
          if (download) {
            const dest = path.join(MFJ_DIR, download.suggestedFilename());
            await download.saveAs(dest);
            console.log(`  Downloaded: ${dest}`);
          }
        }
      }
    } else {
      console.log("  Florida link not found. Check screenshots for page layout.");
    }

  } catch (e) {
    console.error(`  MFJ download error: ${e.message.slice(0, 300)}`);
  } finally {
    await context.close();
  }
}

async function main() {
  console.log("=== BROWSER-AUTOMATED DATASET DOWNLOADS ===");
  console.log("Using Playwright to automate browser-only downloads\n");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  try {
    if (doFbi) await downloadFBI(browser);
    if (doMfj) await downloadMFJ(browser);
  } finally {
    await browser.close();
  }

  console.log("\nDone. Check data/external-intel/ for downloaded files.");
  console.log("Review screenshots to verify page layout if downloads didn't trigger.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
