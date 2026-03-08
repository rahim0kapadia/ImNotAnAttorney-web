/**
 * @file HTML renderer for Intelligence Brief reports.
 *
 * Assembles all generated sections + static appendices into a complete
 * dark-theme HTML document. Uses the same regex-based markdown→HTML
 * conversion as the Case Decoder (ported from the Edge Function).
 *
 * Design: dependency-free for Deno Edge Function compatibility.
 */

// ============================================================
// MARKDOWN → HTML CONVERSION
// ============================================================

/** Escape HTML special characters to prevent XSS */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Convert markdown text to styled HTML.
 * Same regex-based approach as the Edge Function's renderReportHtml().
 * Uses CSS classes (defined in the <style> block) instead of inline styles.
 */
function markdownToHtml(markdown: string): string {
  let html = markdown
    .replace(/^#### (.+)$/gm, '<h4 class="section-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="section-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="section-h2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="bold-text">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^> (.+)$/gm, '<blockquote class="blockquote">$1</blockquote>')
    .replace(/^- \[x\] (.+)$/gm, '<li class="list-item checkbox-item">&#9745; $1</li>')
    .replace(/^- \[ \] (.+)$/gm, '<li class="list-item checkbox-item">&#9744; $1</li>')
    .replace(/^- (.+)$/gm, '<li class="list-item">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="list-item">$1</li>')
    .replace(/\|(.+)\|/g, (match: string) => {
      const cells = match.split("|").filter(Boolean).map((c: string) => c.trim());
      if (cells.every((c: string) => /^[-:]+$/.test(c))) return "";
      const isHeader = cells.some((c: string) => c.startsWith("**") || c === "#");
      const tag = isHeader ? "th" : "td";
      const cls = isHeader ? "table-header" : "table-cell";
      return `<tr>${cells.map((c: string) => `<${tag} class="${cls}">${c}</${tag}>`).join("")}</tr>`;
    })
    .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p class="body-text">$1</p>');

  // Wrap consecutive table rows in <table> tags
  html = html.replace(
    /(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
    '<table class="report-table">$1</table>'
  );

  return html;
}

// ============================================================
// CSS STYLES
// ============================================================

const REPORT_STYLES = `
/* === Base === */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0C0A09;
  color: #D4D4D8;
  margin: 0;
  padding: 0;
}
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 24px;
}

/* === Header === */
.header-block {
  background: #1C1917;
  padding: 32px;
  border-radius: 12px;
  border: 2px solid #F59E0B;
  margin-bottom: 32px;
  text-align: center;
}
.header-title {
  color: #F59E0B;
  font-size: 28px;
  margin: 0;
}
.header-subtitle {
  color: #A1A1AA;
  margin: 8px 0 0;
  font-size: 14px;
}
.header-meta {
  margin-top: 24px;
  text-align: left;
}
.meta-field {
  margin: 4px 0;
}
.meta-label {
  color: white;
}

/* === Content typography === */
.section-h2 {
  color: #F59E0B;
  font-size: 20px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #3f3f46;
}
.section-h3 {
  color: white;
  font-size: 17px;
  margin-top: 24px;
  letter-spacing: 0.02em;
}
.section-h4 {
  color: #F59E0B;
  font-size: 14px;
  margin-top: 20px;
}
.bold-text {
  color: white;
}
.body-text {
  margin: 8px 0;
  line-height: 1.6;
}

/* === Tables === */
.report-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}
.table-header {
  padding: 8px 12px;
  border: 1px solid #3f3f46;
  border-bottom: 2px solid #3f3f46;
  text-align: left;
  background: #1a1a1e;
  font-weight: bold;
  overflow-wrap: break-word;
}
.table-cell {
  padding: 8px 12px;
  border: 1px solid #3f3f46;
  text-align: left;
  overflow-wrap: break-word;
}
tr:nth-child(even) > .table-cell {
  background: rgba(255, 255, 255, 0.03);
}

/* === Blockquotes === */
.blockquote {
  border-left: 4px solid #F59E0B;
  padding: 12px 16px;
  margin: 16px 0;
  color: #A1A1AA;
  background: rgba(245, 158, 11, 0.05);
  border-radius: 0 4px 4px 0;
}

/* === Lists === */
.list-item {
  margin-bottom: 6px;
  margin-left: 24px;
}
.checkbox-item {
  list-style: none;
}

/* === Footer === */
.footer-disclaimer {
  background: #1C1917;
  padding: 16px;
  border-radius: 8px;
  margin-top: 40px;
  border-left: 4px solid #A1A1AA;
}
.footer-disclaimer-text {
  margin: 0;
  font-size: 13px;
  color: #71717A;
}
.footer-disclaimer-label {
  color: #A1A1AA;
}
.copyright-block {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 2px solid #27272A;
  text-align: center;
}
.copyright-text {
  margin: 0;
  font-size: 12px;
  color: #71717A;
}
.copyright-meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: #52525B;
}

/* === Upgrade CTA === */
.upgrade-cta {
  margin-top: 32px;
  text-align: center;
}
.upgrade-cta-text {
  margin: 0 0 12px;
  font-size: 14px;
  color: #A1A1AA;
}
.upgrade-btn {
  display: inline-block;
  padding: 16px 32px;
  background: #F59E0B;
  color: black;
  font-weight: bold;
  text-decoration: none;
  border-radius: 8px;
  font-size: 16px;
}
.upgrade-credit-note {
  margin-top: 12px;
  font-size: 13px;
  color: #71717A;
}

/* === Page breaks === */
.page-break {
  page-break-after: always;
}

/* === Mobile responsive === */
@media (max-width: 640px) {
  .container { padding: 16px 12px; }
  .header-block { padding: 20px; }
  .header-title { font-size: 22px; }
  .section-h2 { font-size: 17px; margin-top: 24px; padding-top: 16px; }
  .section-h3 { font-size: 15px; }
  .report-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .table-header, .table-cell { padding: 6px 8px; font-size: 13px; }
  .upgrade-btn { padding: 14px 24px; font-size: 15px; }
}

/* === Print === */
@media print {
  body { background: white !important; color: #1a1a1a !important; }
  * { color: #1a1a1a !important; }
  .section-h2, .section-h3, .section-h4 { color: #92400e !important; page-break-after: avoid; }
  .bold-text, .meta-label { color: #1a1a1a !important; }
  .blockquote { border-left-color: #92400e !important; background: #f5f5f4 !important; page-break-inside: avoid; }
  .report-table { page-break-inside: avoid; }
  .table-header, .table-cell { border-color: #d4d4d4 !important; }
  .table-header { background: #e5e5e5 !important; }
  .no-print { display: none !important; }
  .header-block { background: #f5f5f4 !important; border-color: #92400e !important; }
  a { color: #92400e !important; }
  .body-text { orphans: 3; widows: 3; }
  @page { margin: 1in; }
}
`;

// ============================================================
// REPORT ASSEMBLY
// ============================================================

export interface IBReportMeta {
  firstName: string;
  charges: string;
  stateCounty: string;
  caseNumber: string;
  nextCourtDate: string;
  judgeName: string;
  attorneyName: string;
  reportDate: string;
  reportId: string;
  monthsSinceArrest: string;
  /** IB price display. Defaults for backward compat. */
  ibPriceDisplay?: string;
  /** X-Ray price display. */
  xrayPriceDisplay?: string;
  /** X-Ray upgrade cost after IB credit. */
  xrayUpgradeCost?: string;
}

/**
 * Render a complete Intelligence Brief HTML document from section outputs.
 *
 * @param sectionOutputs - Map of section key → markdown content
 * @param meta - Report metadata for the header
 * @returns Complete HTML document string
 */
export function renderIntelligenceBriefHtml(
  sectionOutputs: Record<string, string>,
  meta: IBReportMeta
): string {
  // Assemble sections in report order
  const sections = [
    // Page 2: 48-Hour Priority List (before everything)
    sectionOutputs["48hr-priorities"] || "",
    // Table of Contents (static)
    buildTableOfContents(),
    // Section 1: Case Roadmap
    sectionOutputs["case-roadmap"] || "",
    // Section 2: What's Working
    sectionOutputs["whats-working"] || "",
    // Section 3: Case Intelligence
    sectionOutputs["case-intelligence"] || "",
    // Section 4: Legal Options & Deadlines
    sectionOutputs["legal-options"] || "",
    // Section 5: Protecting Your Case and Life
    sectionOutputs["protection"] || "",
    // Section 6: Your Plan
    sectionOutputs["your-plan"] || "",
    // Appendix A: Brady/Giglio Checklist (static)
    buildBradyGiglioChecklist(),
    // Appendix B: Court Prep
    sectionOutputs["court-prep"] || "",
    // Appendix C: Your Rights (static)
    buildYourRights(meta.stateCounty.split(",")[0]?.trim() || "your state"),
    // Appendix D: Questions
    sectionOutputs["questions"] || "",
  ];

  const bodyHtml = sections
    .filter((s) => s.trim().length > 0)
    .map((s) => markdownToHtml(s))
    .join('\n<div class="page-break"></div>\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Case Intelligence Brief — ${escapeHtml(meta.firstName)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<div class="container">
  <div class="header-block">
    <h1 class="header-title">CASE INTELLIGENCE BRIEF</h1>
    <p class="header-subtitle">ImNotAnAttorney | We Research. You Ask.</p>
    <div class="header-meta">
      <p class="meta-field"><strong class="meta-label">Prepared for:</strong> ${escapeHtml(meta.firstName)}</p>
      <p class="meta-field"><strong class="meta-label">Charge(s):</strong> ${escapeHtml(meta.charges)}</p>
      <p class="meta-field"><strong class="meta-label">Jurisdiction:</strong> ${escapeHtml(meta.stateCounty)}</p>
      ${meta.caseNumber !== "Not provided" ? `<p class="meta-field"><strong class="meta-label">Case Number:</strong> ${escapeHtml(meta.caseNumber)}</p>` : ""}
      ${meta.nextCourtDate !== "Not provided" ? `<p class="meta-field"><strong class="meta-label">Next Court Date:</strong> ${escapeHtml(meta.nextCourtDate)}</p>` : ""}
      <p class="meta-field"><strong class="meta-label">Judge:</strong> ${escapeHtml(meta.judgeName)}</p>
      <p class="meta-field"><strong class="meta-label">Attorney:</strong> ${escapeHtml(meta.attorneyName)}</p>
      ${meta.monthsSinceArrest !== "Unknown" ? `<p class="meta-field"><strong class="meta-label">Months Since Arrest:</strong> ${escapeHtml(meta.monthsSinceArrest)}</p>` : ""}
      <p class="meta-field"><strong class="meta-label">Report Date:</strong> ${escapeHtml(meta.reportDate)}</p>
      <p class="meta-field"><strong class="meta-label">Report ID:</strong> ${escapeHtml(meta.reportId)}</p>
    </div>
  </div>
  ${bodyHtml}
  <div class="footer-disclaimer">
    <p class="footer-disclaimer-text">
      <strong class="footer-disclaimer-label">Important:</strong> This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.
    </p>
  </div>
  <div class="copyright-block">
    <p class="copyright-text">&copy; ${new Date().getFullYear()} ImNotAnAttorney. Legal information, not legal advice.</p>
    <p class="copyright-meta">Report ID: ${escapeHtml(meta.reportId)} | Generated: ${escapeHtml(meta.reportDate)}</p>
  </div>
  <div class="no-print upgrade-cta">
    <p class="upgrade-cta-text">When you get discovery evidence, we can go even deeper:</p>
    <a href="/checkout?tier=x-ray" class="upgrade-btn">The X-Ray — ${meta.xrayPriceDisplay || "$2,497"} (${meta.xrayUpgradeCost || "$1,500"} after credit)</a>
    <p class="upgrade-credit-note">Your ${meta.ibPriceDisplay || "$997"} is fully credited toward any tier within 12 months.</p>
  </div>
</div>
</body>
</html>`;
}

// ============================================================
// STATIC APPENDICES
// ============================================================

function buildTableOfContents(): string {
  return `## Table of Contents

- **START HERE: Your 48-Hour Priority List** — 3 actions for the next 48 hours
- **Section 1: Your Case Roadmap** — Where you are, what happens next, the two paths
- **Section 2: What's Working + What Needs Attention** — Case Progress Score, decoded statements, gaps to clarify
- **Section 3: Your Case Intelligence** — Outcome map, defense theories, judge profile, prosecution preview
- **Section 4: Legal Options & Deadlines** — Motion landscape, deadline calendar, plea framework
- **Section 5: Protecting Your Case and Life** — Case protection, life impact map, pending-case management
- **Section 6: Your Plan** — Email template, phone script, 14-day plan, meeting prep, difficult conversations
- **Appendix A: Brady/Giglio Checklist** — Evidence the prosecution must disclose
- **Appendix B: Next Court Date Prep** — What to expect, wear, bring, and do
- **Appendix C: Your Rights** — Key rights during criminal proceedings
- **Appendix D: Questions for Your Attorney** — 10-15 targeted, gap-based questions`;
}

function buildBradyGiglioChecklist(): string {
  return `## Appendix A: Brady/Giglio Checklist

**What This Is:** Under *Brady v. Maryland* (1963) and *Giglio v. United States* (1972), the prosecution is constitutionally required to disclose evidence that is favorable to the defense. This includes exculpatory evidence (Brady) and impeachment evidence (Giglio).

**Ask your attorney:** "Have you received all Brady/Giglio material? Is there anything outstanding?"

### Evidence the Prosecution Must Disclose:

- [ ] Exculpatory evidence (anything suggesting innocence)
- [ ] Impeachment evidence (anything undermining prosecution witnesses)
- [ ] Prior inconsistent statements by witnesses
- [ ] Deals, promises, or inducements to witnesses
- [ ] Criminal records of prosecution witnesses
- [ ] Evidence of witness bias or motive to lie
- [ ] Lab reports, forensic analysis, chain of custody documentation
- [ ] Surveillance footage, body camera footage, dashcam footage
- [ ] 911 calls and dispatch records
- [ ] Prior complaints against arresting officers
- [ ] Internal affairs investigations of involved officers
- [ ] Evidence contradicting the prosecution's theory

### What to Ask Your Attorney:

1. "Have you filed a specific Brady demand or are you relying on the general obligation?"
2. "Is there a standing discovery order in this case?"
3. "Have you received all police reports, including supplemental reports?"
4. "Are there any witnesses the prosecution hasn't disclosed?"`;
}

function buildYourRights(state: string): string {
  return `## Appendix C: Your Rights During Criminal Proceedings

**These rights exist regardless of your charge, your attorney, or your county.**

### Constitutional Rights:
- **Right to remain silent** (5th Amendment) — You cannot be compelled to testify against yourself
- **Right to an attorney** (6th Amendment) — If you cannot afford one, one will be appointed
- **Right to a speedy trial** (6th Amendment) — Timelines vary by state and jurisdiction
- **Right to confront witnesses** (6th Amendment) — You can cross-examine anyone who testifies against you
- **Right against unreasonable search and seizure** (4th Amendment) — Evidence obtained illegally may be suppressed
- **Right to a jury trial** (6th Amendment) — For serious offenses, you have the right to be judged by a jury of your peers
- **Right to due process** (14th Amendment) — Fair procedures must be followed
- **Right against double jeopardy** (5th Amendment) — You cannot be tried twice for the same offense
- **Right to be presumed innocent** — The prosecution must prove guilt beyond a reasonable doubt

### Your Rights With Your Attorney:
- You have the right to know what is happening in your case at all times
- You have the right to be consulted before major decisions are made
- You have the right to make the final decision on whether to accept a plea or go to trial
- You have the right to effective assistance of counsel (Strickland v. Washington)
- You have the right to change attorneys at any time (though timing and procedural requirements apply)

### If You Feel Your Rights Are Being Violated:
- Document everything in writing (dates, times, what was said)
- Follow the Advocacy Steps in Section 6 of this brief
- Contact your state bar association's client protection hotline`;
}
