/**
 * Tier 9 report HTML renderers — one function per SKU.
 * Produces self-contained HTML reports styled in the INAA dark theme.
 * Every data point includes source URL verification links.
 */

import { escapeHtml } from "@/lib/email";
import type {
  JudgeReportCardData,
  OfficerBackgroundData,
  SimilarCasesData,
} from "./query";

// ============================================================
// SHARED HELPERS
// ============================================================

const UPL_DISCLAIMER = `
  <div style="background: #1C1917; border: 1px solid #422006; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">Legal Information — Not Legal Advice</p>
    <p style="color: #A1A1AA; font-size: 13px; margin: 0;">
      This report provides verified court record data compiled into a structured format.
      It is legal INFORMATION, not legal ADVICE. Your attorney remains the final authority
      on strategy decisions. All data points are sourced from public court records with
      verification URLs provided.
    </p>
  </div>
`;

function sourceLink(url: string | null | undefined): string {
  if (!url) return "";
  return ` <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color: #60A5FA; font-size: 11px; text-decoration: none;">[source]</a>`;
}

function sourceLinks(urls: string[] | null | undefined): string {
  if (!urls || urls.length === 0) return "";
  return urls
    .slice(0, 3)
    .map(
      (url, i) =>
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color: #60A5FA; font-size: 11px; text-decoration: none;">[${i + 1}]</a>`
    )
    .join(" ");
}

function countSources(...arrays: (string[] | null | undefined)[]): number {
  let count = 0;
  for (const arr of arrays) {
    if (arr) count += arr.length;
  }
  return count;
}

function wrapReport(title: string, body: string, sourceCount: number): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #0C0A09; color: #D4D4D8; padding: 32px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <p style="color: #F59E0B; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 8px;">ImNotAnAttorney</p>
        <h1 style="color: #FAFAF9; font-size: 28px; margin: 0 0 4px;">${escapeHtml(title)}</h1>
        <p style="color: #71717A; font-size: 13px; margin: 0;">Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
      </div>
      ${UPL_DISCLAIMER}
      ${body}
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #27272A; text-align: center;">
        <p style="color: #71717A; font-size: 12px; margin: 0 0 4px;">
          Data Verification: ${sourceCount} source URL${sourceCount !== 1 ? "s" : ""} linked in this report
        </p>
        <p style="color: #52525B; font-size: 11px; margin: 0;">
          All data sourced from verified public court records via CourtListener and official court databases.
        </p>
      </div>
    </div>
  `;
}

function sectionHeader(title: string): string {
  return `<h2 style="color: #F59E0B; font-size: 20px; margin: 32px 0 16px; border-bottom: 1px solid #27272A; padding-bottom: 8px;">${escapeHtml(title)}</h2>`;
}

function noDataMessage(subject: string): string {
  return `<p style="color: #A1A1AA; font-style: italic;">No ${escapeHtml(subject)} data available in our database for this query.</p>`;
}

// ============================================================
// JUDGE REPORT CARD
// ============================================================

export function renderJudgeReportCard(data: JudgeReportCardData): string {
  const judge = data.judge;
  if (!judge) return "";

  let totalSources = 0;
  let body = "";

  // Judge Profile Summary
  body += sectionHeader("Judge Profile");
  body += `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr>
        <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Name</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; font-weight: bold;">${escapeHtml(judge.name)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Court</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${judge.court ? escapeHtml(judge.court) : "—"}</td>
      </tr>
      <tr>
        <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Jurisdiction</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${judge.jurisdiction ? escapeHtml(judge.jurisdiction) : "—"}</td>
      </tr>
      ${judge.bench_acquittal_rate != null ? `
      <tr>
        <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Overall Bench Acquittal Rate</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${Number(judge.bench_acquittal_rate).toFixed(1)}%</td>
      </tr>` : ""}
      ${judge.jury_acquittal_rate != null ? `
      <tr>
        <td style="padding: 8px 16px; color: #A1A1AA;">Overall Jury Acquittal Rate</td>
        <td style="padding: 8px 16px; color: #FAFAF9;">${Number(judge.jury_acquittal_rate).toFixed(1)}%</td>
      </tr>` : ""}
    </table>
  `;

  // Sentencing Distributions
  body += sectionHeader("Sentencing Patterns");
  if (data.sentencingDistributions.length > 0) {
    body += `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1C1917;">
            <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Charge Type</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">25th %ile</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Median</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">75th %ile</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
            <th style="padding: 10px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Sources</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const row of data.sentencingDistributions) {
      totalSources += countSources(row.source_urls);
      body += `
          <tr style="border-bottom: 1px solid #1C1917;">
            <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(row.charge_slug)}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p25 != null ? `${Number(row.p25).toFixed(1)} mo` : "—"}</td>
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${row.median_months != null ? `${Number(row.median_months).toFixed(1)} mo` : "—"}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p75 != null ? `${Number(row.p75).toFixed(1)} mo` : "—"}</td>
            <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.sample_size}</td>
            <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
          </tr>
      `;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("sentencing distribution");
  }

  // Prosecutor Pairings
  body += sectionHeader("Prosecutor Pairing Analysis");
  if (data.prosecutorPairings.length > 0) {
    body += `
      <p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
        How this judge rules on motions filed against specific prosecutors.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1C1917;">
            <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Prosecutor</th>
            <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Motion Type</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Grant Rate</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
            <th style="padding: 10px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Sources</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const row of data.prosecutorPairings) {
      totalSources += countSources(row.source_urls);
      body += `
          <tr style="border-bottom: 1px solid #1C1917;">
            <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(row.prosecutor_name)}</td>
            <td style="padding: 8px 12px; color: #D4D4D8;">${row.motion_type ? escapeHtml(row.motion_type) : "All"}</td>
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${row.grant_rate != null ? `${Number(row.grant_rate).toFixed(1)}%` : "—"}</td>
            <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.sample_size}</td>
            <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
          </tr>
      `;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("prosecutor pairing");
  }

  // Bench vs Jury Divergence
  body += sectionHeader("Bench vs Jury Trial Divergence");
  if (data.benchJuryDivergence.length > 0) {
    body += `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1C1917;">
            <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Charge Type</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Bench Acquittal</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Jury Acquittal</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Bench Cases</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Jury Cases</th>
            <th style="padding: 10px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Sources</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const row of data.benchJuryDivergence) {
      totalSources += countSources(row.source_urls);
      body += `
          <tr style="border-bottom: 1px solid #1C1917;">
            <td style="padding: 8px 12px; color: #D4D4D8;">${row.charge_slug ? escapeHtml(row.charge_slug) : "All"}</td>
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.bench_acquittal_rate != null ? `${Number(row.bench_acquittal_rate).toFixed(1)}%` : "—"}</td>
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.jury_acquittal_rate != null ? `${Number(row.jury_acquittal_rate).toFixed(1)}%` : "—"}</td>
            <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.bench_sample}</td>
            <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.jury_sample}</td>
            <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
          </tr>
      `;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("bench vs jury divergence");
  }

  // Judge Quotes
  body += sectionHeader("Judge Quote Library");
  if (data.quotes.length > 0) {
    for (const q of data.quotes) {
      if (q.source_url) totalSources++;
      body += `
        <div style="margin-bottom: 16px; padding: 12px 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
          <p style="color: #FAFAF9; font-style: italic; margin: 0 0 6px;">&ldquo;${escapeHtml(q.quote)}&rdquo;</p>
          <p style="color: #71717A; font-size: 12px; margin: 0;">
            ${q.topic ? `<span style="color: #A1A1AA;">${escapeHtml(q.topic)}</span> — ` : ""}
            ${q.case_cited ? escapeHtml(q.case_cited) : ""}
            ${sourceLink(q.source_url)}
          </p>
        </div>
      `;
    }
  } else {
    body += noDataMessage("judicial quote");
  }

  // Appellate Trends
  body += sectionHeader("Appellate Trends — " + (data.judge?.jurisdiction || "Jurisdiction"));
  if (data.appellateTrends.length > 0) {
    body += `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1C1917;">
            <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Argument Type</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Reversal Rate</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Affirmance Rate</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
            <th style="padding: 10px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Sources</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const row of data.appellateTrends) {
      totalSources += countSources(row.source_urls);
      body += `
          <tr style="border-bottom: 1px solid #1C1917;">
            <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(row.argument_type)}</td>
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.reverse_rate != null ? `${Number(row.reverse_rate).toFixed(1)}%` : "—"}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.affirm_rate != null ? `${Number(row.affirm_rate).toFixed(1)}%` : "—"}</td>
            <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.sample_size}</td>
            <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
          </tr>
      `;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("appellate trend");
  }

  return wrapReport(`Judge Report Card — ${judge.name}`, body, totalSources);
}

// ============================================================
// OFFICER BACKGROUND CHECK
// ============================================================

export function renderOfficerBackground(data: OfficerBackgroundData): string {
  let totalSources = 0;
  let body = "";

  for (const officer of data.officers) {
    totalSources += countSources(officer.source_urls);

    // Reliability score color
    const score = officer.reliability_score;
    const scoreColor =
      score == null
        ? "#A1A1AA"
        : score >= 80
          ? "#4ADE80"
          : score >= 50
            ? "#FBBF24"
            : "#EF4444";

    body += sectionHeader(officer.officer_name);
    body += `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Court</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${officer.court ? escapeHtml(officer.court) : "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Jurisdiction</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${officer.jurisdiction ? escapeHtml(officer.jurisdiction) : "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Testimony Count</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${officer.testimony_count}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Times Credibility Challenged</td>
          <td style="padding: 8px 16px; color: ${officer.discredited_count > 0 ? "#EF4444" : "#FAFAF9"}; border-bottom: 1px solid #1C1917; font-weight: bold;">${officer.discredited_count}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Reliability Score</td>
          <td style="padding: 8px 16px; color: ${scoreColor}; border-bottom: 1px solid #1C1917; font-weight: bold; font-size: 18px;">${score != null ? `${Number(score).toFixed(0)}/100` : "Insufficient data"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #A1A1AA;">Sources</td>
          <td style="padding: 8px 16px;">${sourceLinks(officer.source_urls) || "—"}</td>
        </tr>
      </table>
    `;

    // Brady History
    const bradyHistory = officer.brady_history as Array<Record<string, unknown>> | null;
    if (bradyHistory && Array.isArray(bradyHistory) && bradyHistory.length > 0) {
      body += `
        <div style="background: #1C1917; border: 1px solid #7F1D1D; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h3 style="color: #EF4444; margin: 0 0 12px; font-size: 16px;">Brady Violation History</h3>
          <p style="color: #A1A1AA; font-size: 13px; margin: 0 0 12px;">
            Brady violations indicate instances where exculpatory evidence may not have been properly disclosed.
            This is significant information to discuss with your attorney.
          </p>
          <ul style="margin: 0; padding-left: 20px;">
      `;
      for (const entry of bradyHistory) {
        const desc =
          typeof entry === "object" && entry !== null
            ? JSON.stringify(entry)
            : String(entry);
        body += `<li style="color: #D4D4D8; margin-bottom: 6px;">${escapeHtml(desc)}</li>`;
      }
      body += `</ul></div>`;
    }
  }

  const primaryName = data.officers[0]?.officer_name ?? "Officer";
  return wrapReport(`Officer Background Check — ${primaryName}`, body, totalSources);
}

// ============================================================
// SIMILAR CASES ANALYZER
// ============================================================

export function renderSimilarCases(data: SimilarCasesData, intake: { chargeType: string; state: string }): string {
  let totalSources = 0;
  let body = "";

  // Case Matching Summary
  body += sectionHeader("Similar Cases Found");
  if (data.featureVectors.length > 0) {
    body += `
      <p style="color: #D4D4D8; margin-bottom: 16px;">
        Found <strong style="color: #F59E0B;">${data.featureVectors.length}</strong> similar cases
        for <strong>${escapeHtml(intake.chargeType)}</strong> in <strong>${escapeHtml(intake.state)}</strong>
        based on feature vector matching across charge type, jurisdiction, motion patterns, and legal issues.
      </p>
    `;
  } else {
    body += noDataMessage("similar case");
  }

  // Sentencing Distributions
  body += sectionHeader("Sentencing Distribution");
  if (data.sentencingDistributions.length > 0) {
    body += `
      <p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
        Sentencing patterns across judges for ${escapeHtml(intake.chargeType)} cases.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1C1917;">
            <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Charge</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">25th %ile</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Median</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">75th %ile</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
            <th style="padding: 10px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Sources</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const row of data.sentencingDistributions) {
      totalSources += countSources(row.source_urls);
      body += `
          <tr style="border-bottom: 1px solid #1C1917;">
            <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(row.charge_slug)}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p25 != null ? `${Number(row.p25).toFixed(1)} mo` : "—"}</td>
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${row.median_months != null ? `${Number(row.median_months).toFixed(1)} mo` : "—"}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p75 != null ? `${Number(row.p75).toFixed(1)} mo` : "—"}</td>
            <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.sample_size}</td>
            <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
          </tr>
      `;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("sentencing distribution");
  }

  // Plea Discount Curves
  body += sectionHeader("Plea Discount Analysis");
  if (data.pleaDiscountCurves.length > 0) {
    body += `
      <p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
        Comparison of sentences for defendants who took plea deals vs went to trial.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1C1917;">
            <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Charge</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Trial Sentence</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Plea Sentence</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cooperation Bonus</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
            <th style="padding: 10px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Sources</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const row of data.pleaDiscountCurves) {
      totalSources += countSources(row.source_urls);
      body += `
          <tr style="border-bottom: 1px solid #1C1917;">
            <td style="padding: 8px 12px; color: #D4D4D8;">${row.charge_slug ? escapeHtml(row.charge_slug) : "—"}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.base_sentence != null ? `${Number(row.base_sentence).toFixed(1)} mo` : "—"}</td>
            <td style="padding: 8px 12px; color: #4ADE80; text-align: right; font-weight: bold;">${row.plea_sentence != null ? `${Number(row.plea_sentence).toFixed(1)} mo` : "—"}</td>
            <td style="padding: 8px 12px; color: #60A5FA; text-align: right;">${row.cooperation_bonus != null ? `-${Number(row.cooperation_bonus).toFixed(1)} mo` : "—"}</td>
            <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.sample_size}</td>
            <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
          </tr>
      `;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("plea discount");
  }

  // Appellate Trends
  body += sectionHeader("Appellate Trends — " + escapeHtml(intake.state));
  if (data.appellateTrends.length > 0) {
    body += `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1C1917;">
            <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Argument Type</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Reversal Rate</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Affirmance Rate</th>
            <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
            <th style="padding: 10px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Sources</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const row of data.appellateTrends) {
      totalSources += countSources(row.source_urls);
      body += `
          <tr style="border-bottom: 1px solid #1C1917;">
            <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(row.argument_type)}</td>
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.reverse_rate != null ? `${Number(row.reverse_rate).toFixed(1)}%` : "—"}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.affirm_rate != null ? `${Number(row.affirm_rate).toFixed(1)}%` : "—"}</td>
            <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.sample_size}</td>
            <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
          </tr>
      `;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("appellate trend");
  }

  return wrapReport(
    `Similar Cases Analysis — ${intake.chargeType} in ${intake.state}`,
    body,
    totalSources
  );
}
