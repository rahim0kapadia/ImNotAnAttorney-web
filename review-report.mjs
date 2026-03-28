#!/usr/bin/env node
/**
 * review-report.mjs - Render markdown to HTML + deploy to Supabase.
 * Synced from Edge Function renderReportHtml (2026-03-07).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, ".review-state.json");
const DEFAULT_REPORT = resolve(__dirname, "test-reports/session-dui-test.md");

const envPath = resolve(__dirname, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) { console.error("Missing Supabase env vars"); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
const isUpdate = args.includes("--update");
const isCleanup = args.includes("--cleanup");
const fileIdx = args.indexOf("--file");
const reportPath = fileIdx !== -1 && args[fileIdx + 1] ? resolve(args[fileIdx + 1]) : DEFAULT_REPORT;

// --- HTML Rendering (synced from Edge Function) ---

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderReportHtml(
  markdown,
  meta
) {
  let html = markdown
    .replace(/^#### (.+)$/gm, '<h4 style="color: #F59E0B; font-size: 14px; margin-top: 20px;">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="color: white; font-size: 16px; margin-top: 24px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color: #F59E0B; font-size: 20px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272A;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: white;">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^>[ ]?(.*)$/gm, (_m, content) => '<blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0; color: #A1A1AA;">' + (content || '') + '</blockquote>')
    .replace(/^- \[x\] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9745; $1</li>')
    .replace(/^- \[ \] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9744; $1</li>')
    .replace(/^- (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return "";
      const isHeader = cells.some((c) => c.startsWith("**") || c === "#");
      const tag = isHeader ? "th" : "td";
      const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
      return `<tr>${cells.map((c) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`;
    })
    .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p style="margin: 8px 0; line-height: 1.6;">$1</p>');

  html = html.replace(
    /(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
    (tableMatch) => {
      const rows = tableMatch.split('</tr>').filter((r) => r.trim());
      if (rows.length > 0) {
        rows[0] = rows[0].replace(/<td /g, '<th ').replace(/<\/td>/g, '</th>');
      }
      return '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">' + rows.map((r) => r.trim() ? r.trim() + '</tr>' : '').filter(Boolean).join('\n') + '</table>';
    }
  );

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(
    /(<li[\s\S]*?<\/li>\s*)+/g,
    '<ul style="margin: 8px 0; padding-left: 24px;">$&</ul>'
  );

  // Merge consecutive <blockquote> elements into a single blockquote
  html = html.replace(
    /(<blockquote[^>]*>[\s\S]*?<\/blockquote>\s*)+/g,
    (bqMatch) => {
      const contents = [];
      const re = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g;
      let m;
      while ((m = re.exec(bqMatch)) !== null) { contents.push(m[1]); }
      return '<blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0; color: #A1A1AA;">' + contents.join('<br>') + '</blockquote>';
    }
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Case Decoder Report — ${escapeHtml(meta.firstName)}</title>
<style>
  @media print {
    body { background: white !important; color: #1a1a1a !important; }
    * { color: #1a1a1a !important; }
    h2, h3, h4 { color: #92400e !important; }
    strong { color: #1a1a1a !important; }
    blockquote { border-left-color: #92400e !important; }
    table, th, td { border-color: #d4d4d4 !important; }
    .print-hidden { display: none !important; }
    .header-block { background: #f5f5f4 !important; border-color: #92400e !important; }
    a { color: #92400e !important; }
  }
</style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0C0A09; color: #D4D4D8; margin: 0; padding: 0;">
<div style="max-width: 800px; margin: 0 auto; padding: 32px 24px;">
  <div class="header-block" style="background: #1C1917; padding: 32px; border-radius: 12px; border: 2px solid #F59E0B; margin-bottom: 32px; text-align: center;">
    <h1 style="color: #F59E0B; font-size: 28px; margin: 0;">CASE DECODER REPORT</h1>
    <p style="color: #A1A1AA; margin: 8px 0 0; font-size: 14px;">ImNotAnAttorney | Know What They Know.</p>
    <div style="margin-top: 24px; text-align: left;">
      <p style="margin: 4px 0;"><strong style="color: white;">Prepared for:</strong> ${escapeHtml(meta.firstName)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Charge(s):</strong> ${escapeHtml(meta.charges)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Jurisdiction:</strong> ${escapeHtml(meta.jurisdiction)}</p>
      ${meta.caseNumber ? `<p style="margin: 4px 0;"><strong style="color: white;">Case Number:</strong> ${escapeHtml(meta.caseNumber)}</p>` : ""}
      ${meta.courtDate ? `<p style="margin: 4px 0;"><strong style="color: white;">Next Court Date:</strong> ${escapeHtml(meta.courtDate)}</p>` : ""}
      ${meta.daysSinceArrest != null ? `<p style="margin: 4px 0;"><strong style="color: white;">Days Since Arrest:</strong> ${meta.daysSinceArrest}</p>` : ""}
      <p style="margin: 4px 0;"><strong style="color: white;">Report Date:</strong> ${escapeHtml(meta.reportDate)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Report ID:</strong> ${escapeHtml(meta.reportId)}</p>
    </div>
  </div>
  ${meta.expertNames ? `<blockquote style="border-left: 3px solid #F59E0B; padding: 16px; margin: 24px 0; background: #1C1917; border-radius: 0 8px 8px 0;">
    <p style="margin: 0 0 12px; color: #F59E0B; font-weight: bold;">METHODOLOGY NOTE</p>
    <p style="margin: 0 0 12px; color: #A1A1AA;">Every question and framework in this report traces to documented winning methods from elite criminal defense attorneys. Your report draws on ${escapeHtml(meta.expertNames)} — selected for ${escapeHtml(meta.chargeType || meta.charges)} cases. Expert attributions appear throughout.</p>
    <p style="margin: 0; color: #A1A1AA;"><strong style="color: white;">Important:</strong> This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.</p>
  </blockquote>` : ""}
  ${html}
  <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 40px; border-left: 4px solid #A1A1AA;">
    <p style="margin: 0; font-size: 13px; color: #71717A;">
      <strong style="color: #A1A1AA;">A note on what this is:</strong> This report gives you legal information, context, and questions — not legal advice. We can't tell you what to do. What we can do is make sure you walk into your next conversation informed, prepared, and asking the right things. Your attorney has your case file, your courtroom, and your judge. This report makes sure you know what to ask them — and why it matters.
    </p>
  </div>
  <div style="margin-top: 48px; padding-top: 24px; border-top: 2px solid #27272A; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #71717A;">&copy; ${new Date().getFullYear()} ImNotAnAttorney. Legal information, not legal advice.</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #52525B;">Report ID: ${meta.reportId} | Generated: ${meta.reportDate}</p>
  </div>
  <div class="print-hidden" style="margin-top: 32px; text-align: center;">
    <p style="margin: 0 0 12px; font-size: 14px; color: #A1A1AA;">After your meeting, if you want to verify your attorney's answers against the evidence:</p>
    <a href="/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Case Intelligence Brief — $997 ($800 after credit)</a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is fully credited toward any tier within 12 months. No pressure — decide after your meeting.</p>
  </div>
</div>
</body>
</html>`;
}


// --- CLI ---

const META = {
  firstName: "TestUser", charges: "DUI — First Offense",
  jurisdiction: "Pinellas County, FL", reportDate: new Date().toISOString().split("T")[0],
  reportId: "TEST-" + randomUUID().slice(0, 8).toUpperCase(),
  caseNumber: "24-00001-CT", courtDate: "2026-04-15", daysSinceArrest: 45,
  expertNames: "Lawrence Taylor, William C. Head, Justin McShane", chargeType: "dui",
};

async function createTestCase() {
  const md = readFileSync(reportPath, "utf8");
  const html = renderReportHtml(md, META);
  const token = randomUUID(), orderId = randomUUID(), caseId = randomUUID(), intakeId = randomUUID();
  let err;
  ({ error: err } = await supabase.from("orders").insert({ id: orderId, email: "test@example.com", tier: "case-decoder", amount_cents: 19700, stripe_session_id: "test_" + Date.now(), stripe_payment_intent: "test_pi_" + Date.now() }));
  if (err) { console.error("Order:", err); process.exit(1); }
  ({ error: err } = await supabase.from("cases").insert({ id: caseId, order_id: orderId, email: "test@example.com", first_name: "TestUser", status: "review", tier: "case-decoder", report_html: html, report_token: token }));
  if (err) { console.error("Case:", err); process.exit(1); }
  ({ error: err } = await supabase.from("intakes").insert({ id: intakeId, case_id: caseId, charge_type: "dui", state_county: "Pinellas County, FL", charges: META.charges, first_name: "TestUser" }));
  if (err) { console.error("Intake:", err); process.exit(1); }
  writeFileSync(STATE_FILE, JSON.stringify({ caseId, orderId, intakeId, reportToken: token, reportPath, createdAt: new Date().toISOString() }, null, 2));
  console.log("Created. URL: https://imnotanattorney.com/report/" + token);
}

async function updateReport() {
  if (!existsSync(STATE_FILE)) { console.error("No state file."); process.exit(1); }
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const md = readFileSync(state.reportPath || reportPath, "utf8");
  const html = renderReportHtml(md, META);
  const { error } = await supabase.from("cases").update({ report_html: html }).eq("id", state.caseId);
  if (error) { console.error("Update:", error); process.exit(1); }
  console.log("Updated. URL: https://imnotanattorney.com/report/" + state.reportToken);
}

async function cleanup() {
  if (!existsSync(STATE_FILE)) { console.error("No state file."); process.exit(1); }
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const { error } = await supabase.from("cases").update({ status: "refunded" }).eq("id", state.caseId);
  if (error) { console.error("Cleanup:", error); process.exit(1); }
  console.log("Cleaned up. Case " + state.caseId + " marked refunded.");
}

if (isCleanup) await cleanup();
else if (isUpdate) await updateReport();
else await createTestCase();
