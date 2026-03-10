/**
 * @fileoverview LEGACY — Claude API client for Case Decoder report generation.
 *
 * =====================================================================
 *  WARNING: THIS FILE IS LEGACY AND NO LONGER USED IN PRODUCTION.
 * =====================================================================
 *
 * This module was replaced by the Supabase Edge Function at:
 *   supabase/functions/generate-report/index.ts
 *
 * WHY IT WAS REPLACED:
 *   Vercel Hobby plan has a 25-second function timeout. Claude API calls
 *   for Case Decoder reports (16k max_tokens, streaming) typically take
 *   40-90 seconds to complete. The Supabase Edge Function has a 150-second
 *   timeout, which is sufficient for full report generation.
 *
 * The edge function now uses claude-opus-4-6 with adaptive thinking for
 * emotional intelligence. This legacy file still references sonnet-4-6
 * but is NOT used in production. The edge function is preferred because
 * it has a 150s timeout vs Vercel's 25s.
 *
 * The renderReportHtml() function at the bottom IS still imported by other
 * modules (it's the shared HTML renderer for report preview pages), so
 * this file cannot be deleted without migrating that function elsewhere.
 *
 * DO NOT add new callers to generateCaseDecoderReport(). Use the edge
 * function via POST /api/generate/case-decoder instead.
 * =====================================================================
 */

// ============================================================
// CLAUDE SYSTEM PROMPT — REMOVED (v1 legacy)
// ============================================================
//
// The v1 SYSTEM_PROMPT with scores, red flags, and 13-section format
// was deleted in the Mar 10, 2026 content quality audit. It was
// dangerously out of sync with the v2 emotional architecture in the
// Edge Function (supabase/functions/generate-report/index.ts).
//
// The Edge Function contains the ONLY production system prompt.
// This file retains only renderReportHtml() which is still imported.
// ============================================================

// ============================================================
// HTML REPORT RENDERER (still active — used by report preview pages)
// ============================================================

import { escapeHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

/**
 * Converts a markdown Case Decoder report into a branded HTML document.
 *
 * This function IS still active (unlike generateCaseDecoderReport above) —
 * it is used by the /report/[token] preview page to render saved reports.
 *
 * Features:
 *   - Dark theme matching the site brand (#0C0A09 bg, #F59E0B amber accent)
 *   - Print-friendly CSS (switches to white bg, dark text via @media print)
 *   - Header block with case metadata (all values escaped for XSS prevention)
 *   - Legal disclaimer block
 *   - Upgrade CTA hidden in print mode
 *   - Simple markdown-to-HTML conversion (headers, bold, italic, blockquotes,
 *     lists, checkboxes, tables, paragraphs)
 *
 * @param markdown - The raw markdown report from Claude API.
 * @param meta - Case metadata for the header block.
 * @param meta.firstName - Client's first name (escaped before rendering).
 * @param meta.charges - Charge description (escaped before rendering).
 * @param meta.jurisdiction - State / county string.
 * @param meta.reportDate - Human-readable date string for the report.
 * @param meta.reportId - Short UUID used as the report identifier.
 * @param meta.caseNumber - Optional case number from intake.
 * @param meta.courtDate - Optional next court date from intake.
 * @param meta.daysSinceArrest - Optional computed days since arrest date.
 * @returns A complete HTML document string (DOCTYPE through closing </html>).
 */
export function renderReportHtml(markdown: string, meta: {
  firstName: string;
  charges: string;
  jurisdiction: string;
  reportDate: string;
  reportId: string;
  caseNumber?: string;
  courtDate?: string;
  daysSinceArrest?: number | null;
}): string {
  // Simple markdown → HTML conversion for report sections
  let html = markdown
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 style="color: #F59E0B; font-size: 14px; margin-top: 20px;">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="color: white; font-size: 16px; margin-top: 24px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color: #F59E0B; font-size: 20px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272A;">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: white;">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blockquotes — strip empty continuation lines first, then convert content lines
    .replace(/^>\s*$/gm, '')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0; color: #A1A1AA;">$1</blockquote>')
    // Checkboxes (must come before unordered lists)
    .replace(/^- \[x\] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9745; $1</li>')
    .replace(/^- \[ \] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9744; $1</li>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    // Tables (simple conversion)
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return ""; // separator row
      const isHeader = cells.some((c) => c.startsWith("**") || c === "#");
      const tag = isHeader ? "th" : "td";
      const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
      return `<tr>${cells.map((c) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`;
    })
    // Paragraphs (lines not already converted)
    .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p style="margin: 8px 0; line-height: 1.6;">$1</p>');

  // Wrap tables in overflow container with data-label attributes for mobile
  html = html.replace(/(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
    (tableMatch: string) => {
      const rows = tableMatch.split('</tr>').filter((r: string) => r.trim());
      // Extract header labels from first row
      const headerLabels: string[] = [];
      const headerMatch = rows[0]?.match(/<t[hd][^>]*>(.*?)<\/t[hd]>/g);
      if (headerMatch) {
        for (const h of headerMatch) {
          const label = h.replace(/<[^>]+>/g, '').replace(/\*\*/g, '').trim();
          headerLabels.push(label);
        }
      }
      // Add data-label to td cells
      const processedRows = rows.map((r: string, i: number) => {
        if (!r.trim()) return '';
        let row = r.trim();
        if (i > 0 && headerLabels.length > 0) {
          let cellIdx = 0;
          row = row.replace(/(<td[^>]*style="[^"]*")>/g, (_m: string, prefix: string) => {
            const label = headerLabels[cellIdx] || '';
            cellIdx++;
            return `${prefix} data-label="${label}">`;
          });
        }
        return row + '</tr>';
      }).filter(Boolean);
      return '<div style="overflow-x: auto; -webkit-overflow-scrolling: touch;"><table style="width: 100%; border-collapse: collapse; margin: 16px 0;">' + processedRows.join('\n') + '</table></div>';
    });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Case Decoder Report — ${meta.firstName}</title>
<style>
  @media (max-width: 640px) {
    body > div { padding: 16px 12px !important; }
    .header-block { padding: 20px !important; }
    h1 { font-size: 22px !important; }
    h2 { font-size: 17px !important; margin-top: 24px !important; padding-top: 16px !important; }
    h3 { font-size: 15px !important; }
    blockquote { padding: 8px 12px !important; }
    table th, table td { padding: 6px 8px !important; font-size: 13px !important; }
    a[style*="padding: 16px 32px"] { padding: 14px 24px !important; min-height: 44px !important; }
  }
  @media (max-width: 480px) {
    p { font-size: 15px !important; }
    h1 { font-size: 20px !important; }
    h2 { font-size: 16px !important; }
    h3 { font-size: 14px !important; }
    .header-block { padding: 16px !important; }
    table thead { display: none !important; }
    table tr { display: block !important; margin-bottom: 12px !important; border: 1px solid #27272A !important; border-radius: 6px !important; overflow: hidden !important; }
    table td { display: block !important; padding: 6px 12px !important; border: none !important; border-bottom: 1px solid #27272A !important; font-size: 14px !important; }
    table td:before { content: attr(data-label); display: block; font-size: 11px; color: #F59E0B; font-weight: bold; margin-bottom: 2px; }
    table td:last-child { border-bottom: none !important; }
    blockquote { padding: 8px 10px !important; margin: 12px 0 !important; font-size: 14px !important; }
    a[style*="padding: 16px 32px"] { display: block !important; width: 100% !important; text-align: center !important; min-height: 48px !important; line-height: 48px !important; padding: 0 16px !important; box-sizing: border-box !important; }
  }
  @media print {
    body { background: white !important; color: #1a1a1a !important; }
    * { color: #1a1a1a !important; }
    h2, h3, h4 { color: #92400e !important; }
    strong { color: #1a1a1a !important; }
    blockquote { border-left-color: #92400e !important; }
    table, th, td { border-color: #d4d4d4 !important; }
    .no-print { display: none !important; }
    .header-block { background: #f5f5f4 !important; border-color: #92400e !important; }
    a { color: #92400e !important; }
  }
</style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0C0A09; color: #D4D4D8; margin: 0; padding: 0;">
<div style="max-width: 800px; margin: 0 auto; padding: 32px 24px;">

  <!-- Header -->
  <div class="header-block" style="background: #1C1917; padding: 32px; border-radius: 12px; border: 2px solid #F59E0B; margin-bottom: 32px; text-align: center;">
    <h1 style="color: #F59E0B; font-size: 28px; margin: 0;">CASE DECODER REPORT</h1>
    <p style="color: #A1A1AA; margin: 8px 0 0; font-size: 14px;">ImNotAnAttorney | We Research. You Ask.</p>
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

  <!-- Report Content -->
  ${html}

  <!-- A note on what this is -->
  <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 40px; border-left: 4px solid #A1A1AA;">
    <p style="margin: 0; font-size: 13px; color: #71717A;">
      <strong style="color: #A1A1AA;">A note on what this is:</strong> This report gives you legal information, context, and questions — not legal advice. We can't tell you what to do. What we can do is make sure you walk into your next conversation informed, prepared, and asking the right things. Your attorney has your case file, your courtroom, and your judge. This report makes sure you know what to ask them — and why it matters.
    </p>
  </div>

  <!-- Footer -->
  <div style="margin-top: 48px; padding-top: 24px; border-top: 2px solid #27272A; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #71717A;">&copy; ${new Date().getFullYear()} ImNotAnAttorney. Legal information, not legal advice.</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #52525B;">Report ID: ${meta.reportId} | Generated: ${meta.reportDate}</p>
  </div>

  <!-- Upgrade CTA (hidden in print) -->
  <div class="no-print" style="margin-top: 32px; text-align: center;">
    <a href="${SITE_URL}/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">
      Upgrade — 100% Credit Applied
    </a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is credited toward any higher tier within 12 months.</p>
  </div>

</div>
</body>
</html>`;
}
