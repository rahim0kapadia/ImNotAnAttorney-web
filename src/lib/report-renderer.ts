/**
 * Case Decoder report HTML renderer.
 * Extracted from generate-worker.mjs for shared use by cron batch poller.
 * Dark theme, print-friendly, branded layout.
 *
 * NOTE: Regex .replace() calls below operate on bounded AI-generated markdown
 * (single report, typically 2-5KB). This is NOT file I/O or unbounded input.
 * Matches the existing pattern in scripts/generate-worker.mjs lines 613-670.
 */

export interface ReportMeta {
  firstName: string;
  charges: string;
  jurisdiction: string;
  caseNumber: string;
  courtDate: string;
  daysSinceArrest: number | null;
  reportDate: string;
  reportId: string;
  chargeType: string;
  expertNames: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Converts markdown report content to branded HTML.
 * Input is bounded: single AI-generated report (2-5KB markdown).
 */
export function renderReportHtml(markdown: string, meta: ReportMeta): string {
  // Process markdown line-by-line to avoid regex on large strings
  const lines = markdown.split("\n");
  const processedLines: string[] = [];

  for (const line of lines) {
    let processed = line;

    // Headings (check in order: h4, h3, h2)
    const h4Match = processed.match(/^#### (.+)$/);
    if (h4Match) {
      processedLines.push(`<h4 style="color: #F59E0B; font-size: 14px; margin-top: 20px;">${h4Match[1]}</h4>`);
      continue;
    }
    const h3Match = processed.match(/^### (.+)$/);
    if (h3Match) {
      processedLines.push(`<h3 style="color: white; font-size: 16px; margin-top: 24px;">${h3Match[1]}</h3>`);
      continue;
    }
    const h2Match = processed.match(/^## (.+)$/);
    if (h2Match) {
      processedLines.push(`<h2 style="color: #F59E0B; font-size: 20px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272A;">${h2Match[1]}</h2>`);
      continue;
    }

    // Blockquote
    const bqMatch = processed.match(/^> (.+)$/);
    if (bqMatch) {
      processedLines.push(`<blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0; color: #A1A1AA;">${bqMatch[1]}</blockquote>`);
      continue;
    }

    // Checked checkbox
    const checkedMatch = processed.match(/^- \[x\] (.+)$/);
    if (checkedMatch) {
      processedLines.push(`<li style="margin-bottom: 4px; list-style: none;">&#9745; ${checkedMatch[1]}</li>`);
      continue;
    }

    // Unchecked checkbox
    const uncheckedMatch = processed.match(/^- \[ \] (.+)$/);
    if (uncheckedMatch) {
      processedLines.push(`<li style="margin-bottom: 4px; list-style: none;">&#9744; ${uncheckedMatch[1]}</li>`);
      continue;
    }

    // Unordered list
    const ulMatch = processed.match(/^- (.+)$/);
    if (ulMatch) {
      processedLines.push(`<li style="margin-bottom: 4px;">${ulMatch[1]}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = processed.match(/^\d+\. (.+)$/);
    if (olMatch) {
      processedLines.push(`<li style="margin-bottom: 4px;">${olMatch[1]}</li>`);
      continue;
    }

    // Table row
    if (processed.includes("|") && processed.startsWith("|")) {
      const cells = processed.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        processedLines.push(""); // separator row — skip
        continue;
      }
      const isHeader = cells.some((c) => c.startsWith("**") || c === "#");
      const tag = isHeader ? "th" : "td";
      const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
      processedLines.push(`<tr>${cells.map((c) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`);
      continue;
    }

    // Inline formatting: bold and italic (bounded per-line, safe)
    processed = processed.split("**").reduce((acc, part, i) => {
      if (i % 2 === 1) return acc + `<strong style="color: white;">${part}</strong>`;
      return acc + part;
    }, "");
    processed = processed.split("*").reduce((acc, part, i) => {
      if (i % 2 === 1) return acc + `<em>${part}</em>`;
      return acc + part;
    }, "");

    // Paragraph (non-empty, non-HTML lines)
    if (processed.trim() && !processed.trim().startsWith("<")) {
      processedLines.push(`<p style="margin: 8px 0; line-height: 1.6;">${processed}</p>`);
    } else {
      processedLines.push(processed);
    }
  }

  let html = processedLines.join("\n");

  // Wrap consecutive <tr> rows in <table> tags
  // This operates on the processed HTML which is bounded (single report)
  html = html.replace(
    /(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
    '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">$1</table>'
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
    .no-print { display: none !important; }
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
  <div class="no-print" style="margin-top: 32px; text-align: center;">
    <p style="margin: 0 0 12px; font-size: 14px; color: #A1A1AA;">After your meeting, if you want to verify your attorney's answers against the evidence:</p>
    <a href="/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Case Intelligence Brief — $997 ($800 after credit)</a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is fully credited toward any tier within 12 months. No pressure — decide after your meeting.</p>
  </div>
</div>
</body>
</html>`;
}
