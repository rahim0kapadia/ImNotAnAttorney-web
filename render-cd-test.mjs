/**
 * Render-only script for Case Decoder test reports.
 * Reads existing .md, renders to .html using the same renderer as test-report-quality.mjs.
 * Usage: node render-cd-test.mjs [persona-id]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PERSONAS = {
  "persona-a-dui": {
    firstName: "Danielle",
    charges: "DWI (First Offense)",
    jurisdiction: "Texas — Harris County (State)",
    caseNumber: "25-CR-11247",
    courtDate: "March 20, 2026",
    daysSinceArrest: 69,
    expertNames: 'Lawrence Taylor (DWI defense treatise), William "Bubba" Head (NHTSA mastery), and Justin McShane (forensic chemistry)',
    chargeType: "DWI",
  },
  "persona-b-drug": {
    firstName: "Marcus",
    charges: "Cannabis Possession Over 20g (F.S. § 893.13(6)(a))",
    jurisdiction: "Florida — Pinellas County (State)",
    caseNumber: "26-CF-00412",
    courtDate: "April 10, 2026",
    daysSinceArrest: 51,
    expertNames: "Jeffrey Lichtman (CI destruction protocol), Ron Chapman II (forensic substance challenge), and Michael Levine (government case deconstruction)",
    chargeType: "Drug",
  },
  "persona-c-whitecollar": {
    firstName: "Jennifer",
    charges: "Wire Fraud (18 U.S.C. § 1343)",
    jurisdiction: "California — Northern District, N.D. Cal. (Federal)",
    caseNumber: "2:25-CR-00891",
    courtDate: "May 15, 2026",
    daysSinceArrest: 127,
    expertNames: "Martin G. Weinberg (intent defense/good faith reliance), Cristina C. Arguedas (pre-indictment intervention), and David B. Smith (forfeiture defense)",
    chargeType: "White Collar/Fraud",
  },
  "persona-d-dv": {
    firstName: "Sofia",
    charges: "Assault — Family Violence (Texas Penal Code § 22.01(b)(2))",
    jurisdiction: "Texas — Bexar County (State)",
    caseNumber: "2025-CR-09218-B",
    courtDate: "April 28, 2026",
    daysSinceArrest: 168,
    expertNames: "Lisa Wayne (NACDL past president, defender rights), Lenore Walker (battered woman syndrome pioneer), and Susan Criss (former Texas judge, DV case dynamics)",
    chargeType: "Domestic Violence",
  },
};

const personaId = process.argv[2] || "persona-a-dui";
const meta = PERSONAS[personaId];
if (!meta) {
  console.error(`Unknown persona: ${personaId}`);
  process.exit(1);
}

meta.reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
meta.reportId = `TEST-${personaId.toUpperCase().replace("PERSONA-", "")}-001`;

const mdPath = path.join(__dirname, "test-reports", `${personaId}.md`);
const markdown = fs.readFileSync(mdPath, "utf-8");

// Renderer from test-report-quality.mjs
let html = markdown
  .replace(/^```[\s\S]*?```/gm, (m) =>
    '<pre style="background:#1C1917;padding:16px;border-radius:8px;overflow-x:auto;margin:16px 0;font-size:13px;color:#A1A1AA;white-space:pre-wrap;">' +
    m.replace(/^```\w*\n?/, "").replace(/```$/, "") +
    "</pre>"
  )
  .replace(/^#### (.+)$/gm, '<h4 style="color: #F59E0B; font-size: 14px; margin-top: 20px;">$1</h4>')
  .replace(/^### (.+)$/gm, '<h3 style="color: white; font-size: 16px; margin-top: 24px;">$1</h3>')
  .replace(/^## (.+)$/gm, '<h2 style="color: #F59E0B; font-size: 20px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272A;">$1</h2>')
  .replace(/\*\*(.+?)\*\*/g, '<strong style="color: white;">$1</strong>')
  .replace(/\*(.+?)\*/g, "<em>$1</em>")
  .replace(/^> (.+)$/gm, '<blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0; color: #A1A1AA;">$1</blockquote>')
  .replace(/^- \[x\] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9745; $1</li>')
  .replace(/^- \[ \] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9744; $1</li>')
  .replace(/^- (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
  .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
  .replace(/\|(.+)\|/g, (match) => {
    const cells = match.split("|").filter(Boolean).map((c) => c.trim());
    if (cells.every((c) => /^[-:]+$/.test(c))) return "";
    const tag = "td";
    const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
    return `<tr>${cells.map((c) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`;
  })
  .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p style="margin: 8px 0; line-height: 1.6;">$1</p>');

html = html.replace(
  /(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
  '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">$1</table>'
);

const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Case Decoder Report — ${meta.firstName}</title>
<style>
  @media print {
    body { background: white !important; color: #1a1a1a !important; }
    * { color: #1a1a1a !important; }
    h2, h3, h4 { color: #92400e !important; }
    strong { color: #1a1a1a !important; }
    blockquote { border-left-color: #92400e !important; }
    .no-print { display: none !important; }
    .header-block { background: #f5f5f4 !important; border-color: #92400e !important; }
  }
</style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0C0A09; color: #D4D4D8; margin: 0; padding: 0;">
<div style="max-width: 800px; margin: 0 auto; padding: 32px 24px;">
  <div class="header-block" style="background: #1C1917; padding: 32px; border-radius: 12px; border: 2px solid #F59E0B; margin-bottom: 32px; text-align: center;">
    <h1 style="color: #F59E0B; font-size: 28px; margin: 0;">CASE DECODER REPORT</h1>
    <p style="color: #A1A1AA; margin: 8px 0 0; font-size: 14px;">ImNotAnAttorney | We Research. You Ask.</p>
    <div style="margin-top: 24px; text-align: left;">
      <p style="margin: 4px 0;"><strong style="color: white;">Prepared for:</strong> ${escapeHtml(meta.firstName)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Charge(s):</strong> ${escapeHtml(meta.charges)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Jurisdiction:</strong> ${escapeHtml(meta.jurisdiction)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Case Number:</strong> ${escapeHtml(meta.caseNumber)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Next Court Date:</strong> ${escapeHtml(meta.courtDate)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Days Since Arrest:</strong> ${meta.daysSinceArrest}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Report Date:</strong> ${escapeHtml(meta.reportDate)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Report ID:</strong> ${escapeHtml(meta.reportId)}</p>
    </div>
  </div>
  <blockquote style="border-left: 3px solid #F59E0B; padding: 16px; margin: 24px 0; background: #1C1917; border-radius: 0 8px 8px 0;">
    <p style="margin: 0 0 12px; color: #F59E0B; font-weight: bold;">METHODOLOGY NOTE</p>
    <p style="margin: 0 0 12px; color: #A1A1AA;">Every question and framework in this report traces to documented winning methods from elite criminal defense attorneys. Your report draws on ${meta.expertNames} — selected for ${meta.chargeType} cases. Expert attributions appear throughout.</p>
    <p style="margin: 0; color: #A1A1AA;"><strong style="color: white;">Important:</strong> This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.</p>
  </blockquote>
  ${html}
  <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 40px; border-left: 4px solid #A1A1AA;">
    <p style="margin: 0; font-size: 13px; color: #71717A;">
      <strong style="color: #A1A1AA;">A note on what this is:</strong> This report gives you legal information, context, and questions — not legal advice. We can't tell you what to do. What we can do is make sure you walk into your next conversation informed, prepared, and asking the right things. Your attorney has your case file, your courtroom, and your judge. This report makes sure you know what to ask them — and why it matters.
    </p>
  </div>
  <div style="margin-top: 48px; padding-top: 24px; border-top: 2px solid #27272A; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #71717A;">&copy; 2026 ImNotAnAttorney. Legal information, not legal advice.</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #52525B;">Report ID: ${meta.reportId} | Generated: ${meta.reportDate}</p>
  </div>
  <div class="no-print" style="margin-top: 32px; text-align: center;">
    <p style="margin: 0 0 12px; font-size: 14px; color: #A1A1AA;">After your meeting, if you want to verify your attorney's answers against the evidence:</p>
    <a href="/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Case Intelligence Brief — $997 ($800 after credit)</a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is fully credited toward any tier within 12 months. No pressure — decide after your meeting.</p>
  </div>
</div>
</body>
</html>`;

const htmlPath = path.join(__dirname, "test-reports", `${personaId}.html`);
fs.writeFileSync(htmlPath, fullHtml, "utf-8");
console.log(`Rendered: ${htmlPath} (${fullHtml.length} bytes)`);
