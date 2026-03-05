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
 */
function markdownToHtml(markdown: string): string {
  let html = markdown
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
    .replace(/\|(.+)\|/g, (match: string) => {
      const cells = match.split("|").filter(Boolean).map((c: string) => c.trim());
      if (cells.every((c: string) => /^[-:]+$/.test(c))) return "";
      const isHeader = cells.some((c: string) => c.startsWith("**") || c === "#");
      const tag = isHeader ? "th" : "td";
      const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
      return `<tr>${cells.map((c: string) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`;
    })
    .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p style="margin: 8px 0; line-height: 1.6;">$1</p>');

  // Wrap consecutive table rows in <table> tags
  html = html.replace(
    /(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
    '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">$1</table>'
  );

  return html;
}

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
    .join("\n<div style=\"page-break-after: always;\"></div>\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Case Intelligence Brief — ${escapeHtml(meta.firstName)}</title>
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
    <h1 style="color: #F59E0B; font-size: 28px; margin: 0;">CASE INTELLIGENCE BRIEF</h1>
    <p style="color: #A1A1AA; margin: 8px 0 0; font-size: 14px;">ImNotAnAttorney | We Research. You Ask.</p>
    <div style="margin-top: 24px; text-align: left;">
      <p style="margin: 4px 0;"><strong style="color: white;">Prepared for:</strong> ${escapeHtml(meta.firstName)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Charge(s):</strong> ${escapeHtml(meta.charges)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Jurisdiction:</strong> ${escapeHtml(meta.stateCounty)}</p>
      ${meta.caseNumber !== "Not provided" ? `<p style="margin: 4px 0;"><strong style="color: white;">Case Number:</strong> ${escapeHtml(meta.caseNumber)}</p>` : ""}
      ${meta.nextCourtDate !== "Not provided" ? `<p style="margin: 4px 0;"><strong style="color: white;">Next Court Date:</strong> ${escapeHtml(meta.nextCourtDate)}</p>` : ""}
      <p style="margin: 4px 0;"><strong style="color: white;">Judge:</strong> ${escapeHtml(meta.judgeName)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Attorney:</strong> ${escapeHtml(meta.attorneyName)}</p>
      ${meta.monthsSinceArrest !== "Unknown" ? `<p style="margin: 4px 0;"><strong style="color: white;">Months Since Arrest:</strong> ${escapeHtml(meta.monthsSinceArrest)}</p>` : ""}
      <p style="margin: 4px 0;"><strong style="color: white;">Report Date:</strong> ${escapeHtml(meta.reportDate)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Report ID:</strong> ${escapeHtml(meta.reportId)}</p>
    </div>
  </div>
  ${bodyHtml}
  <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 40px; border-left: 4px solid #A1A1AA;">
    <p style="margin: 0; font-size: 13px; color: #71717A;">
      <strong style="color: #A1A1AA;">Important:</strong> This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.
    </p>
  </div>
  <div style="margin-top: 48px; padding-top: 24px; border-top: 2px solid #27272A; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #71717A;">&copy; ${new Date().getFullYear()} ImNotAnAttorney. Legal information, not legal advice.</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #52525B;">Report ID: ${escapeHtml(meta.reportId)} | Generated: ${escapeHtml(meta.reportDate)}</p>
  </div>
  <div class="no-print" style="margin-top: 32px; text-align: center;">
    <p style="margin: 0 0 12px; font-size: 14px; color: #A1A1AA;">When you get discovery evidence, we can go even deeper:</p>
    <a href="/checkout?tier=x-ray" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">The X-Ray — ${meta.xrayPriceDisplay || "$2,497"} (${meta.xrayUpgradeCost || "$1,500"} after credit)</a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your ${meta.ibPriceDisplay || "$997"} is fully credited toward any tier within 12 months.</p>
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
- **Section 2: What's Working + What Needs Attention** — Attorney Accountability Score, decoded statements, gaps to clarify
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
- You have the right to fire your attorney and hire a new one (though timing matters)

### If You Feel Your Rights Are Being Violated:
- Document everything in writing (dates, times, what was said)
- Follow the Advocacy Steps in Section 6j of this brief
- Contact your state bar association's client protection hotline`;
}
