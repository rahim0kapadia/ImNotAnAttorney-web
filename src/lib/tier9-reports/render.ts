/**
 * Tier 9 report HTML renderers, one function per SKU.
 * Produces self-contained HTML reports styled in the INAA dark theme.
 * Every data point includes source URL verification links.
 */

import { escapeHtml } from "@/lib/email";
import type {
  JudgeReportCardData,
  OfficerBackgroundData,
  SimilarCasesData,
} from "./query";
import type {
  DefenseIntelligenceData,
  DistrictCourtIntelData,
  ArrestSurvivalKitData,
} from "@/lib/defense-intelligence/query";
import type { SimilarCasesResponse, SimilarCasesRow } from "@/lib/ussc-similar-cases";

/** Per-outcome shape surfaced to the Similar Cases renderer. */
export interface UsscOutcomeSummary {
  n_cases: number;
  median_months: number | null;
  mean_months: number | null;
  percentiles: {
    p10: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p90: number | null;
  };
  pct_got_prison: number | null;
  pct_downward_departure: number | null;
  earliest_fy: number;
  latest_fy: number;
}

/** Matview-backed federal distribution bundle consumed by renderSimilarCases. */
export interface UsscDistribution {
  match_depth: SimilarCasesResponse["match_depth"];
  widening_note: string | null;
  total_cases: number;
  sample_size_caveat: string;
  outcomes: {
    plea: UsscOutcomeSummary | null;
    trial: UsscOutcomeSummary | null;
  };
  trial_tax_months: number | null;
  /** Optional district metadata from ussc_districts lookup. Null when no
   *  district was matched (widened_district tier) or the code isn't in the
   *  94-row codebook lookup. */
  district_display?: {
    district_code: string;
    short_name: string;
    district_name: string;
    state_code: string | null;
    circuit: string;
  } | null;
}

/** Helper — reshape a raw matview row into UsscOutcomeSummary. */
export function reshapeMatviewRow(row: SimilarCasesRow | null): UsscOutcomeSummary | null {
  if (!row) return null;
  return {
    n_cases: row.n_cases,
    median_months: row.median_senttot,
    mean_months: row.mean_senttot,
    percentiles: {
      p10: row.p10_senttot,
      p25: row.p25_senttot,
      p50: row.median_senttot,
      p75: row.p75_senttot,
      p90: row.p90_senttot,
    },
    pct_got_prison: row.pct_got_prison,
    pct_downward_departure: row.pct_downward_departure,
    earliest_fy: row.earliest_fy,
    latest_fy: row.latest_fy,
  };
}

// ============================================================
// SHARED HELPERS
// ============================================================

const UPL_DISCLAIMER = `
  <div style="background: #1C1917; border: 1px solid #422006; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">Legal Information, Not Legal Advice</p>
    <p style="color: #A1A1AA; font-size: 13px; margin: 0;">
      This report provides verified court record data compiled into a structured format.
      It is legal INFORMATION, not legal ADVICE. Decisions about how to use this information stay with you. All data points are sourced from public court records with
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

/** Format months value for sentencing display */
function fmtMonths(v: number | null): string {
  return v !== null ? `${Number(v).toFixed(1)} mo` : ", ";
}

/** Format decimal as percentage */
function fmtPct(v: number | null): string {
  return v !== null ? `${(Number(v) * 100).toFixed(1)}%` : ", ";
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
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${judge.court ? escapeHtml(judge.court) : ", "}</td>
      </tr>
      <tr>
        <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Jurisdiction</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${judge.jurisdiction ? escapeHtml(judge.jurisdiction) : ", "}</td>
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

  // JUSTFAIR Judge Background (federal courts only)
  if (data.justfair?.demographics) {
    const d = data.justfair.demographics;
    body += sectionHeader("Judge Background, Federal Court Intelligence");
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">Source: JUSTFAIR (QSIDE Institute), USSC FY2001-2023. Federal courts only. <a href="https://osf.io/nseh5/" style="color: #F59E0B;">[source]</a></p>`;
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">`;

    const demoRows: [string, string | null][] = [
      ["Appointed By", d.appointing_president ? `${escapeHtml(d.appointing_president)} (${escapeHtml(d.appointing_party ?? "Unknown")})` : null],
      ["ABA Rating", d.aba_rating],
      ["Law School", d.law_school],
      ["Gender", d.gender],
      ["Active", d.active_start ? `${d.active_start}–${d.active_end ?? "present"}` : null],
      ["Senior Status", d.senior_status_date ?? "No"],
    ];

    for (const [label, value] of demoRows) {
      if (!value) continue;
      body += `<tr>
        <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">${escapeHtml(label)}</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${value}</td>
      </tr>`;
    }
    body += `</table>`;
    totalSources++;
  }

  // Sentencing Intelligence, enhanced with JUSTFAIR source citation
  if (data.usscPatterns) {
    const s = data.usscPatterns;
    totalSources += countSources(s.source_urls);

    body += sectionHeader("Sentencing Intelligence, 595,851 Federal Cases Analyzed");
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">This judge's sentencing patterns from USSC/JUSTFAIR data. <a href="https://osf.io/nseh5/" style="color: #F59E0B;">[source]</a></p>`;

    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: left;"></th>
        <th style="padding: 8px 16px; color: #F59E0B; border-bottom: 2px solid #292524; text-align: right;">This Judge</th>
      </tr></thead><tbody>`;

    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Total Cases</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${s.total_cases?.toLocaleString() ?? ", "}</td></tr>`;
    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Median Sentence</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtMonths(s.median_sentence_months)}</td></tr>`;
    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Range (P25–P75)</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtMonths(s.p25_sentence_months)} – ${fmtMonths(s.p75_sentence_months)}</td></tr>`;
    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Downward Departures</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtPct(s.downward_departure_rate)}</td></tr>`;
    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Upward Departures</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtPct(s.upward_departure_rate)}</td></tr>`;

    body += `</tbody></table>`;

    // Retention elections (preserved from existing)
    if (s.retention_elections && Array.isArray(s.retention_elections) && (s.retention_elections as unknown[]).length > 0) {
      body += `<h4 style="color: #D4D4D8; margin: 16px 0 8px;">Retention Election History</h4>`;
      body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead><tr style="background: #1C1917;">
          <th style="padding: 8px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Year</th>
          <th style="padding: 8px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Vote %</th>
          <th style="padding: 8px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Retained</th>
        </tr></thead><tbody>`;
      for (const re of s.retention_elections as Array<Record<string, unknown>>) {
        body += `<tr style="border-bottom: 1px solid #1C1917;">
          <td style="padding: 8px 12px; color: #D4D4D8;">${re.year ?? ", "}</td>
          <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${re.vote_pct != null ? `${Number(re.vote_pct).toFixed(1)}%` : ", "}</td>
          <td style="padding: 8px 12px; text-align: center; color: ${re.retained ? "#4ADE80" : "#EF4444"};">${re.retained ? "Yes" : "No"}</td>
        </tr>`;
      }
      body += `</tbody></table>`;
    }

    body += `<p style="color: #52525B; font-size: 11px; margin: 0 0 24px;">
      Source: U.S. Sentencing Commission / JUSTFAIR ${sourceLinks(s.source_urls)}
    </p>`;
  }

  // JUSTFAIR Sentencing by Defendant Demographics
  if (data.justfair?.sentencingByRace && data.justfair.sentencingByRace.length > 0) {
    body += sectionHeader("Sentencing by Defendant Demographics");
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">Factual sentencing data by defendant race for this judge. No editorial interpretation. <a href="https://osf.io/nseh5/" style="color: #F59E0B;">[source]</a></p>`;

    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: left;">Defendant Race</th>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: right;">Cases</th>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: right;">Median Sentence</th>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: right;">Departure Rate</th>
      </tr></thead><tbody>`;

    for (const row of data.justfair.sentencingByRace) {
      body += `<tr>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${escapeHtml(row.defendant_race)}</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${row.total_cases.toLocaleString()}</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtMonths(row.median_sentence_months)}</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtPct(row.guideline_departure_rate)}</td>
      </tr>`;
    }

    body += `</tbody></table>`;
    totalSources++;
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
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p25 != null ? `${Number(row.p25).toFixed(1)} mo` : ", "}</td>
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${row.median_months != null ? `${Number(row.median_months).toFixed(1)} mo` : ", "}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p75 != null ? `${Number(row.p75).toFixed(1)} mo` : ", "}</td>
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
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${row.grant_rate != null ? `${Number(row.grant_rate).toFixed(1)}%` : ", "}</td>
            <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.sample_size}</td>
            <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
          </tr>
      `;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("prosecutor pairing");
  }

  // Bench vs Jury Divergence, auto-detects data type (USSC sentencing vs CL acquittal)
  if (data.benchJuryDivergence.length > 0) {
    const hasSentencingData = data.benchJuryDivergence.some((r) => r.bench_median_sentence != null);
    const districtName = data.benchJuryDivergence.find((r) => r.district)?.district ?? "";

    if (hasSentencingData) {
      // Human-readable sentence duration
      const fmtSent = (mo: number | null): string => {
        if (mo == null) return ", ";
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
              ${juryMult ? `<p style="color: #A1A1AA; font-size: 12px; margin: 12px 0 0 0; line-height: 1.5;">Defendants who chose jury trial in this district received sentences ${juryMult}. Based on federal sentencing data, state courts may differ. ${sourceLinks(agg.source_urls)}</p>` : ""}
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
      // Original acquittal rate view (CL opinion mining, kept for future use)
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
              <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.bench_acquittal_rate != null ? `${Number(row.bench_acquittal_rate).toFixed(1)}%` : ", "}</td>
              <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.jury_acquittal_rate != null ? `${Number(row.jury_acquittal_rate).toFixed(1)}%` : ", "}</td>
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
            ${q.topic ? `<span style="color: #A1A1AA;">${escapeHtml(q.topic)}</span>, ` : ""}
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
  body += sectionHeader("Appellate Trends, " + (data.judge?.jurisdiction || "Jurisdiction"));
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
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.reverse_rate != null ? `${Number(row.reverse_rate).toFixed(1)}%` : ", "}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.affirm_rate != null ? `${Number(row.affirm_rate).toFixed(1)}%` : ", "}</td>
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

  return wrapReport(`Judge Report Card, ${judge.name}`, body, totalSources);
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
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${officer.court ? escapeHtml(officer.court) : ", "}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Jurisdiction</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${officer.jurisdiction ? escapeHtml(officer.jurisdiction) : ", "}</td>
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
          <td style="padding: 8px 16px;">${sourceLinks(officer.source_urls) || ", "}</td>
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
            <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(job.agency || ", ")}</td>
            <td style="padding: 8px 12px; color: #D4D4D8;">${job.start || "?"}, ${job.end || "present"}</td>
            <td style="padding: 8px 12px; color: ${job.separation_reason?.includes("fired") || job.separation_reason?.includes("terminated") ? "#EF4444" : "#A1A1AA"};">${escapeHtml(job.separation_reason || ", ")}</td>
          </tr>`;
        }
        body += `</tbody></table>`;

        if (intel.npi_is_wandering_officer) {
          body += `<p style="color: #EF4444; font-weight: bold; margin: 0 0 16px;">
            This officer was terminated from 2+ agencies, classified as a &ldquo;wandering officer.&rdquo;
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
        Sources: ${intel.sources?.join(", ") || ", "} ${sourceLinks(intel.source_urls)}
      </p>`;
    }
  }

  // Agency Fatal Encounter Alerts (from Fatal Encounters dataset)
  if (data.agencyIncidents && data.agencyIncidents.length > 0) {
    body += sectionHeader("Agency Fatal Encounter History");
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">Fatal encounters involving this officer's agency since 2013. Agency-level data, not specific to this officer. <a href="https://fatalencounters.org/" style="color: #F59E0B;">[source]</a></p>`;

    for (const ai of data.agencyIncidents) {
      body += `
        <div style="background: #1C1917; border: 1px solid #92400E; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <p style="color: #FBBF24; font-weight: bold; margin: 0 0 8px;">${escapeHtml(ai.agency)}</p>
          <p style="color: #D4D4D8; margin: 0;">${ai.use_of_force_count} fatal encounter${ai.use_of_force_count !== 1 ? "s" : ""} recorded since 2013</p>
          <p style="color: #71717A; font-size: 12px; margin: 8px 0 0;">
            Question for your attorney: &ldquo;Has the arresting agency&rsquo;s use-of-force history been reviewed?&rdquo;
          </p>
        </div>
      `;
      totalSources += countSources(ai.source_urls);
    }
  }

  const primaryName = data.officers[0]?.officer_name ?? data.externalIntel[0]?.officer_name ?? "Officer";
  return wrapReport(`Officer Background Check, ${primaryName}`, body, totalSources);
}

// ============================================================
// SIMILAR CASES ANALYZER
// ============================================================

export function renderSimilarCases(
  data: SimilarCasesData,
  intake: {
    chargeType: string;
    state: string;
    priorConvictions?: string | null;
    citizenship?: string | null;
    ageBucket?: string | null;
  },
  intelligence?: DefenseIntelligenceData,
  ussc?: UsscDistribution | null
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
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p25 != null ? `${Number(row.p25).toFixed(1)} mo` : ", "}</td>
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${row.median_months != null ? `${Number(row.median_months).toFixed(1)} mo` : ", "}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p75 != null ? `${Number(row.p75).toFixed(1)} mo` : ", "}</td>
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
            <td style="padding: 8px 12px; color: #D4D4D8;">${row.charge_slug ? escapeHtml(row.charge_slug) : ", "}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.base_sentence != null ? `${Number(row.base_sentence).toFixed(1)} mo` : ", "}</td>
            <td style="padding: 8px 12px; color: #4ADE80; text-align: right; font-weight: bold;">${row.plea_sentence != null ? `${Number(row.plea_sentence).toFixed(1)} mo` : ", "}</td>
            <td style="padding: 8px 12px; color: #60A5FA; text-align: right;">${row.cooperation_bonus != null ? `-${Number(row.cooperation_bonus).toFixed(1)} mo` : ", "}</td>
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
  body += sectionHeader("Appellate Trends, " + escapeHtml(intake.state));
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
            <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.reverse_rate != null ? `${Number(row.reverse_rate).toFixed(1)}%` : ", "}</td>
            <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.affirm_rate != null ? `${Number(row.affirm_rate).toFixed(1)}%` : ", "}</td>
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
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.total_cases ?? ", "}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.conviction_rate != null ? `${(Number(row.conviction_rate) * 100).toFixed(1)}%` : ", "}</td>
        <td style="padding: 8px 12px; color: #4ADE80; text-align: right;">${row.dismissal_rate != null ? `${(Number(row.dismissal_rate) * 100).toFixed(1)}%` : ", "}</td>
        <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.plea_rate != null ? `${(Number(row.plea_rate) * 100).toFixed(1)}%` : ", "}</td>
        <td style="padding: 8px 12px; color: ${row.plea_trial_penalty_pct && Number(row.plea_trial_penalty_pct) > 0 ? "#EF4444" : "#A1A1AA"}; text-align: right;">${row.plea_trial_penalty_pct != null ? `+${Number(row.plea_trial_penalty_pct).toFixed(0)}%` : ", "}</td>
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

  // USSC Matview Federal Sentencing Distribution (optional, additive)
  if (ussc && ussc.match_depth !== "insufficient_data") {
    body += renderUsscDistribution(ussc);
    // Source credit: USSC Individual Offender Datafiles — counts as one source.
    totalSources += 1;
  }

  body += intelligence ? renderIntelligenceSection(intelligence) : "";

  return wrapReport(
    `Similar Cases Analysis, ${intake.chargeType} in ${intake.state}`,
    body,
    totalSources
  );
}

/**
 * Renders the optional USSC matview federal sentencing distribution section.
 * UPL-safe — reports distribution, never recommendation. Match depth disclosed.
 */
function renderUsscDistribution(ussc: UsscDistribution): string {
  let html = sectionHeader("Federal Sentencing Distribution (USSC FY14-FY24)");

  // District attribution — only surface when we actually narrowed to a
  // specific district. The widened_district tier shows national data, so
  // displaying a district name there would misrepresent the sample.
  const narrowedToDistrict = ussc.match_depth !== "widened_district" && ussc.match_depth !== "insufficient_data";
  if (narrowedToDistrict && ussc.district_display) {
    const d = ussc.district_display;
    const circuit = d.circuit ? `${escapeHtml(d.circuit)} Circuit` : "";
    const state = d.state_code ? escapeHtml(d.state_code) : "";
    const meta = [circuit, state].filter(Boolean).join(" &middot; ");
    html += `<p style="color: #F59E0B; margin-bottom: 8px; font-size: 14px; font-weight: 600;">
      ${escapeHtml(d.short_name)}${meta ? ` <span style="color: #A1A1AA; font-weight: 400;">(${meta})</span>` : ""}
    </p>`;
  }

  // When district_display renders above (widened_age + widened_citizen paths),
  // the district label is already anchored in the heading, so the depth
  // caption drops the "district" prefix to avoid duplicated context.
  const hasDistrictHeading = narrowedToDistrict && Boolean(ussc.district_display);
  const depthLabel: Record<UsscDistribution["match_depth"], string> = hasDistrictHeading
    ? {
        exact: "Exact match for your case profile",
        widened_age: "Matched on offense, criminal history, and citizenship (age bracket widened)",
        widened_citizen: "Matched on offense and criminal history (citizenship + age widened)",
        widened_district: "National averages for this offense guideline and criminal history",
        insufficient_data: "Insufficient data",
      }
    : {
        exact: "Exact match for your case profile",
        widened_age: "Matched on district, offense, criminal history, and citizenship (age bracket widened)",
        widened_citizen: "Matched on district, offense, and criminal history (citizenship + age widened)",
        widened_district: "National averages for this offense guideline and criminal history",
        insufficient_data: "Insufficient data",
      };

  html += `<p style="color: #A1A1AA; margin-bottom: 12px; font-size: 14px;">
    ${escapeHtml(depthLabel[ussc.match_depth])}. ${escapeHtml(ussc.sample_size_caveat)}
  </p>`;

  if (ussc.widening_note) {
    html += `<p style="color: #78716C; font-size: 12px; margin-bottom: 16px; font-style: italic;">
      ${escapeHtml(ussc.widening_note)}
    </p>`;
  }

  const NA = "&mdash;";
  const renderRow = (label: string, outcome: UsscOutcomeSummary | null) => {
    if (!outcome) return "";
    const pct = outcome.percentiles;
    const fmt = (v: number | null) => (v == null ? NA : `${Number(v).toFixed(1)} mo`);
    return `<tr style="border-bottom: 1px solid #1C1917;">
      <td style="padding: 8px 12px; color: #D4D4D8; font-weight: bold;">${escapeHtml(label)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${outcome.n_cases}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${fmt(pct.p10)}</td>
      <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${fmt(pct.p25)}</td>
      <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${fmt(pct.p50)}</td>
      <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${fmt(pct.p75)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${fmt(pct.p90)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${outcome.pct_got_prison != null ? `${outcome.pct_got_prison.toFixed(1)}%` : NA}</td>
    </tr>`;
  };

  html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
    <thead><tr style="background: #1C1917;">
      <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Outcome</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">10th %</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">25th %</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Median</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">75th %</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">90th %</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Got Prison</th>
    </tr></thead><tbody>`;

  html += renderRow("Plea", ussc.outcomes.plea);
  html += renderRow("Trial", ussc.outcomes.trial);
  html += `</tbody></table>`;

  if (ussc.trial_tax_months !== null) {
    const sign = ussc.trial_tax_months >= 0 ? "+" : "";
    html += `<p style="color: ${ussc.trial_tax_months > 0 ? "#EF4444" : "#A1A1AA"}; margin-bottom: 16px;">
      <strong>Observed trial-vs-plea sentencing gap:</strong> ${sign}${ussc.trial_tax_months.toFixed(1)} months
      (median trial sentence minus median plea sentence, across ${ussc.total_cases} historical federal cases).
      Individual outcomes vary widely based on case-specific facts.
    </p>`;
  }

  html += `<p style="color: #71717A; font-size: 12px; margin: 0 0 24px;">
    Source: U.S. Sentencing Commission Individual Offender Datafiles, FY2014-FY2024.
    <a href="https://www.ussc.gov/research/datafiles/commission-datafiles" style="color: #F59E0B;">[source]</a>
    Question for your attorney: &ldquo;Given this distribution, what factors in my case might position me at the lower percentiles?&rdquo;
  </p>`;

  return html;
}

// ============================================================
// FEDERAL SENTENCING DISTRIBUTION REPORT ($297 standalone)
// ============================================================

interface FsdReportInput {
  chargeType: string;
  districtDisplay: {
    district_code: string;
    short_name: string;
    district_name: string;
    state_code: string | null;
    circuit: string;
  } | null;
  match_depth:
    | "exact"
    | "widened_ch_missing"
    | "widened_criminal_history"
    | "widened_district"
    | "insufficient_data";
  widening_note: string | null;
  sample_size_caveat: string;
  district_agg: {
    total_n: number;
    mean_months: number | null;
    median_months: number | null;
    p10_months: number | null;
    p25_months: number | null;
    p75_months: number | null;
    p90_months: number | null;
    downward_departure_rate: number | null;
    upward_departure_rate: number | null;
    probation_rate: number | null;
    earliest_fy: number;
    latest_fy: number;
    offguide_label: string;
    offense_category: string;
  };
  national_agg: FsdReportInput["district_agg"] | null;
  per_year: Array<{ fy: number; n: number; mean_months: number | null; median_months: number | null }>;
  monte_carlo: number[];
  histogram: Array<{ range_start: number; range_end: number; count: number }>;
  criminalHistoryCategory: string | null;
}

export function renderFederalSentencingDistribution(data: FsdReportInput): string {
  const { district_agg, national_agg, districtDisplay } = data;
  let body = "";
  const totalSources = 1; // USSC datafile is one source

  // Local formatters — richer than the module-level fmtMonths/fmtPct used by
  // other Tier 9 renderers. Inline because only this renderer needs the yr
  // conversion + "Probation" sentinel.
  const fmtMonths = (v: number | null): string => {
    if (v == null) return "—";
    const m = Number(v);
    if (m <= 0) return "Probation";
    if (m < 12) return `${m.toFixed(1)} mo`;
    return `${m.toFixed(1)} mo (≈${(m / 12).toFixed(1)} yr)`;
  };
  const fmtPct = (v: number | null): string => {
    if (v == null) return "—";
    return `${(Number(v) * 100).toFixed(1)}%`;
  };

  // Header context
  const districtLabel = districtDisplay
    ? `${escapeHtml(districtDisplay.short_name)} (${escapeHtml(districtDisplay.circuit)} Circuit${districtDisplay.state_code ? " · " + escapeHtml(districtDisplay.state_code) : ""})`
    : "All federal districts (national)";
  const chLabel = data.criminalHistoryCategory
    ? `Category ${escapeHtml(data.criminalHistoryCategory)}`
    : "All criminal history categories";

  body += `<p style="color: #D4D4D8; font-size: 15px; margin-bottom: 8px;">
    <strong style="color: #FAFAF9;">${escapeHtml(district_agg.offguide_label)}</strong>
    &middot; ${districtLabel}
    &middot; ${chLabel}
  </p>
  <p style="color: #A1A1AA; font-size: 13px; margin-bottom: 20px;">
    ${escapeHtml(data.sample_size_caveat)}
  </p>`;

  if (data.widening_note) {
    body += `<p style="color: #78716C; font-size: 12px; margin-bottom: 16px; font-style: italic;">
      ${escapeHtml(data.widening_note)}
    </p>`;
  }

  // Distribution table (percentiles)
  body += sectionHeader("Sentence Distribution");
  body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">
    How sentences spread across the ${district_agg.total_n.toLocaleString()} historical cases in this bucket.
    The <strong style="color: #FAFAF9;">50th percentile (median)</strong> is the center point;
    the 10th and 90th are the tails.
  </p>`;

  body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <thead><tr style="background: #1C1917;">
      <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Percentile</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Sentence</th>
      <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Interpretation</th>
    </tr></thead><tbody>
    <tr style="border-bottom: 1px solid #1C1917;">
      <td style="padding: 8px 12px; color: #D4D4D8;">10th percentile</td>
      <td style="padding: 8px 12px; color: #22C55E; text-align: right; font-weight: 600;">${fmtMonths(district_agg.p10_months)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; font-size: 12px;">10% of cases got this sentence or less</td>
    </tr>
    <tr style="border-bottom: 1px solid #1C1917;">
      <td style="padding: 8px 12px; color: #D4D4D8;">25th percentile</td>
      <td style="padding: 8px 12px; color: #4ADE80; text-align: right;">${fmtMonths(district_agg.p25_months)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; font-size: 12px;">Lower quarter of cases</td>
    </tr>
    <tr style="border-bottom: 1px solid #1C1917;">
      <td style="padding: 8px 12px; color: #FAFAF9; font-weight: 600;">Median (50th)</td>
      <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: 700;">${fmtMonths(district_agg.median_months)}</td>
      <td style="padding: 8px 12px; color: #D4D4D8; font-size: 12px;">Middle case — 50% got more, 50% got less</td>
    </tr>
    <tr style="border-bottom: 1px solid #1C1917;">
      <td style="padding: 8px 12px; color: #D4D4D8;">75th percentile</td>
      <td style="padding: 8px 12px; color: #F87171; text-align: right;">${fmtMonths(district_agg.p75_months)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; font-size: 12px;">Upper quarter of cases</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; color: #D4D4D8;">90th percentile</td>
      <td style="padding: 8px 12px; color: #EF4444; text-align: right; font-weight: 600;">${fmtMonths(district_agg.p90_months)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; font-size: 12px;">Top 10% — severe outcomes</td>
    </tr>
  </tbody></table>`;

  // Monte Carlo histogram
  if (data.histogram.length > 0) {
    body += sectionHeader("Monte Carlo Simulation (1,000 outcomes)");
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">
      1,000 synthetic outcomes drawn from the percentile distribution above.
      Bars show how frequently each sentence range appeared.
    </p>`;
    const maxCount = Math.max(...data.histogram.map((h) => h.count));
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-family: monospace; font-size: 12px;">`;
    for (const bin of data.histogram) {
      const pct = maxCount === 0 ? 0 : (bin.count / maxCount) * 100;
      const rangeLabel = `${bin.range_start.toFixed(0)}-${bin.range_end.toFixed(0)} mo`;
      body += `<tr>
        <td style="padding: 2px 8px; color: #A1A1AA; text-align: right; width: 100px;">${escapeHtml(rangeLabel)}</td>
        <td style="padding: 2px 0;">
          <div style="background: #F59E0B; height: 14px; width: ${pct.toFixed(1)}%;"></div>
        </td>
        <td style="padding: 2px 8px; color: #78716C; width: 60px;">${bin.count}</td>
      </tr>`;
    }
    body += `</table>`;
  }

  // Departure rates
  body += sectionHeader("Departure Rates");
  body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">
    How often judges in this bucket departed from the guideline sentence.
  </p>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <thead><tr style="background: #1C1917;">
      <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Departure type</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Rate</th>
      <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Meaning</th>
    </tr></thead><tbody>
    <tr style="border-bottom: 1px solid #1C1917;">
      <td style="padding: 8px 12px; color: #22C55E;">Downward departure</td>
      <td style="padding: 8px 12px; color: #22C55E; text-align: right; font-weight: 600;">${fmtPct(district_agg.downward_departure_rate)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; font-size: 12px;">Judge sentenced below the guideline</td>
    </tr>
    <tr style="border-bottom: 1px solid #1C1917;">
      <td style="padding: 8px 12px; color: #EF4444;">Upward departure</td>
      <td style="padding: 8px 12px; color: #EF4444; text-align: right; font-weight: 600;">${fmtPct(district_agg.upward_departure_rate)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; font-size: 12px;">Judge sentenced above the guideline</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; color: #4ADE80;">Probation only</td>
      <td style="padding: 8px 12px; color: #4ADE80; text-align: right; font-weight: 600;">${fmtPct(district_agg.probation_rate)}</td>
      <td style="padding: 8px 12px; color: #A1A1AA; font-size: 12px;">No prison time — probation sentence</td>
    </tr>
  </tbody></table>`;

  // National comparison
  if (national_agg && districtDisplay) {
    body += sectionHeader("National Comparison");
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">
      How this district compares to national averages for the same offense + criminal history.
    </p>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Metric</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">${escapeHtml(districtDisplay.short_name)}</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">National</th>
      </tr></thead><tbody>
      <tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">Median sentence</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: 600;">${fmtMonths(district_agg.median_months)}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${fmtMonths(national_agg.median_months)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">Mean sentence</td>
        <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${fmtMonths(district_agg.mean_months)}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${fmtMonths(national_agg.mean_months)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">Downward departure rate</td>
        <td style="padding: 8px 12px; color: #22C55E; text-align: right;">${fmtPct(district_agg.downward_departure_rate)}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${fmtPct(national_agg.downward_departure_rate)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #D4D4D8;">Probation rate</td>
        <td style="padding: 8px 12px; color: #4ADE80; text-align: right;">${fmtPct(district_agg.probation_rate)}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${fmtPct(national_agg.probation_rate)}</td>
      </tr>
    </tbody></table>`;
  }

  // Per-year trend
  if (data.per_year.length > 1) {
    body += sectionHeader("Per-Fiscal-Year Trend");
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Fiscal year</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Median</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Mean</th>
      </tr></thead><tbody>`;
    for (const y of data.per_year) {
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 6px 12px; color: #D4D4D8;">FY${2000 + y.fy}</td>
        <td style="padding: 6px 12px; color: #A1A1AA; text-align: right;">${y.n}</td>
        <td style="padding: 6px 12px; color: #FAFAF9; text-align: right;">${fmtMonths(y.median_months)}</td>
        <td style="padding: 6px 12px; color: #D4D4D8; text-align: right;">${fmtMonths(y.mean_months)}</td>
      </tr>`;
    }
    body += `</tbody></table>`;
  }

  // Attorney question prompt (UPL-safe). Only emit the probation question
  // when the rate is populated — otherwise it renders as "Is probation
  // realistic given the — probation rate…" which reads like a data bug.
  const attorneyQuestions: string[] = [
    "&ldquo;Given this distribution, what case-specific facts might position me at the lower percentiles?&rdquo;",
    "&ldquo;How does the downward departure rate in this district compare to the national rate, and what grounds qualify?&rdquo;",
  ];
  if (district_agg.probation_rate != null) {
    attorneyQuestions.push(
      `&ldquo;Is probation realistic given the ${fmtPct(district_agg.probation_rate)} probation rate in this bucket?&rdquo;`,
    );
  }
  body += `<div style="background: #1C1917; border-left: 4px solid #F59E0B; padding: 16px 20px; margin-bottom: 24px; border-radius: 4px;">
    <p style="color: #FAFAF9; font-weight: 600; margin: 0 0 8px;">Questions to bring to your attorney</p>
    <ul style="color: #D4D4D8; font-size: 13px; margin: 0; padding-left: 20px;">
${attorneyQuestions.map((q, i) => `      <li${i < attorneyQuestions.length - 1 ? ' style="margin-bottom: 6px;"' : ""}>${q}</li>`).join("\n")}
    </ul>
  </div>`;

  // Statistical caveat for multi-year aggregates — the percentile fields
  // shown above are WEIGHTED AVERAGES of per-year percentiles across the
  // FY range, not percentiles of the pooled sample. For single-FY buckets
  // the distinction doesn't matter; for multi-year, sophisticated viewers
  // should read the per-year table below to see the true spread.
  if (data.per_year.length > 1) {
    body += `<p style="color: #78716C; font-size: 12px; margin-bottom: 16px; font-style: italic;">
      Percentiles shown are weighted averages across ${data.per_year.length} fiscal years.
      The per-year breakdown below preserves annual detail when year-over-year
      variance matters.
    </p>`;
  }

  body += `<p style="color: #71717A; font-size: 12px; margin: 0 0 24px;">
    Source: U.S. Sentencing Commission Individual Offender Datafiles, FY2014-FY2024 (13,131 district-level buckets).
    <a href="https://www.ussc.gov/research/datafiles/commission-datafiles" style="color: #F59E0B;">[source]</a>
  </p>`;

  const title = districtDisplay
    ? `Federal Sentencing Distribution, ${district_agg.offguide_label} in ${districtDisplay.short_name}`
    : `Federal Sentencing Distribution, ${district_agg.offguide_label} (National)`;
  return wrapReport(title, body, totalSources);
}

// ============================================================
// DISTRICT COURT INTELLIGENCE
// ============================================================

export function renderDistrictCourtIntel(data: DistrictCourtIntelData): string {
  let totalSources = 0;
  let body = "";

  // District Overview, Judge Demographics Aggregate
  body += sectionHeader(`Federal Court Overview, ${escapeHtml(data.stateName)}`);
  if (data.judges.length > 0) {
    const partyCount = new Map<string, number>();
    const genderCount = new Map<string, number>();
    const districts = new Set<string>();
    for (const j of data.judges) {
      if (j.district) districts.add(j.district);
      const party = j.appointing_party ?? "Unknown";
      partyCount.set(party, (partyCount.get(party) ?? 0) + 1);
      const gender = j.gender ?? "Unknown";
      genderCount.set(gender, (genderCount.get(gender) ?? 0) + 1);
    }

    body += `<p style="color: #D4D4D8; margin-bottom: 16px;">
      <strong style="color: #F59E0B;">${data.judges.length}</strong> federal judges across
      <strong style="color: #F59E0B;">${districts.size}</strong> district${districts.size !== 1 ? "s" : ""} in ${escapeHtml(data.stateName)}.
      Source: JUSTFAIR (QSIDE Institute). <a href="https://osf.io/nseh5/" style="color: #F59E0B;">[source]</a>
    </p>`;

    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Appointing Party</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Judges</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">% of Bench</th>
      </tr></thead><tbody>`;
    for (const [party, count] of [...partyCount.entries()].sort((a, b) => b[1] - a[1])) {
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(party)}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${count}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${((count / data.judges.length) * 100).toFixed(0)}%</td>
      </tr>`;
    }
    body += `</tbody></table>`;
    totalSources++;
  } else {
    body += noDataMessage("federal judge demographics");
  }

  // Outcome Benchmarks
  body += sectionHeader("Case Outcome Benchmarks");
  if (data.outcomeBenchmarks.length > 0) {
    body += `<p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
      How cases are resolved in this jurisdiction vs nationally. Based on BJS and USSC data.
    </p>`;
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Jurisdiction</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Conviction</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Dismissal</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Plea Rate</th>
      </tr></thead><tbody>`;

    for (const row of data.outcomeBenchmarks) {
      totalSources += countSources(row.source_urls);
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(row.jurisdiction_name)} (${escapeHtml(row.jurisdiction_level)})</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.total_cases?.toLocaleString() ?? ", "}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.conviction_rate != null ? `${(Number(row.conviction_rate) * 100).toFixed(1)}%` : ", "}</td>
        <td style="padding: 8px 12px; color: #4ADE80; text-align: right;">${row.dismissal_rate != null ? `${(Number(row.dismissal_rate) * 100).toFixed(1)}%` : ", "}</td>
        <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.plea_rate != null ? `${(Number(row.plea_rate) * 100).toFixed(1)}%` : ", "}</td>
      </tr>`;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("outcome benchmark");
  }

  // Sentencing Distributions
  body += sectionHeader("Sentencing Patterns by Charge Type");
  if (data.sentencingDistributions.length > 0) {
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Charge Type</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">25th %ile</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Median</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">75th %ile</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
      </tr></thead><tbody>`;
    for (const row of data.sentencingDistributions) {
      totalSources += countSources(row.source_urls);
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(row.charge_slug)}</td>
        <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p25 != null ? `${Number(row.p25).toFixed(1)} mo` : ", "}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${row.median_months != null ? `${Number(row.median_months).toFixed(1)} mo` : ", "}</td>
        <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.p75 != null ? `${Number(row.p75).toFixed(1)} mo` : ", "}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.sample_size}</td>
      </tr>`;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("sentencing distribution");
  }

  // Prosecution Patterns (aggregated, no names)
  body += sectionHeader("Prosecution Patterns, Motion Grant Rates");
  if (data.prosecutionPatterns.length > 0) {
    // Aggregate by motion_type
    const byType = new Map<string, { totalGrant: number; totalSize: number }>();
    for (const row of data.prosecutionPatterns) {
      const type = row.motion_type ?? "All Motions";
      const existing = byType.get(type) ?? { totalGrant: 0, totalSize: 0 };
      if (row.grant_rate != null) {
        existing.totalGrant += Number(row.grant_rate) * row.sample_size;
        existing.totalSize += row.sample_size;
      }
      byType.set(type, existing);
      totalSources += countSources(row.source_urls);
    }

    body += `<p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
      Aggregated motion outcomes across all prosecutors in this district. No individual names.
    </p>`;
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Motion Type</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Avg Grant Rate</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Total Cases</th>
      </tr></thead><tbody>`;
    for (const [type, agg] of byType) {
      const avgRate = agg.totalSize > 0 ? (agg.totalGrant / agg.totalSize) : null;
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(type)}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${avgRate != null ? `${avgRate.toFixed(1)}%` : ", "}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${agg.totalSize.toLocaleString()}</td>
      </tr>`;
    }
    body += `</tbody></table>`;
  } else {
    body += noDataMessage("prosecution pattern");
  }

  return wrapReport(`District Court Intelligence, ${data.stateName}`, body, totalSources);
}

// ============================================================
// ARREST SURVIVAL KIT
// ============================================================

const RIGHTS_CHECKLIST = [
  { right: "Right to Remain Silent (5th Amendment)", detail: "You do not have to answer questions beyond identifying information. Anything you say can and will be used against you." },
  { right: "Right to an Attorney (6th Amendment)", detail: "You have the right to an attorney. If you cannot afford one, one will be appointed. Invoke this clearly: 'I want a lawyer.'" },
  { right: "Right Against Unreasonable Search (4th Amendment)", detail: "Officers generally need a warrant to search you, your car, or your home. Exceptions exist (plain view, consent, search incident to arrest)." },
  { right: "Right to Know the Charges", detail: "You have the right to be informed of the charges against you." },
  { right: "Right to a Phone Call", detail: "After booking, you have the right to make a phone call. Use it to contact an attorney or someone who can arrange bail." },
  { right: "Right to Refuse Consent to Search", detail: "You can refuse a search. Say clearly: 'I do not consent to a search.' Officers may search anyway, your refusal is on the record." },
  { right: "Right to Medical Attention", detail: "If you are injured or ill, you have the right to receive medical attention while in custody." },
  { right: "Right to Bail (in most cases)", detail: "For most non-capital offenses, you have the right to bail. Bail amounts are set by a judge at your first appearance." },
];

const FIRST_48_HOURS = [
  { time: "0–1 hours", action: "Invoke your right to silence. Say: 'I want a lawyer.' Do not discuss your case with anyone." },
  { time: "1–4 hours", action: "During booking, provide only identifying information. Do not sign anything without reading it." },
  { time: "4–8 hours", action: "Use your phone call to contact an attorney. If you cannot reach one, contact family to arrange one." },
  { time: "8–24 hours", action: "Do not discuss your case with cellmates or officers. Write down everything you remember about the arrest while it is fresh." },
  { time: "24–48 hours", action: "Prepare for your first appearance/arraignment. Your attorney (or public defender) should be present. Bail will be addressed." },
  { time: "After release", action: "Document everything immediately: officer names, badge numbers, what was said, timeline of events. Photograph any injuries." },
];

export function renderArrestSurvivalKit(data: ArrestSurvivalKitData): string {
  let totalSources = 0;
  let body = "";

  // Your Rights During Arrest
  body += sectionHeader("Your Constitutional Rights During Arrest");
  body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 16px;">
    These rights apply in every state. Know them before you need them.
  </p>`;

  for (const item of RIGHTS_CHECKLIST) {
    body += `
      <div style="margin-bottom: 12px; padding: 12px 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <p style="color: #FAFAF9; font-weight: bold; margin: 0 0 4px;">${escapeHtml(item.right)}</p>
        <p style="color: #A1A1AA; font-size: 13px; margin: 0;">${escapeHtml(item.detail)}</p>
      </div>
    `;
  }

  // First 48 Hours Timeline
  body += sectionHeader("The First 48 Hours, What to Do and When");
  body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <thead><tr style="background: #1C1917;">
      <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px; width: 120px;">Timeframe</th>
      <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Action</th>
    </tr></thead><tbody>`;
  for (const step of FIRST_48_HOURS) {
    body += `<tr style="border-bottom: 1px solid #1C1917;">
      <td style="padding: 8px 12px; color: #F59E0B; font-weight: bold; vertical-align: top;">${escapeHtml(step.time)}</td>
      <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(step.action)}</td>
    </tr>`;
  }
  body += `</tbody></table>`;

  // What NOT to Say
  body += sectionHeader("What NOT to Say, 5 Statements That Hurt Defendants");
  const badStatements = [
    { statement: '"I didn\'t do anything wrong"', why: "Implies you know what 'wrong' means in this context. Say nothing instead." },
    { statement: '"Can I just explain what happened?"', why: "Explanations become confessions. Wait for your attorney." },
    { statement: '"I know my rights"', why: "Then exercise them silently. Stating this often precedes a waiver." },
    { statement: '"I\'ll cooperate"', why: "Cooperation without an attorney present means giving up leverage your attorney could use." },
    { statement: '"Off the record..."', why: "Nothing is off the record. Everything you say is evidence." },
  ];
  for (const item of badStatements) {
    body += `
      <div style="margin-bottom: 12px; padding: 12px 16px; border-left: 3px solid #EF4444; background: #1C1917;">
        <p style="color: #EF4444; font-weight: bold; margin: 0 0 4px;">${escapeHtml(item.statement)}</p>
        <p style="color: #A1A1AA; font-size: 13px; margin: 0;">${escapeHtml(item.why)}</p>
      </div>
    `;
  }

  // Agency Data (if available)
  if (data.agencyIncidents.length > 0) {
    body += sectionHeader(`Agency Incident Data, ${escapeHtml(data.stateName)}`);
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">
      Fatal encounters involving law enforcement agencies in your state since 2013.
      Agency-level data from Fatal Encounters database.
      <a href="https://fatalencounters.org/" style="color: #F59E0B;">[source]</a>
    </p>`;

    for (const ai of data.agencyIncidents.slice(0, 10)) {
      totalSources += countSources(ai.source_urls);
      body += `
        <div style="background: #1C1917; border: 1px solid #92400E; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <p style="color: #FBBF24; font-weight: bold; margin: 0 0 8px;">${escapeHtml(ai.agency)}</p>
          <p style="color: #D4D4D8; margin: 0;">${ai.use_of_force_count} fatal encounter${ai.use_of_force_count !== 1 ? "s" : ""} recorded since 2013</p>
        </div>
      `;
    }
  }

  // Officer Stats Summary
  if (data.officerStats.totalOfficers > 0) {
    body += sectionHeader("Officer Intelligence Coverage");
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Agencies with officer data</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${data.officerStats.totalAgencies}</td></tr>
      <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Officers in database</td>
          <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${data.officerStats.totalOfficers.toLocaleString()}</td></tr>
      ${data.officerStats.wanderingOfficerCount > 0 ? `
      <tr><td style="padding: 8px 16px; color: #A1A1AA;">Wandering officers flagged</td>
          <td style="padding: 8px 16px; color: #EF4444; font-weight: bold;">${data.officerStats.wanderingOfficerCount}</td></tr>
      ` : ""}
    </table>`;
  }

  // Upsell to Officer Background Check
  body += `
    <div style="background: #1C1917; border: 1px solid #422006; border-radius: 8px; padding: 20px; margin-top: 32px; text-align: center;">
      <p style="color: #F59E0B; font-weight: bold; font-size: 16px; margin: 0 0 8px;">Know Your Arresting Officer</p>
      <p style="color: #A1A1AA; font-size: 14px; margin: 0 0 16px;">
        Get a full background check on your arresting officer, cross-case reliability, testimony challenges,
        Brady violations, and employment history.
      </p>
      <a href="https://imnotanattorney.com/officer-background-check"
         style="display: inline-block; background: #F59E0B; color: #0C0A09; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
        Officer Background Check, $97
      </a>
    </div>
  `;

  return wrapReport(`Arrest Survival Kit, ${data.stateName}`, body, totalSources);
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
