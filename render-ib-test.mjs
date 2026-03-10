/**
 * Render an IB markdown test report to HTML using the client renderer.
 *
 * Usage: npx tsx render-ib-test.mjs [markdown-file]
 * Default: test-reports/ib-danielle-v3.md → test-reports/ib-danielle-v3.html
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamic import of the renderer (TypeScript, needs tsx)
const { renderIntelligenceBriefHtml } = await import(
  "./src/lib/intelligence-brief/render.ts"
);

const inputFile = process.argv[2] || "test-reports/ib-danielle-v3.md";
const inputPath = path.resolve(__dirname, inputFile);
const outputPath = inputPath.replace(/\.md$/, ".html");

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

const markdown = fs.readFileSync(inputPath, "utf-8");

// Parse markdown into section outputs by matching ## headings to section keys
const SECTION_MAP = [
  { heading: "START HERE: Your 48-Hour Priority List", key: "48hr-priorities" },
  { heading: "Section 1: Your Case Roadmap", key: "case-roadmap" },
  { heading: "Section 2: What's Working", key: "whats-working" },
  { heading: "Section 3: Your Case Intelligence", key: "case-intelligence" },
  { heading: "Section 4: Legal Options", key: "legal-options" },
  { heading: "Section 5: Protecting Your Case", key: "protection" },
  { heading: "Section 6: Your Plan", key: "your-plan" },
  { heading: "Appendix B: Next Court Date", key: "court-prep" },
  { heading: "Appendix D: Targeted Follow-Up", key: "questions" },
];

// Split on ## headings, keeping the heading with the content
const sections = markdown.split(/^(?=## )/m).filter((s) => s.trim());

const sectionOutputs = {};

for (const section of sections) {
  // Skip comment lines at top
  if (section.startsWith("#") && !section.startsWith("## ")) continue;
  if (section.startsWith("---") && section.trim() === "---") continue;

  const firstLine = section.split("\n")[0].trim();

  for (const { heading, key } of SECTION_MAP) {
    if (firstLine.includes(heading)) {
      sectionOutputs[key] = section.trim();
      break;
    }
  }
}

console.log("Parsed sections:", Object.keys(sectionOutputs).join(", "));
console.log(
  "Section count:",
  Object.keys(sectionOutputs).length,
  "/ 9 expected"
);

// Report metadata — load from .meta.json sidecar if it exists, else fall back to Danielle
const metaPath = inputPath.replace(/\.md$/, ".meta.json");
let meta;
if (fs.existsSync(metaPath)) {
  const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  meta = {
    ...raw,
    reportDate: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  };
  console.log(`Loaded persona metadata from: ${path.basename(metaPath)}`);
} else {
  meta = {
    firstName: "Danielle",
    charges: "DWI, First Offense (Texas Penal Code § 49.04)",
    stateCounty: "Texas, Harris County",
    caseNumber: "2025-CR-44891",
    nextCourtDate: "April 15, 2026",
    judgeName: "Judge Patricia Martinez",
    attorneyName: "Michael Torres (Public Defender)",
    reportDate: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    reportId: "IB-TEST-V3",
    monthsSinceArrest: "3",
    ibPriceDisplay: "$997",
    xrayPriceDisplay: "$2,497",
    xrayUpgradeCost: "$1,500",
    expertNames: "Lawrence Taylor, Justin McShane, William \"Bubba\" Head, Chris Voss, BJ Fogg",
  };
  console.log("Using default Danielle persona metadata (no .meta.json found)");
}

const html = renderIntelligenceBriefHtml(sectionOutputs, meta);

fs.writeFileSync(outputPath, html, "utf-8");
console.log(`\nHTML report written to: ${outputPath}`);
console.log(`Size: ${(html.length / 1024).toFixed(1)} KB`);
