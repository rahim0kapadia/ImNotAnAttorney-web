/**
 * @file src/lib/judge-report-card/render.ts
 *
 * Standalone HTML renderer for the Judge Report Card $197 SKU.
 *
 * Converts JudgeReportCardStandaloneData → dark-mode HTML string.
 * No Claude API — pure data rendering.
 *
 * UPL NOTE: This report provides factual sentencing and caseload data
 * for informational purposes only. It does not constitute legal advice.
 */

import type { JudgeReportCardStandaloneData } from "./query";

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMonths(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)} mo`;
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US");
}

function sectionHeader(title: string): string {
  return `<h2 style="color:#F59E0B;font-size:1.1rem;font-weight:700;margin:2rem 0 0.75rem;border-bottom:1px solid #374151;padding-bottom:0.4rem;">${escapeHtml(title)}</h2>`;
}

function tableRow(cells: string[], header = false): string {
  const tag = header ? "th" : "td";
  const style = header
    ? "padding:0.4rem 0.75rem;text-align:left;font-weight:600;color:#9CA3AF;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #374151;"
    : "padding:0.4rem 0.75rem;text-align:left;color:#E5E7EB;font-size:0.85rem;border-bottom:1px solid #1F2937;";
  return `<tr>${cells.map((c) => `<${tag} style="${style}">${c}</${tag}>`).join("")}</tr>`;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return `<p style="color:#6B7280;font-size:0.85rem;font-style:italic;">No data available.</p>`;
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:1rem;">
    <thead>${tableRow(headers, true)}</thead>
    <tbody>${rows.map((r) => tableRow(r)).join("")}</tbody>
  </table>`;
}

function wrapReport(judgeFullName: string, state: string, generatedAt: string, body: string): string {
  const dateStr = new Date(generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Judge Report Card — ${escapeHtml(judgeFullName)}</title>
  <style>
    body{background:#0A0A0A;color:#E5E7EB;font-family:'Lato',sans-serif;margin:0;padding:0;}
    *{box-sizing:border-box;}
    a{color:#F59E0B;text-decoration:none;}
  </style>
</head>
<body>
  <div style="max-width:820px;margin:0 auto;padding:2rem 1.5rem;">
    <div style="margin-bottom:2rem;">
      <p style="color:#6B7280;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 0.25rem;">ImNotAnAttorney — Judge Intelligence</p>
      <h1 style="color:#F59E0B;font-family:'Playfair Display',serif;font-size:1.8rem;margin:0 0 0.25rem;">${escapeHtml(judgeFullName)}</h1>
      <p style="color:#9CA3AF;font-size:0.85rem;margin:0;">${escapeHtml(state)} &bull; Generated ${dateStr}</p>
    </div>
    <blockquote style="border-left:3px solid #F59E0B;margin:0 0 2rem;padding:0.75rem 1rem;background:#111827;border-radius:0 4px 4px 0;">
      <p style="color:#D1D5DB;font-size:0.85rem;margin:0;line-height:1.5;">
        <strong style="color:#F59E0B;">Informational Use Only.</strong>
        This report provides factual court data for informational purposes only.
        It does not constitute legal advice. Consult a licensed attorney for guidance on your specific case.
      </p>
    </blockquote>
    ${body}
    <div style="margin-top:3rem;padding-top:1rem;border-top:1px solid #374151;">
      <p style="color:#6B7280;font-size:0.75rem;text-align:center;">
        ImNotAnAttorney &bull; Know What They Know &bull; <a href="https://imnotanattorney.com">imnotanattorney.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderJudgeReportCardStandalone(
  data: JudgeReportCardStandaloneData
): string {
  if (data.isEmpty) {
    return wrapReport(
      data.meta.judgeFullName,
      data.meta.state,
      data.meta.generatedAt,
      `<div style="background:#111827;border:1px solid #374151;border-radius:6px;padding:2rem;text-align:center;">
        <p style="color:#9CA3AF;font-size:1rem;">No federal sentencing or caseload data found for this judge in our database.</p>
        <p style="color:#6B7280;font-size:0.85rem;margin-top:0.5rem;">This typically means the judge operates exclusively in state court. Federal data is required for this report.</p>
      </div>`
    );
  }

  const sections: string[] = [];

  // ── Section 1: Bench Fingerprint (USSC) ──────────────────────────────────
  const ussc = data.benchFingerprint.ussc;
  if (ussc.total_cases > 0) {
    sections.push(sectionHeader("Federal Sentencing Fingerprint (USSC Data)"));
    sections.push(
      table(
        ["Metric", "Value"],
        [
          ["Total USSC Cases", fmtNum(ussc.total_cases)],
          ["Median Sentence", fmtMonths(ussc.median_sentence_months)],
          ["P25 Sentence", fmtMonths(ussc.p25_sentence_months)],
          ["P75 Sentence", fmtMonths(ussc.p75_sentence_months)],
          ["Mean Sentence", fmtMonths(ussc.mean_sentence_months)],
          ["Downward Departure Rate", fmtPct(ussc.downward_departure_rate)],
          ["Upward Departure Rate", fmtPct(ussc.upward_departure_rate)],
          ["Substantial Assistance Rate", fmtPct(ussc.substantial_assistance_rate)],
          ["Gov't-Sponsored Below-Range Rate", fmtPct(ussc.government_sponsored_below_range_rate)],
        ]
      )
    );

    // Offense breakdown
    if (data.benchFingerprint.breakdowns.offense) {
      const offenseRows = Object.entries(data.benchFingerprint.breakdowns.offense)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([offense, count]) => [escapeHtml(offense), fmtNum(count)]);
      if (offenseRows.length > 0) {
        sections.push(sectionHeader("Top Offense Categories"));
        sections.push(table(["Offense", "Cases"], offenseRows));
      }
    }
  }

  // ── Section 2: Docket Caseload ────────────────────────────────────────────
  if (data.docketCaseload) {
    const dc = data.docketCaseload;
    sections.push(sectionHeader("Federal Docket Caseload"));
    sections.push(
      table(
        ["Metric", "Value"],
        [
          ["Total Dockets", fmtNum(dc.total_docket_count)],
          ["Criminal Case Fraction", fmtPct(dc.criminal_fraction)],
          ["Jury Demand Fraction", fmtPct(dc.jury_demand_fraction)],
          ["District", escapeHtml(dc.district) || "—"],
        ]
      )
    );
  }

  const bf = data.benchFingerprint;
  if (bf.caseload.earliest_docket || bf.caseload.latest_docket || bf.caseload.federal_docket_count) {
    sections.push(sectionHeader("Federal Docket History"));
    sections.push(
      table(
        ["Metric", "Value"],
        [
          ["Federal Docket Count", fmtNum(bf.caseload.federal_docket_count)],
          ["Earliest Docket", escapeHtml(bf.caseload.earliest_docket) || "—"],
          ["Latest Docket", escapeHtml(bf.caseload.latest_docket) || "—"],
        ]
      )
    );
  }

  // ── Section 3: Motion Outcome Rates ──────────────────────────────────────
  if (data.motionOutcomeRates.length > 0) {
    sections.push(sectionHeader("Motion Outcome Rates"));
    sections.push(
      table(
        ["Motion Type", "Grant Rate", "Sample Size"],
        data.motionOutcomeRates.map((m) => [
          escapeHtml(m.motion_type),
          fmtPct(m.grant_rate),
          fmtNum(m.sample_size),
        ])
      )
    );
  }

  // ── Section 4: Civil Party Conflicts ─────────────────────────────────────
  if (data.civilPartyConflicts.length > 0) {
    sections.push(sectionHeader("Financial Disclosure / Recusal Flags"));
    sections.push(
      table(
        ["Party", "Conflict Type", "Year", "Source"],
        data.civilPartyConflicts.map((c) => [
          escapeHtml(c.party_name),
          escapeHtml(c.conflict_type) || "—",
          c.disclosure_year ? String(c.disclosure_year) : "—",
          c.source_url
            ? `<a href="${escapeHtml(c.source_url)}" style="color:#F59E0B;">View</a>`
            : "—",
        ])
      )
    );
  }

  // ── Section 5: Judge Quotes ───────────────────────────────────────────────
  if (data.quotes.length > 0) {
    sections.push(sectionHeader("Notable Quotes from the Bench"));
    sections.push(
      data.quotes
        .map(
          (q) =>
            `<blockquote style="border-left:3px solid #374151;margin:0 0 1rem;padding:0.75rem 1rem;background:#111827;border-radius:0 4px 4px 0;">
              <p style="color:#E5E7EB;font-size:0.9rem;font-style:italic;margin:0 0 0.5rem;">"${escapeHtml(q.quote)}"</p>
              <footer style="color:#9CA3AF;font-size:0.75rem;">
                ${q.topic ? `<span style="color:#F59E0B;">${escapeHtml(q.topic)}</span>` : ""}
                ${q.case_cited ? ` — <em>${escapeHtml(q.case_cited)}</em>` : ""}
              </footer>
            </blockquote>`
        )
        .join("")
    );
  }

  // ── Section 6: Questions Your Attorney Should Answer ─────────────────────
  const questions: string[] = [];

  if (ussc.downward_departure_rate != null && ussc.downward_departure_rate < 0.1) {
    questions.push(
      "This judge grants downward departures at a below-average rate. Ask your attorney: What specific factors in my case justify requesting a variance from the guidelines?"
    );
  }
  if (ussc.downward_departure_rate != null && ussc.downward_departure_rate >= 0.2) {
    questions.push(
      "This judge has a relatively high downward departure rate. Ask your attorney: Are we positioning for a downward departure, and what supporting materials would strengthen that request?"
    );
  }
  if (data.docketCaseload?.criminal_fraction != null && data.docketCaseload.criminal_fraction > 0.5) {
    questions.push(
      "More than half of this judge's docket is criminal cases. Ask your attorney: What patterns has the judge shown in similar criminal proceedings, and how should we prepare differently?"
    );
  }
  if (data.civilPartyConflicts.length > 0) {
    questions.push(
      `This judge has ${data.civilPartyConflicts.length} financial disclosure entries. Ask your attorney: Are any of these entities connected to our case, and should we research recusal grounds?`
    );
  }
  if (data.motionOutcomeRates.length > 0) {
    const lowGrantMotions = data.motionOutcomeRates.filter(
      (m) => m.grant_rate != null && m.grant_rate < 0.2
    );
    if (lowGrantMotions.length > 0) {
      questions.push(
        `This judge grants ${lowGrantMotions[0].motion_type} motions at a low rate (${fmtPct(lowGrantMotions[0].grant_rate)}). Ask your attorney: Should we expect that motion to be difficult, and what's our strategy if it's denied?`
      );
    }
  }
  if (ussc.total_cases > 0 && ussc.median_sentence_months != null) {
    questions.push(
      `The median sentence before this judge is ${fmtMonths(ussc.median_sentence_months)}. Ask your attorney: How does our expected sentencing range compare to this judge's patterns, and what factors could move us above or below?`
    );
  }

  if (questions.length > 0) {
    sections.push(sectionHeader("Questions Your Attorney Should Answer"));
    sections.push(
      `<ul style="padding-left:1.25rem;margin:0;">${questions
        .map(
          (q) =>
            `<li style="color:#D1D5DB;font-size:0.875rem;line-height:1.6;margin-bottom:0.75rem;">${escapeHtml(q)}</li>`
        )
        .join("")}</ul>`
    );
  }

  return wrapReport(
    data.meta.judgeFullName,
    data.meta.state,
    data.meta.generatedAt,
    sections.join("\n")
  );
}
