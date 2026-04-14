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
import type { DefenseIntelligenceData } from "@/lib/defense-intelligence/query";

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

export function renderJudgeReportCard(
  data: JudgeReportCardData,
  intelligence?: DefenseIntelligenceData
): string {
  const judge = data.judge;
  if (!judge) {
    return wrapReport("Judge Report Card", "<p>No judge data available for this query.</p>", 0);
  }

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

  // USSC Sentencing Intelligence
  if (data.usscPatterns) {
    const p = data.usscPatterns;
    totalSources += countSources(p.source_urls);

    body += sectionHeader("Federal Sentencing Intelligence (USSC Data)");
    body += `<p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
      Aggregated from U.S. Sentencing Commission individual case files.
      ${p.data_period ? `Data period: ${escapeHtml(p.data_period)}.` : ""}
    </p>`;

    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Total Federal Cases</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; font-weight: bold;">${p.total_cases}</td></tr>
      <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Median Sentence</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${p.median_sentence_months != null ? `${Number(p.median_sentence_months).toFixed(1)} months` : "—"}</td></tr>
      <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Sentence Range (25th-75th %ile)</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${p.p25_sentence_months != null && p.p75_sentence_months != null ? `${Number(p.p25_sentence_months).toFixed(1)} — ${Number(p.p75_sentence_months).toFixed(1)} months` : "—"}</td></tr>
      ${p.downward_departure_rate != null ? `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Downward Departure Rate</td>
          <td style="padding: 8px 16px; color: #4ADE80; border-bottom: 1px solid #1C1917;">${(Number(p.downward_departure_rate) * 100).toFixed(1)}%</td></tr>` : ""}
      ${p.upward_departure_rate != null ? `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Upward Departure Rate</td>
          <td style="padding: 8px 16px; color: #EF4444; border-bottom: 1px solid #1C1917;">${(Number(p.upward_departure_rate) * 100).toFixed(1)}%</td></tr>` : ""}
      ${p.aba_rating ? `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">ABA Rating</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${escapeHtml(p.aba_rating)}${p.aba_rating_year ? ` (${p.aba_rating_year})` : ""}</td></tr>` : ""}
    </table>`;

    // Retention elections
    if (p.retention_elections && Array.isArray(p.retention_elections) && (p.retention_elections as unknown[]).length > 0) {
      body += `<h4 style="color: #D4D4D8; margin: 16px 0 8px;">Retention Election History</h4>`;
      body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead><tr style="background: #1C1917;">
          <th style="padding: 8px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Year</th>
          <th style="padding: 8px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Vote %</th>
          <th style="padding: 8px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Retained</th>
        </tr></thead><tbody>`;
      for (const re of p.retention_elections as Array<Record<string, unknown>>) {
        body += `<tr style="border-bottom: 1px solid #1C1917;">
          <td style="padding: 8px 12px; color: #D4D4D8;">${re.year ?? "—"}</td>
          <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${re.vote_pct != null ? `${Number(re.vote_pct).toFixed(1)}%` : "—"}</td>
          <td style="padding: 8px 12px; text-align: center; color: ${re.retained ? "#4ADE80" : "#EF4444"};">${re.retained ? "Yes" : "No"}</td>
        </tr>`;
      }
      body += `</tbody></table>`;
    }

    body += `<p style="color: #52525B; font-size: 11px; margin: 0 0 24px;">
      Source: U.S. Sentencing Commission ${sourceLinks(p.source_urls)}
    </p>`;
  }

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

  // Bench vs Jury Divergence — auto-detects data type (USSC sentencing vs CL acquittal)
  if (data.benchJuryDivergence.length > 0) {
    const hasSentencingData = data.benchJuryDivergence.some((r) => r.bench_median_sentence != null);
    const districtName = data.benchJuryDivergence.find((r) => r.district)?.district ?? "";

    if (hasSentencingData) {
      // Human-readable sentence duration
      const fmtSent = (mo: number | null): string => {
        if (mo == null) return "—";
        const m = Number(mo);
        if (m <= 0) return "Probation";
        if (m < 12) return `${Math.round(m)} month${Math.round(m) !== 1 ? "s" : ""}`;
        const yrs = m / 12;
        if (yrs === Math.floor(yrs)) return `${Math.floor(yrs)} year${yrs !== 1 ? "s" : ""}`;
        return `~${Math.round(yrs)} year${Math.round(yrs) !== 1 ? "s" : ""}`;
      };

      // Multiplier: how many times longer than plea
      const fmtMult = (sentence: number | null, plea: number | null): string => {
        if (sentence == null || plea == null) return "";
        const s = Number(sentence);
        const p = Number(plea);
        if (p <= 0 || s <= 0) return "";
        const mult = s / p;
        if (mult < 1.2) return "";
        return `${mult.toFixed(1)}x longer than plea`;
      };

      // Group rows by district
      const byDistrict = new Map<string, typeof data.benchJuryDivergence>();
      for (const row of data.benchJuryDivergence) {
        const dist = row.district || "Federal";
        if (!byDistrict.has(dist)) byDistrict.set(dist, []);
        byDistrict.get(dist)!.push(row);
      }

      body += sectionHeader("What Happens If You Fight vs Take the Deal");

      for (const [district, rows] of byDistrict) {
        const agg = rows.find((r) => r.offense_category === "All Offenses" || r.charge_slug === "All Offenses");
        const perOffense = rows.filter((r) => r !== agg);
        const fyRange = (agg || rows[0])?.fiscal_year_range ?? "";

        if (agg) {
          totalSources += countSources(agg.source_urls);
          const totalCases = (agg.plea_sample || 0) + agg.bench_sample + agg.jury_sample;
          const juryMult = fmtMult(agg.jury_median_sentence, agg.plea_median_sentence);
          const benchMult = fmtMult(agg.bench_median_sentence, agg.plea_median_sentence);

          body += `
            <div style="background: #1C1917; border-left: 4px solid #F59E0B; padding: 16px 20px; margin-bottom: 16px; border-radius: 4px;">
              <p style="color: #A1A1AA; font-size: 12px; margin: 0 0 14px 0;">
                ${escapeHtml(district)} &middot; ${totalCases.toLocaleString()} cases &middot; ${escapeHtml(fyRange)}
              </p>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; color: #22C55E; font-size: 15px; font-weight: 600;">Take the plea deal</td>
                  <td style="padding: 10px 0; color: #22C55E; font-size: 15px; font-weight: 600; text-align: right;">
                    ${fmtSent(agg.plea_median_sentence)}
                  </td>
                </tr>
                <tr style="border-top: 1px solid #292524;">
                  <td style="padding: 10px 0; color: #FAFAF9; font-size: 15px;">Judge trial (no jury)</td>
                  <td style="padding: 10px 0; color: #FAFAF9; font-size: 15px; text-align: right;">
                    ${fmtSent(agg.bench_median_sentence)}${benchMult ? ` <span style="color: #A1A1AA; font-size: 12px;">&middot; ${benchMult}</span>` : ""}
                  </td>
                </tr>
                <tr style="border-top: 1px solid #292524;">
                  <td style="padding: 10px 0; color: #EF4444; font-size: 15px; font-weight: 600;">Jury trial</td>
                  <td style="padding: 10px 0; color: #EF4444; font-size: 15px; font-weight: 600; text-align: right;">
                    ${fmtSent(agg.jury_median_sentence)}${juryMult ? ` <span style="color: #EF4444; font-size: 12px;">&middot; ${juryMult}</span>` : ""}
                  </td>
                </tr>
              </table>
              ${juryMult ? `<p style="color: #A1A1AA; font-size: 12px; margin: 12px 0 0 0; line-height: 1.5;">Defendants who chose jury trial in this district received sentences ${juryMult}. Based on federal sentencing data — state courts may differ. ${sourceLinks(agg.source_urls)}</p>` : ""}
            </div>
          `;
        }

        // Per-offense breakdown (compact table under the card)
        if (perOffense.length > 0) {
          body += `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
              <thead>
                <tr style="background: #1C1917;">
                  <th style="padding: 8px 12px; text-align: left; color: #A1A1AA; font-size: 12px;">By Offense Type</th>
                  <th style="padding: 8px 12px; text-align: right; color: #22C55E; font-size: 12px;">Plea</th>
                  <th style="padding: 8px 12px; text-align: right; color: #FAFAF9; font-size: 12px;">Judge Trial</th>
                  <th style="padding: 8px 12px; text-align: right; color: #EF4444; font-size: 12px;">Jury Trial</th>
                  <th style="padding: 8px 12px; text-align: right; color: #A1A1AA; font-size: 12px;">Cases</th>
                </tr>
              </thead>
              <tbody>
          `;
          for (const row of perOffense) {
            totalSources += countSources(row.source_urls);
            const cases = (row.plea_sample || 0) + row.bench_sample + row.jury_sample;
            body += `
                <tr style="border-bottom: 1px solid #1C1917;">
                  <td style="padding: 6px 12px; color: #D4D4D8; font-size: 13px;">${escapeHtml(row.offense_category || row.charge_slug || "Other")}</td>
                  <td style="padding: 6px 12px; color: #22C55E; text-align: right; font-size: 13px;">${fmtSent(row.plea_median_sentence)}</td>
                  <td style="padding: 6px 12px; color: #FAFAF9; text-align: right; font-size: 13px;">${fmtSent(row.bench_median_sentence)}</td>
                  <td style="padding: 6px 12px; color: #EF4444; text-align: right; font-size: 13px;">${fmtSent(row.jury_median_sentence)}</td>
                  <td style="padding: 6px 12px; color: #A1A1AA; text-align: right; font-size: 13px;">${cases.toLocaleString()}</td>
                </tr>
            `;
          }
          body += `</tbody></table>`;
        }
      }
    } else {
      // Original acquittal rate view (CL opinion mining — kept for future use)
      body += sectionHeader("Bench vs Jury Trial Divergence");
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
    }
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

  body += intelligence ? renderIntelligenceSection(intelligence) : "";

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

  // External Intelligence Records
  if (data.externalIntel.length > 0) {
    body += sectionHeader("External Intelligence Records");
    body += `<p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
      Data from Brady/Giglio List, National Police Index, and state POST databases.
    </p>`;

    for (const intel of data.externalIntel) {
      totalSources += countSources(intel.source_urls);

      // Brady status alert
      if (intel.brady_status === "listed") {
        body += `
          <div style="background: #1C1917; border: 1px solid #7F1D1D; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h3 style="color: #EF4444; margin: 0 0 8px; font-size: 16px;">Brady/Giglio Listed</h3>
            <p style="color: #D4D4D8; margin: 0;">${intel.brady_reason ? escapeHtml(intel.brady_reason) : "This officer appears on a Brady/Giglio disclosure list."}</p>
            <p style="color: #71717A; font-size: 12px; margin: 8px 0 0;">
              Question for your attorney: &ldquo;Has the prosecution disclosed this officer&rsquo;s Brady status?&rdquo;
            </p>
          </div>
        `;
      }

      // Decertification alert
      if (intel.decertified) {
        body += `
          <div style="background: #1C1917; border: 1px solid #92400E; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h3 style="color: #FBBF24; margin: 0 0 8px; font-size: 16px;">Decertified Officer</h3>
            <p style="color: #D4D4D8; margin: 0;">${intel.decertification_reason ? escapeHtml(intel.decertification_reason) : "This officer has been decertified."}</p>
          </div>
        `;
      }

      // Employment history
      if (intel.npi_employment_history && Array.isArray(intel.npi_employment_history)) {
        body += `<h4 style="color: #D4D4D8; margin: 16px 0 8px;">Employment History</h4>`;
        body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <thead><tr style="background: #1C1917;">
            <th style="padding: 8px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Agency</th>
            <th style="padding: 8px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Period</th>
            <th style="padding: 8px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Separation</th>
          </tr></thead><tbody>`;
        for (const job of intel.npi_employment_history as Array<Record<string, string>>) {
          body += `<tr style="border-bottom: 1px solid #1C1917;">
            <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(job.agency || "—")}</td>
            <td style="padding: 8px 12px; color: #D4D4D8;">${job.start || "?"} — ${job.end || "present"}</td>
            <td style="padding: 8px 12px; color: ${job.separation_reason?.includes("fired") || job.separation_reason?.includes("terminated") ? "#EF4444" : "#A1A1AA"};">${escapeHtml(job.separation_reason || "—")}</td>
          </tr>`;
        }
        body += `</tbody></table>`;

        if (intel.npi_is_wandering_officer) {
          body += `<p style="color: #EF4444; font-weight: bold; margin: 0 0 16px;">
            This officer was terminated from 2+ agencies — classified as a &ldquo;wandering officer.&rdquo;
          </p>`;
        }
      }

      // Complaint/use-of-force stats
      if (intel.complaint_count > 0 || intel.use_of_force_count > 0) {
        body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Total Complaints</td>
              <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${intel.complaint_count}</td></tr>
          <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Sustained Complaints</td>
              <td style="padding: 8px 16px; color: ${intel.sustained_complaints > 0 ? "#EF4444" : "#FAFAF9"}; border-bottom: 1px solid #1C1917;">${intel.sustained_complaints}</td></tr>
          <tr><td style="padding: 8px 16px; color: #A1A1AA;">Use of Force Incidents</td>
              <td style="padding: 8px 16px; color: #FAFAF9;">${intel.use_of_force_count}</td></tr>
        </table>`;
      }

      // Credibility risk score
      if (intel.credibility_risk_score != null) {
        const riskColor = intel.credibility_risk_score >= 70 ? "#EF4444" : intel.credibility_risk_score >= 40 ? "#FBBF24" : "#4ADE80";
        body += `<p style="color: ${riskColor}; font-size: 18px; font-weight: bold; margin: 8px 0 16px;">
          Credibility Risk Score: ${intel.credibility_risk_score}/100
        </p>`;
      }

      body += `<p style="color: #52525B; font-size: 11px; margin: 0 0 24px;">
        Sources: ${intel.sources?.join(", ") || "—"} ${sourceLinks(intel.source_urls)}
      </p>`;
    }
  }

  const primaryName = data.officers[0]?.officer_name ?? data.externalIntel[0]?.officer_name ?? "Officer";
  return wrapReport(`Officer Background Check — ${primaryName}`, body, totalSources);
}

// ============================================================
// SIMILAR CASES ANALYZER
// ============================================================

export function renderSimilarCases(
  data: SimilarCasesData,
  intake: { chargeType: string; state: string },
  intelligence?: DefenseIntelligenceData
): string {
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

  // Outcome Benchmarks
  body += sectionHeader("National &amp; State Outcome Data");
  if (data.outcomeBenchmarks.length > 0) {
    body += `<p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
      How cases like yours are resolved nationally and in your state, based on federal sentencing data.
    </p>`;
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Level</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Conviction</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Dismissal</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Plea Rate</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Trial Penalty</th>
        <th style="padding: 10px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Sources</th>
      </tr></thead><tbody>`;

    for (const row of data.outcomeBenchmarks) {
      totalSources += countSources(row.source_urls);
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(row.jurisdiction_name)} (${escapeHtml(row.jurisdiction_level)})</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.total_cases ?? "—"}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.conviction_rate != null ? `${(Number(row.conviction_rate) * 100).toFixed(1)}%` : "—"}</td>
        <td style="padding: 8px 12px; color: #4ADE80; text-align: right;">${row.dismissal_rate != null ? `${(Number(row.dismissal_rate) * 100).toFixed(1)}%` : "—"}</td>
        <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.plea_rate != null ? `${(Number(row.plea_rate) * 100).toFixed(1)}%` : "—"}</td>
        <td style="padding: 8px 12px; color: ${row.plea_trial_penalty_pct && Number(row.plea_trial_penalty_pct) > 0 ? "#EF4444" : "#A1A1AA"}; text-align: right;">${row.plea_trial_penalty_pct != null ? `+${Number(row.plea_trial_penalty_pct).toFixed(0)}%` : "—"}</td>
        <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
      </tr>`;
    }
    body += `</tbody></table>`;

    body += `<p style="color: #71717A; font-size: 12px; margin: 0 0 24px;">
      &ldquo;Trial Penalty&rdquo; shows how much longer average sentences are for defendants who go to trial vs those who accept plea deals.
      Question for your attorney: &ldquo;Given these numbers, what&rsquo;s the realistic risk-reward of going to trial?&rdquo;
    </p>`;
  } else {
    body += noDataMessage("outcome benchmark");
  }

  body += intelligence ? renderIntelligenceSection(intelligence) : "";

  return wrapReport(
    `Similar Cases Analysis — ${intake.chargeType} in ${intake.state}`,
    body,
    totalSources
  );
}

// ============================================================
// DEFENSE INTELLIGENCE SECTION (shared by Judge Report Card + Similar Cases)
// ============================================================

function renderIntelligenceSection(intel: DefenseIntelligenceData): string {
  const sections: string[] = [];

  if (intel.theoryOutcomes.length > 0) {
    const theoryRows = intel.theoryOutcomes
      .slice(0, 10)
      .map((t) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #292524; color: #D4D4D8;">
            ${escapeHtml(t.defense_theory.split("_").join(" "))}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #292524; color: #D4D4D8; text-align: center;">
            ${t.motion_success_rate !== null ? (t.motion_success_rate * 100).toFixed(0) + "%" : "\u2014"}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #292524; color: #D4D4D8; text-align: center;">
            ${t.case_success_rate !== null ? (t.case_success_rate * 100).toFixed(0) + "%" : "\u2014"}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #292524; color: #71717A; text-align: center;">
            ${t.attempts} ${sourceLinks(t.sample_source_urls)}
          </td>
        </tr>`)
      .join("");

    sections.push(`
      <div style="margin-top: 32px;">
        <h2 style="color: #F59E0B; font-size: 20px; margin: 0 0 8px;">Defense Theory Intelligence</h2>
        <p style="color: #71717A; font-size: 12px; margin: 0 0 16px;">
          Based on published court opinions. Rates may differ from unpublished dispositions and plea agreements.
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #422006;">
              <th style="padding: 8px; text-align: left; color: #A1A1AA; font-size: 13px;">Theory</th>
              <th style="padding: 8px; text-align: center; color: #A1A1AA; font-size: 13px;">Motion Grant Rate</th>
              <th style="padding: 8px; text-align: center; color: #A1A1AA; font-size: 13px;">Case Success Rate</th>
              <th style="padding: 8px; text-align: center; color: #A1A1AA; font-size: 13px;">Cases (N)</th>
            </tr>
          </thead>
          <tbody>${theoryRows}</tbody>
        </table>
      </div>
    `);
  }

  if (intel.motionPatterns.length > 0) {
    const motionRows = intel.motionPatterns
      .slice(0, 10)
      .map((m) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #292524; color: #D4D4D8;">
            ${escapeHtml(m.motion_type.split("_").join(" "))}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #292524; color: #D4D4D8; text-align: center;">
            ${m.grant_rate !== null ? (m.grant_rate * 100).toFixed(0) + "%" : "\u2014"}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #292524; color: #71717A; text-align: center;">
            ${m.filed_count} ${sourceLinks(m.sample_source_urls)}
          </td>
        </tr>`)
      .join("");

    sections.push(`
      <div style="margin-top: 32px;">
        <h2 style="color: #F59E0B; font-size: 20px; margin: 0 0 8px;">Motion Success Patterns</h2>
        <p style="color: #71717A; font-size: 12px; margin: 0 0 16px;">
          Motion-level grant rates. &ldquo;Granted&rdquo; means the motion itself was granted, not the case outcome.
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #422006;">
              <th style="padding: 8px; text-align: left; color: #A1A1AA; font-size: 13px;">Motion Type</th>
              <th style="padding: 8px; text-align: center; color: #A1A1AA; font-size: 13px;">Grant Rate</th>
              <th style="padding: 8px; text-align: center; color: #A1A1AA; font-size: 13px;">Filed (N)</th>
            </tr>
          </thead>
          <tbody>${motionRows}</tbody>
        </table>
      </div>
    `);
  }

  if (intel.relevantOpinions.length > 0) {
    const opinionItems = intel.relevantOpinions
      .slice(0, 5)
      .map((op) => `
        <div style="padding: 12px; background: #1C1917; border-radius: 6px; margin-bottom: 8px;">
          <p style="color: #FAFAF9; font-weight: bold; margin: 0 0 4px;">
            ${escapeHtml(op.case_name)} ${sourceLinks(op.source_urls)}
          </p>
          ${op.holding_text ? `<p style="color: #A1A1AA; font-size: 13px; margin: 0;">${escapeHtml(op.holding_text.slice(0, 300))}${op.holding_text.length > 300 ? "..." : ""}</p>` : ""}
          <p style="color: #71717A; font-size: 11px; margin: 4px 0 0;">
            ${op.defense_theories.map(t => t.split("_").join(" ")).join(", ")}
            ${op.case_favorability !== null ? " | Favorability: " + op.case_favorability + "/100" : ""}
          </p>
        </div>`)
      .join("");

    sections.push(`
      <div style="margin-top: 32px;">
        <h2 style="color: #F59E0B; font-size: 20px; margin: 0 0 16px;">Relevant Court Opinions</h2>
        ${opinionItems}
      </div>
    `);
  }

  return sections.join("");
}
