/**
 * browser-download-remaining.mjs  (v4)
 *
 * Targeted fixes:
 *   FJC:  Court-type dropdown form on /research/idb → Criminal → submit → files
 *   MPV:  Already downloaded. Skip.
 *   FBI:  button:has-text("Location") opens overlay with nb-option. Select state+year, then DOWNLOAD.
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DIRS = {
  fjc: path.join(ROOT, "data", "external-intel", "fjc"),
  mpv: path.join(ROOT, "data", "external-intel", "mpv"),
  fbi: path.join(ROOT, "data", "external-intel", "fbi-crime"),
};
for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });

const results = { fjc: null, mpv: null, fbi: null };

async function saveDownload(download, destDir, preferredName) {
  const finalName = preferredName || download.suggestedFilename() || "download";
  const destPath = path.join(destDir, finalName);
  await download.saveAs(destPath);
  const stat = fs.statSync(destPath);
  console.log(`  SAVED: ${destPath} (${(stat.size / 1024).toFixed(1)} KB)`);
  return destPath;
}

function httpDownload(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
    const proto = url.startsWith("https") ? https : http;
    proto
      .get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          return httpDownload(next, destPath, maxRedirects - 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const ws = fs.createWriteStream(destPath);
        res.pipe(ws);
        ws.on("finish", () => {
          ws.close();
          const stat = fs.statSync(destPath);
          console.log(`  SAVED: ${destPath} (${(stat.size / 1024).toFixed(1)} KB)`);
          resolve(destPath);
        });
        ws.on("error", reject);
      })
      .on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FJC IDB — Criminal defendants data
// ─────────────────────────────────────────────────────────────────────────────
async function downloadFJC(browser) {
  console.log("\n=== 1. FJC Integrated Database ===");
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();

  try {
    await page.goto("https://www.fjc.gov/research/idb", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    // Dump the DOM to understand the form structure
    const formHTML = await page.evaluate(() => {
      // Look for form elements, selects, dropdowns
      const forms = document.querySelectorAll("form");
      const selects = document.querySelectorAll("select, [role='listbox']");
      const inputs = document.querySelectorAll("input[type='submit'], button[type='submit']");
      const allBtns = document.querySelectorAll("button, .button, a.button, input[type='button']");

      return {
        formCount: forms.length,
        formHTML: forms.length > 0 ? forms[0].outerHTML.substring(0, 2000) : "no forms",
        selectCount: selects.length,
        selectDetails: Array.from(selects).map(s => ({
          tag: s.tagName,
          id: s.id,
          name: s.name,
          classes: s.className?.substring(0, 80),
          options: Array.from(s.querySelectorAll("option")).map(o => ({
            value: o.value,
            text: o.textContent.trim()
          })),
          visible: s.offsetParent !== null,
          display: getComputedStyle(s).display,
          visibility: getComputedStyle(s).visibility,
        })),
        submitCount: inputs.length,
        buttonCount: allBtns.length,
        buttons: Array.from(allBtns).map(b => ({
          tag: b.tagName,
          text: b.textContent?.trim()?.substring(0, 60),
          type: b.type,
          id: b.id,
          classes: b.className?.substring(0, 60),
          href: b.href || "",
          visible: b.offsetParent !== null,
        })),
      };
    });

    console.log(`  Forms: ${formHTML.formCount}`);
    console.log(`  Selects: ${formHTML.selectCount}`);
    for (const s of formHTML.selectDetails) {
      console.log(`    Select: id="${s.id}" name="${s.name}" visible=${s.visible} display=${s.display}`);
      for (const o of s.options) {
        console.log(`      Option: value="${o.value}" text="${o.text}"`);
      }
    }
    console.log(`  Buttons: ${formHTML.buttonCount}`);
    for (const b of formHTML.buttons) {
      console.log(`    ${b.tag}: "${b.text}" id="${b.id}" type="${b.type}" visible=${b.visible} href=${b.href}`);
    }

    // If there's a hidden select with Criminal option, try selecting via JS + form submit
    let downloaded = false;
    const crimSelect = formHTML.selectDetails.find(s =>
      s.options.some(o => o.text.toLowerCase().includes("criminal"))
    );

    if (crimSelect) {
      console.log(`\n  Found criminal option in select: ${crimSelect.id || crimSelect.name}`);
      const crimOption = crimSelect.options.find(o => o.text.toLowerCase().includes("criminal"));
      console.log(`  Option value: "${crimOption.value}" text: "${crimOption.text}"`);

      // Set the select value and submit the form via JavaScript
      const resultUrl = await page.evaluate(({ selectId, selectName, optionValue }) => {
        const select = selectId ? document.getElementById(selectId) :
                       document.querySelector(`select[name="${selectName}"]`);
        if (!select) return "select not found";

        // Set the value
        select.value = optionValue;
        // Trigger change event
        select.dispatchEvent(new Event("change", { bubbles: true }));

        // Find and submit the parent form
        const form = select.closest("form");
        if (form) {
          // Return the form action URL
          return form.action || window.location.href;
        }
        return "no parent form";
      }, { selectId: crimSelect.id, selectName: crimSelect.name, optionValue: crimOption.value });

      console.log(`  Form action URL: ${resultUrl}`);

      // Submit the form by navigating
      await Promise.all([
        page.waitForNavigation({ timeout: 30000 }).catch(() => null),
        page.evaluate(({ selectId, selectName, optionValue }) => {
          const select = selectId ? document.getElementById(selectId) :
                         document.querySelector(`select[name="${selectName}"]`);
          if (select) {
            select.value = optionValue;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            const form = select.closest("form");
            if (form) form.submit();
          }
        }, { selectId: crimSelect.id, selectName: crimSelect.name, optionValue: crimOption.value }),
      ]);

      await page.waitForTimeout(5000);
      console.log(`  After submit, URL: ${page.url()}`);
      await page.screenshot({
        path: path.join(DIRS.fjc, "01-fjc-after-criminal-submit.png"),
        fullPage: true,
      });

      // Now look for data file links on the resulting page
      const afterLinks = await page.$$eval("a[href]", els => els.map(e => ({
        href: e.href,
        text: (e.textContent || "").trim().substring(0, 150),
      })));

      const fileLinks = afterLinks.filter(l => /\.(zip|csv|txt|sav|gz|tab)(\?|$)/i.test(l.href));
      const crimFileLinks = afterLinks.filter(l =>
        l.text.toLowerCase().includes("criminal") ||
        l.href.toLowerCase().includes("criminal") ||
        l.href.toLowerCase().includes("/cr")
      );

      console.log(`  File links after submit: ${fileLinks.length}`);
      for (const fl of fileLinks.slice(0, 15)) console.log(`    "${fl.text}" -> ${fl.href}`);
      console.log(`  Criminal-related links: ${crimFileLinks.length}`);
      for (const cl of crimFileLinks.slice(0, 15)) console.log(`    "${cl.text}" -> ${cl.href}`);

      // Download the first criminal data file
      const allDataLinks = [...fileLinks, ...crimFileLinks];
      for (const dl of allDataLinks) {
        if (downloaded) break;
        if (/\.(zip|csv|txt|sav|gz|tab)(\?|$)/i.test(dl.href)) {
          const fname = decodeURIComponent(dl.href.split("/").pop().split("?")[0]);
          try {
            console.log(`  Downloading: ${fname} from ${dl.href}`);
            await httpDownload(dl.href, path.join(DIRS.fjc, fname));
            downloaded = true;
            results.fjc = `Downloaded ${fname}`;
          } catch (e) {
            console.log(`    Failed: ${e.message}`);
          }
        }
      }

      // If file links are not direct but are sub-page links, follow them
      if (!downloaded) {
        for (const cl of crimFileLinks.slice(0, 3)) {
          if (downloaded) break;
          if (cl.href === page.url() || cl.href.includes("#")) continue;
          console.log(`  Following link: "${cl.text}" -> ${cl.href}`);
          await page.goto(cl.href, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(3000);
          await page.screenshot({
            path: path.join(DIRS.fjc, "02-fjc-criminal-subpage.png"),
            fullPage: true,
          });

          const subFileLinks = await page.$$eval("a[href]", els =>
            els.filter(e => /\.(zip|csv|txt|sav|gz|tab)(\?|$)/i.test(e.href))
              .map(e => ({ href: e.href, text: (e.textContent || "").trim().substring(0, 100) }))
          );
          console.log(`  File links on subpage: ${subFileLinks.length}`);
          for (const sf of subFileLinks.slice(0, 10)) console.log(`    "${sf.text}" -> ${sf.href}`);

          for (const sf of subFileLinks) {
            const fname = decodeURIComponent(sf.href.split("/").pop().split("?")[0]);
            try {
              await httpDownload(sf.href, path.join(DIRS.fjc, fname));
              downloaded = true;
              results.fjc = `Downloaded ${fname}`;
              break;
            } catch (e) {
              console.log(`    Download failed: ${e.message}`);
            }
          }
        }
      }
    } else {
      console.log("  No criminal option found in any select element");
      // Dump full page HTML (first 5000 chars) to debug
      const html = await page.evaluate(() => document.documentElement.innerHTML.substring(0, 5000));
      console.log("  Page HTML preview:", html.substring(0, 2000));
    }

    if (!downloaded) {
      results.fjc = "Form found but could not locate downloadable criminal data files. See screenshots.";
    }
  } catch (err) {
    console.error(`  FJC ERROR: ${err.message}`);
    results.fjc = `Error: ${err.message}`;
    await page.screenshot({ path: path.join(DIRS.fjc, "error-fjc.png") }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MPV — Already downloaded
// ─────────────────────────────────────────────────────────────────────────────
async function downloadMPV() {
  console.log("\n=== 2. Mapping Police Violence ===");
  const existing = fs.readdirSync(DIRS.mpv).filter(f => !f.endsWith(".png"));
  if (existing.length > 0) {
    console.log(`  Already have: ${existing.join(", ")}`);
    results.mpv = `Already downloaded: ${existing.join(", ")}`;
    return;
  }
  try {
    await httpDownload(
      "https://raw.githubusercontent.com/fivethirtyeight/data/master/police-killings/police_killings.csv",
      path.join(DIRS.mpv, "police_killings.csv")
    );
    results.mpv = "Downloaded police_killings.csv";
  } catch (e) {
    results.mpv = `Failed: ${e.message}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FBI CDE — Nebular nb-select dropdowns
// ─────────────────────────────────────────────────────────────────────────────
async function downloadFBI(browser) {
  console.log("\n=== 3. FBI Crime Data Explorer ===");
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();

  try {
    await page.goto("https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(12000);

    // ---- NIBRS Section: Crime Incident-Based Data by State ----
    // From v3: button:has-text("Location") opens overlay with nb-option state list.
    // ID of first Location nb-select: dwnnibrs-crime-loc-select
    // ID of first Year nb-select: dwnnibrs-crime-year-select
    // Download button ID: dwnnibrsbtnlink

    console.log("  Step 1: Click Location button to open state dropdown...");
    // The button with text "Location" is the trigger for the NIBRS location dropdown
    const locButton = page.locator('button:has-text("Location")').first();
    await locButton.click({ force: true });
    await page.waitForTimeout(2000);

    // Find nb-option elements in overlay
    let stateOptions = await page.locator("nb-option").all();
    console.log(`  State options visible: ${stateOptions.length}`);

    // Select Florida
    let stateSelected = false;
    for (const opt of stateOptions) {
      const text = (await opt.textContent()).trim();
      if (text === "Florida") {
        console.log(`  Selecting: Florida`);
        await opt.click();
        stateSelected = true;
        break;
      }
    }
    if (!stateSelected && stateOptions.length > 0) {
      const text = (await stateOptions[0].textContent()).trim();
      console.log(`  Selecting first state: ${text}`);
      await stateOptions[0].click();
      stateSelected = true;
    }
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(DIRS.fbi, "01-fbi-state-selected.png"),
      fullPage: false,
    });

    // Step 2: Click Year button to open year dropdown
    console.log("  Step 2: Click Year button...");
    const yearButton = page.locator('button:has-text("Year")').first();
    await yearButton.click({ force: true });
    await page.waitForTimeout(2000);

    const yearOptions = await page.locator("nb-option").all();
    console.log(`  Year options visible: ${yearOptions.length}`);

    // List years
    for (const yo of yearOptions.slice(0, 8)) {
      const text = (await yo.textContent()).trim();
      console.log(`    Year: ${text}`);
    }

    // Select most recent year
    let yearSelected = false;
    let bestYear = null;
    let bestYearNum = 0;
    for (const yo of yearOptions) {
      const text = (await yo.textContent()).trim();
      const num = parseInt(text, 10);
      if (!isNaN(num) && num > bestYearNum) {
        bestYearNum = num;
        bestYear = yo;
      }
    }
    if (bestYear) {
      console.log(`  Selecting year: ${bestYearNum}`);
      await bestYear.click();
      yearSelected = true;
    }
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(DIRS.fbi, "02-fbi-year-selected.png"),
      fullPage: false,
    });

    // Step 3: Check if DOWNLOAD button is now enabled
    console.log("  Step 3: Check DOWNLOAD button...");
    const dlBtn = page.locator("#dwnnibrsbtnlink");
    const dlEnabled = await dlBtn.isEnabled().catch(() => false);
    const dlDisabled = await dlBtn.getAttribute("aria-disabled").catch(() => "unknown");
    const dlClasses = await dlBtn.getAttribute("class").catch(() => "");
    console.log(`  Download btn: enabled=${dlEnabled} aria-disabled=${dlDisabled}`);
    console.log(`  Classes: ${dlClasses}`);

    let downloaded = false;

    if (dlEnabled || dlDisabled === "false") {
      console.log("  DOWNLOAD button enabled! Clicking...");
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60000 }).catch(() => null),
        dlBtn.click(),
      ]);
      if (download) {
        await saveDownload(download, DIRS.fbi);
        downloaded = true;
        results.fbi = `Downloaded NIBRS data for Florida ${bestYearNum}`;
      } else {
        console.log("  No download event after clicking.");
        await page.waitForTimeout(3000);
        await page.screenshot({
          path: path.join(DIRS.fbi, "03-fbi-after-download-click.png"),
          fullPage: false,
        });
        // Check if a new tab opened
        const pages = ctx.pages();
        console.log(`  Open pages: ${pages.length}`);
        if (pages.length > 1) {
          const newPage = pages[pages.length - 1];
          console.log(`  New page URL: ${newPage.url()}`);
          const [dl2] = await Promise.all([
            newPage.waitForEvent("download", { timeout: 30000 }).catch(() => null),
          ]);
          if (dl2) {
            await saveDownload(dl2, DIRS.fbi);
            downloaded = true;
            results.fbi = "Downloaded from new tab";
          }
        }
      }
    } else {
      console.log("  Download button still disabled.");
      // Debug: check what the dropdowns show as selected
      const locText = await page.locator("#dwnnibrs-crime-loc-select").textContent().catch(() => "?");
      const yearText = await page.locator("#dwnnibrs-crime-year-select").textContent().catch(() => "?");
      console.log(`  Location shows: "${locText.trim()}"`);
      console.log(`  Year shows: "${yearText.trim()}"`);

      // Try clicking the nb-select directly, then picking option
      console.log("\n  Retry: clicking nb-select#dwnnibrs-crime-loc-select...");
      const nbLoc = page.locator("#dwnnibrs-crime-loc-select");
      await nbLoc.click({ force: true });
      await page.waitForTimeout(2000);

      const opts2 = await page.locator("nb-option").all();
      console.log(`  Options after nb-select click: ${opts2.length}`);
      for (const o of opts2.slice(0, 5)) {
        const t = (await o.textContent()).trim();
        console.log(`    "${t}"`);
      }

      // Select Florida
      for (const o of opts2) {
        const t = (await o.textContent()).trim();
        if (t === "Florida") {
          await o.click();
          console.log("  Selected Florida via nb-select");
          break;
        }
      }
      await page.waitForTimeout(1500);

      // Now year
      console.log("  Clicking nb-select#dwnnibrs-crime-year-select...");
      const nbYear = page.locator("#dwnnibrs-crime-year-select");
      await nbYear.click({ force: true });
      await page.waitForTimeout(2000);

      const yearOpts2 = await page.locator("nb-option").all();
      console.log(`  Year options: ${yearOpts2.length}`);
      let bestYear2 = null;
      let bestYearNum2 = 0;
      for (const yo of yearOpts2) {
        const t = (await yo.textContent()).trim();
        const n = parseInt(t, 10);
        if (!isNaN(n) && n > bestYearNum2) { bestYearNum2 = n; bestYear2 = yo; }
      }
      if (bestYear2) {
        console.log(`  Selecting year: ${bestYearNum2}`);
        await bestYear2.click();
      }
      await page.waitForTimeout(1500);

      // Check download button again
      const dlEnabled2 = await dlBtn.isEnabled().catch(() => false);
      console.log(`  Download btn after retry: enabled=${dlEnabled2}`);
      await page.screenshot({
        path: path.join(DIRS.fbi, "04-fbi-retry-state.png"),
        fullPage: false,
      });

      if (dlEnabled2) {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 60000 }).catch(() => null),
          dlBtn.click(),
        ]);
        if (download) {
          await saveDownload(download, DIRS.fbi);
          downloaded = true;
          results.fbi = `Downloaded NIBRS data (retry) for Florida ${bestYearNum2}`;
        }
      }
    }

    // Fallback: after state+year selection the SPA renders signed S3 download
    // links as <a> tags. From v4 logs we saw:
    //   "Download the Florida File, 2024" -> https://cde-prd-data.s3.us-gov-east-1.amazonaws.com/nibrs/...
    // Grab those and download directly.
    if (!downloaded) {
      console.log("\n  Fallback: looking for signed S3 download links...");
      const s3Links = await page.$$eval("a[href]", els =>
        els.filter(e => e.href && (
          e.href.includes("s3.us-gov") || e.href.includes("amazonaws") ||
          (e.href.includes(".zip") && !e.href.includes("#"))
        )).map(e => ({ href: e.href, text: (e.textContent || "").trim().substring(0, 100) }))
      );
      console.log(`  S3/ZIP links: ${s3Links.length}`);
      for (const sl of s3Links) console.log(`    "${sl.text}" -> ${sl.href.substring(0, 120)}...`);

      for (const link of s3Links) {
        if (downloaded) break;
        try {
          // Determine filename from URL path
          const urlPath = new URL(link.href).pathname;
          const fname = urlPath.split("/").pop() || "fbi-nibrs-download.zip";
          console.log(`  Downloading ${fname} via HTTP...`);
          await httpDownload(link.href, path.join(DIRS.fbi, fname));
          downloaded = true;
          results.fbi = `Downloaded ${fname} (NIBRS Florida 2024)`;
        } catch (e) {
          console.log(`    HTTP failed: ${e.message}`);
          // Try clicking the link in the browser (handles signed URL redirects)
          try {
            console.log("    Trying click in browser context...");
            const linkLocator = page.locator(`a:has-text("${link.text}")`).first();
            const [dl] = await Promise.all([
              page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
              linkLocator.click({ force: true }),
            ]);
            if (dl) {
              await saveDownload(dl, DIRS.fbi, dl.suggestedFilename() || "FL-2024.zip");
              downloaded = true;
              results.fbi = "Downloaded NIBRS via browser click";
            }
          } catch (e2) {
            console.log(`    Browser click also failed: ${e2.message}`);
          }
        }
      }
    }

    // Last resort: click the S3 anchor directly by href selector
    if (!downloaded) {
      const s3Anchor = page.locator('a[href*="s3.us-gov"]').first();
      const s3Count = await s3Anchor.count();
      if (s3Count > 0) {
        console.log("  Last resort: force-clicking S3 anchor...");
        try {
          const [dl] = await Promise.all([
            page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
            s3Anchor.click({ force: true }),
          ]);
          if (dl) {
            await saveDownload(dl, DIRS.fbi);
            downloaded = true;
            results.fbi = "Downloaded via S3 anchor force-click";
          }
        } catch (e) {
          console.log(`  Force-click failed: ${e.message}`);
        }
      }
      await page.screenshot({
        path: path.join(DIRS.fbi, "05-fbi-final.png"),
        fullPage: true,
      });
    }

    if (!downloaded) {
      results.fbi = "Could not trigger download. See screenshots + logs for DOM analysis.";
    }
  } catch (err) {
    console.error(`  FBI ERROR: ${err.message}`);
    results.fbi = `Error: ${err.message}`;
    await page.screenshot({ path: path.join(DIRS.fbi, "error-fbi.png") }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Starting browser download automation (v4)...\n");

  const browser = await chromium.launch({ headless: true });
  try {
    await downloadFJC(browser);
    await downloadMPV();
    await downloadFBI(browser);
  } finally {
    await browser.close();
  }

  console.log("\n" + "=".repeat(60));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(60));
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k.toUpperCase()}: ${v}`);
  }

  console.log("\nALL FILES:");
  for (const [k, d] of Object.entries(DIRS)) {
    const files = fs.readdirSync(d);
    const data = files.filter(f => !f.endsWith(".png"));
    console.log(`\n  ${k}/ — ${data.length} data files`);
    for (const f of data) {
      const stat = fs.statSync(path.join(d, f));
      console.log(`  >> ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
    }
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
