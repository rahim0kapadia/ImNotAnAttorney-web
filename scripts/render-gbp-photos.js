/**
 * Generate GBP product photos by screenshotting real site pages
 * and rendering HTML mockups of deliverables.
 */
const puppeteer = require('C:/Users/email/projects/KDP-Publishing/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, 'gbp-photos');

const SITE_SCREENSHOTS = [
  { name: 'homepage-hero', url: 'https://imnotanattorney.com', clip: { x: 0, y: 0, width: 1400, height: 900 } },
  { name: 'homepage-proof', url: 'https://imnotanattorney.com', clip: { x: 0, y: 900, width: 1400, height: 900 } },
  { name: 'score-page', url: 'https://imnotanattorney.com/score', clip: { x: 0, y: 0, width: 1400, height: 900 } },
  { name: 'pricing', url: 'https://imnotanattorney.com/services', clip: { x: 0, y: 0, width: 1400, height: 900 } },
  { name: 'sample-report', url: 'https://imnotanattorney.com/sample', clip: { x: 0, y: 0, width: 1400, height: 900 } },
  { name: 'playbooks-catalog', url: 'https://imnotanattorney.com/playbooks', clip: { x: 0, y: 0, width: 1400, height: 900 } },
];

// HTML mockups of deliverables
const MOCKUPS = [
  {
    name: 'deliverable-questions',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap');
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width:1400px; height:900px; background:#0a0a0a; font-family:'Lato',sans-serif; padding:60px 80px; }
      .header { border-bottom:2px solid #f59e0b; padding-bottom:20px; margin-bottom:40px; }
      .header h1 { color:#fff; font-size:28px; }
      .header p { color:#f59e0b; font-size:14px; margin-top:6px; letter-spacing:2px; text-transform:uppercase; }
      .label { color:#f59e0b; font-size:12px; text-transform:uppercase; letter-spacing:2px; margin-bottom:16px; }
      .question { background:#18181b; border-left:3px solid #f59e0b; padding:20px 24px; margin-bottom:16px; border-radius:0 8px 8px 0; }
      .question .num { color:#f59e0b; font-size:12px; font-weight:700; margin-bottom:6px; }
      .question .text { color:#e4e4e7; font-size:16px; line-height:1.5; }
      .question .context { color:#71717a; font-size:13px; margin-top:8px; font-style:italic; }
      .footer { position:absolute; bottom:40px; left:80px; right:80px; border-top:1px solid #27272a; padding-top:16px; }
      .footer p { color:#52525b; font-size:12px; }
    </style></head><body>
      <div class="header">
        <h1>Case Decoder Report, Attorney Accountability Questions</h1>
        <p>ImNotAnAttorney</p>
      </div>
      <div class="label">Questions for Your Attorney</div>
      <div class="question">
        <div class="num">Question 3 of 15</div>
        <div class="text">The police report lists 93.9 grams at the scene. The lab report shows 25.59 grams tested. Can you explain the 68.3-gram discrepancy and confirm whether a chain of custody log exists for the missing weight?</div>
        <div class="context">Why this matters: Weight discrepancies between scene and lab create reasonable doubt about evidence integrity.</div>
      </div>
      <div class="question">
        <div class="num">Question 4 of 15</div>
        <div class="text">The supplement report lists phone number (912) 380-2720 under both the suspect and confidential informant CI-7042. Has this dual attribution been investigated, and has a motion to disclose the CI's identity been considered?</div>
        <div class="context">Why this matters: Shared contact information between suspect and CI suggests a relationship that undermines informant credibility.</div>
      </div>
      <div class="question">
        <div class="num">Question 5 of 15</div>
        <div class="text">The field test identified the substance as MDMA. The forensic lab report identifies it as methamphetamine. The charge references FS 893.135(1)(f)(1) for amphetamine trafficking. Which substance is the charge actually based on?</div>
        <div class="context">Why this matters: A mismatch between charged substance and lab-confirmed substance may invalidate the specific trafficking statute cited.</div>
      </div>
      <div class="footer"><p>This is legal information, not legal advice. Bring these questions to your next attorney meeting.</p></div>
    </body></html>`
  },
  {
    name: 'deliverable-analysis',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Playfair+Display:wght@700&display=swap');
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width:1400px; height:900px; background:#0a0a0a; font-family:'Lato',sans-serif; padding:60px 80px; }
      .header { border-bottom:2px solid #f59e0b; padding-bottom:20px; margin-bottom:40px; display:flex; justify-content:space-between; align-items:flex-end; }
      .header h1 { color:#fff; font-size:28px; }
      .header .badge { background:#f59e0b; color:#000; padding:6px 16px; border-radius:4px; font-size:12px; font-weight:700; text-transform:uppercase; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
      .card { background:#18181b; border:1px solid #27272a; border-radius:8px; padding:24px; }
      .card .title { color:#f59e0b; font-size:13px; text-transform:uppercase; letter-spacing:2px; margin-bottom:12px; }
      .card .stat { color:#fff; font-size:36px; font-weight:700; font-family:'Playfair Display',serif; }
      .card .desc { color:#a1a1aa; font-size:14px; margin-top:8px; line-height:1.5; }
      .card.alert { border-color:#ef4444; }
      .card.alert .title { color:#ef4444; }
      .card.alert .stat { color:#ef4444; }
      .footer { position:absolute; bottom:40px; left:80px; right:80px; border-top:1px solid #27272a; padding-top:16px; }
      .footer p { color:#52525b; font-size:12px; }
    </style></head><body>
      <div class="header">
        <h1>Case Analysis Dashboard</h1>
        <div class="badge">Case Decoder</div>
      </div>
      <div class="grid">
        <div class="card alert">
          <div class="title">Evidence Discrepancies</div>
          <div class="stat">3 Found</div>
          <div class="desc">Weight mismatch (68.3g), substance misidentification, CI dual attribution. Each flagged with source document references.</div>
        </div>
        <div class="card">
          <div class="title">Questions Generated</div>
          <div class="stat">15</div>
          <div class="desc">Calibrated accountability questions with context, source references, and suggested follow-up for your attorney meeting.</div>
        </div>
        <div class="card">
          <div class="title">Motions to Discuss</div>
          <div class="stat">4 Identified</div>
          <div class="desc">Suppression motion (evidence handling), Brady request, CI disclosure motion, substance retest motion.</div>
        </div>
        <div class="card">
          <div class="title">Defense Angles</div>
          <div class="stat">6 Researched</div>
          <div class="desc">Chain of custody, informant credibility, lab methodology, statutory element mismatch, procedural violations, witness inconsistencies.</div>
        </div>
      </div>
      <div class="footer"><p>ImNotAnAttorney, Know What They Know. This is legal information, not legal advice.</p></div>
    </body></html>`
  }
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true });

  // Render site screenshots
  for (const shot of SITE_SCREENSHOTS) {
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1400, height: 2000, deviceScaleFactor: 1 });
      await page.goto(shot.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));

      const outPath = path.join(OUT_DIR, `${shot.name}.png`);
      await page.screenshot({ path: outPath, clip: shot.clip, type: 'png' });
      await page.close();

      const stats = fs.statSync(outPath);
      console.log(`OK: ${shot.name}, ${(stats.size / 1024).toFixed(0)}KB`);
    } catch (err) {
      console.log(`FAIL: ${shot.name}, ${err.message}`);
    }
  }

  // Render HTML mockups
  for (const mockup of MOCKUPS) {
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
      await page.setContent(mockup.html, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await new Promise(r => setTimeout(r, 1500));

      const outPath = path.join(OUT_DIR, `${mockup.name}.png`);
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1400, height: 900 }, type: 'png' });
      await page.close();

      const stats = fs.statSync(outPath);
      console.log(`OK: ${mockup.name}, ${(stats.size / 1024).toFixed(0)}KB`);
    } catch (err) {
      console.log(`FAIL: ${mockup.name}, ${err.message}`);
    }
  }

  await browser.close();
  console.log('\nAll photos saved to:', OUT_DIR);
})();
