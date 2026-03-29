/**
 * Render GBP cover HTML to 1024x576 PNG using Puppeteer.
 * Same pattern as KDP-Publishing/scripts/build/render-covers.js
 */
const puppeteer = require('C:/Users/email/projects/KDP-Publishing/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const htmlPath = path.resolve(__dirname, 'gbp-cover.html');
  const outPath = path.resolve(__dirname, 'gbp-cover-1024x576.png');

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 576, deviceScaleFactor: 2 });

  const fileUrl = 'file:///' + htmlPath.split(path.sep).join('/');
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({
    path: outPath,
    clip: { x: 0, y: 0, width: 1024, height: 576 },
    type: 'png',
  });

  await browser.close();
  const stats = fs.statSync(outPath);
  console.log('OK:', outPath, (stats.size / 1024).toFixed(0) + 'KB');
})();
