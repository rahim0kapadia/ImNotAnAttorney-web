/**
 * @file /api/cron/ao-d3-sync — Quarterly AO federal district criminal-by-offense refresh.
 *
 * Source: https://www.uscourts.gov/sites/default/files/document/stfj_d3_<MMDD>.<YYYY>.xlsx
 * AO publishes D-3 each quarter-end (3/31, 6/30, 9/30, 12/31). Each quarterly
 * XLSX covers the rolling 12-month period ending that quarter.
 *
 * Strategy: probe the four quarter-end URLs for the last ~18 months (6 probes),
 * download the most recent 200 OK, parse, upsert. Idempotent — ON CONFLICT DO
 * UPDATE keeps prior periods intact while adding/refreshing the new one.
 *
 * Auth: requireCron (Bearer CRON_AUTH_TOKEN).
 * Schedule: first Monday after each quarter-end + month grace (7th of Jan/Apr/Jul/Oct)
 *   via cron-job.org (registered via scripts/register-ao-d3-sync-cron.mjs).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const USER_AGENT = "ImNotAnAttorney AO D-3 sync (support@imnotanattorney.com)";

const QUARTER_ENDS = [
  { mm: "03", dd: "31" },
  { mm: "06", dd: "30" },
  { mm: "09", dd: "30" },
  { mm: "12", dd: "31" },
] as const;

function candidatePeriods(): string[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const out: string[] = [];
  // Probe in reverse-chronological order: current-year quarters down to prior-year Q4.
  for (let delta = 0; delta <= 1; delta++) {
    const year = y - delta;
    for (let i = QUARTER_ENDS.length - 1; i >= 0; i--) {
      const { mm, dd } = QUARTER_ENDS[i];
      out.push(`${mm}${dd}.${year}`);
    }
  }
  return out;
}

function urlFor(period: string): string {
  return `https://www.uscourts.gov/sites/default/files/document/stfj_d3_${period}.xlsx`;
}

function periodToIsoDate(period: string): string {
  const m = period.match(/^(\d{2})(\d{2})\.(\d{4})$/);
  if (!m) throw new Error(`invalid period: ${period}`);
  return `${m[3]}-${m[1]}-${m[2]}`;
}

// Column index → offense slug (layout locked 2026-04-24 per D-3 inspection).
const OFFENSE_COLUMNS: Array<{ col: number; slug: string }> = [
  { col: 2, slug: "homicide" },
  { col: 3, slug: "robbery" },
  { col: 4, slug: "assault" },
  { col: 5, slug: "other_violent" },
  { col: 6, slug: "burglary_larceny_theft" },
  { col: 7, slug: "embezzlement" },
  { col: 8, slug: "fraud" },
  { col: 9, slug: "forgery_counterfeiting" },
  { col: 10, slug: "other_property" },
  { col: 11, slug: "marijuana" },
  { col: 12, slug: "all_other_drugs" },
  { col: 13, slug: "firearms_explosives" },
  { col: 14, slug: "sex_offenses" },
  { col: 15, slug: "justice_system" },
  { col: 16, slug: "improper_reentry_alien" },
  { col: 17, slug: "other_immigration" },
  { col: 18, slug: "general" },
  { col: 19, slug: "regulatory" },
  { col: 20, slug: "traffic" },
];

const CIRCUIT_FOR_DISTRICT: Record<string, number> = {
  "DC": 12,
  "ME": 1, "MA": 1, "NH": 1, "RI": 1, "PR": 1,
  "CT": 2, "NY,N": 2, "NY,E": 2, "NY,S": 2, "NY,W": 2, "VT": 2,
  "DE": 3, "NJ": 3, "PA,E": 3, "PA,M": 3, "PA,W": 3, "VI": 3,
  "MD": 4, "NC,E": 4, "NC,M": 4, "NC,W": 4, "SC": 4, "VA,E": 4, "VA,W": 4, "WV,N": 4, "WV,S": 4,
  "LA,E": 5, "LA,M": 5, "LA,W": 5, "MS,N": 5, "MS,S": 5, "TX,N": 5, "TX,E": 5, "TX,S": 5, "TX,W": 5,
  "KY,E": 6, "KY,W": 6, "MI,E": 6, "MI,W": 6, "OH,N": 6, "OH,S": 6, "TN,E": 6, "TN,M": 6, "TN,W": 6,
  "IL,N": 7, "IL,C": 7, "IL,S": 7, "IN,N": 7, "IN,S": 7, "WI,E": 7, "WI,W": 7,
  "AR,E": 8, "AR,W": 8, "IA,N": 8, "IA,S": 8, "MN": 8, "MO,E": 8, "MO,W": 8, "NE": 8, "ND": 8, "SD": 8,
  "AK": 9, "AZ": 9, "CA,N": 9, "CA,E": 9, "CA,C": 9, "CA,S": 9, "HI": 9, "ID": 9, "MT": 9, "NV": 9,
  "OR": 9, "WA,E": 9, "WA,W": 9, "GU": 9, "NMI": 9,
  "CO": 10, "KS": 10, "NM": 10, "OK,N": 10, "OK,E": 10, "OK,W": 10, "UT": 10, "WY": 10,
  "AL,N": 11, "AL,M": 11, "AL,S": 11, "FL,N": 11, "FL,M": 11, "FL,S": 11, "GA,N": 11, "GA,M": 11, "GA,S": 11,
};

const DISTRICT_TO_STATE: Record<string, string> = { "NMI": "MP" };

function parseDistrictLabel(label: unknown): { district_code: string; state_code: string; division: string | null; circuit: number } | null {
  if (typeof label !== "string") return null;
  const s = label.trim();
  if (!s || s === "Total") return null;
  if (/^\s+\d/.test(label)) return null;
  if (s.length > 50) return null;
  if (!CIRCUIT_FOR_DISTRICT[s]) return null;
  const commaIdx = s.indexOf(",");
  let stateCode: string;
  let division: string | null = null;
  if (commaIdx > 0) {
    stateCode = s.slice(0, commaIdx).trim();
    division = s.slice(commaIdx + 1).trim();
  } else {
    stateCode = DISTRICT_TO_STATE[s] || s;
  }
  if (stateCode.length !== 2 && stateCode !== "NMI") return null;
  if (stateCode === "NMI") stateCode = "MP";
  return { district_code: s, state_code: stateCode, division, circuit: CIRCUIT_FOR_DISTRICT[s] };
}

function parseCountCell(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!t || t === "-" || t === "—" || t.toUpperCase() === "N/A") return null;
  const clean = t.replace(/,/g, "");
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : null;
}

async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_ATLAS_BOT_TOKEN;
  const chat = process.env.TELEGRAM_RAHIM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: message, parse_mode: "Markdown" }),
    });
  } catch {
    /* swallow */
  }
}

export async function GET(req: NextRequest) {
  const authed = requireCron(req);
  if (!authed.authorized) return authed.error;

  const started = Date.now();

  // 1) Probe candidate periods HEAD-first until we find the latest 200.
  let chosenPeriod: string | null = null;
  let chosenUrl: string | null = null;
  for (const period of candidatePeriods()) {
    const url = urlFor(period);
    try {
      const head = await fetch(url, { method: "HEAD", headers: { "User-Agent": USER_AGENT } });
      if (head.ok) {
        chosenPeriod = period;
        chosenUrl = url;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!chosenPeriod || !chosenUrl) {
    return NextResponse.json({ error: "no AO D-3 quarter-end URL returned 200 in last 6 quarters" }, { status: 502 });
  }

  const periodEnd = periodToIsoDate(chosenPeriod);
  const supabase = createAdminClient();

  // 2) Skip if this period is already loaded (idempotent — check head row).
  const { count: existingCount } = await supabase
    .from("ao_district_criminal_by_offense")
    .select("*", { count: "exact", head: true })
    .eq("period_end", periodEnd);
  if ((existingCount ?? 0) >= 94 * OFFENSE_COLUMNS.length * 0.9) {
    return NextResponse.json({
      ok: true,
      skipped: "period already loaded",
      period_end: periodEnd,
      existing_count: existingCount,
      elapsed_ms: Date.now() - started,
    });
  }

  // 3) Download + parse XLSX.
  const resp = await fetch(chosenUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!resp.ok) {
    return NextResponse.json({ error: `HTTP ${resp.status} on ${chosenUrl}` }, { status: 502 });
  }
  const buf = Buffer.from(await resp.arrayBuffer());

  // Dynamic import — keeps cold-start cost off other cron routes.
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, defval: null, raw: false });

  const records: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const parsed = parseDistrictLabel(row[0]);
    if (!parsed) continue;
    for (const { col, slug } of OFFENSE_COLUMNS) {
      records.push({
        district_code: parsed.district_code,
        state_code: parsed.state_code,
        division: parsed.division,
        circuit: parsed.circuit,
        period_end: periodEnd,
        offense_category: slug,
        defendant_count: parseCountCell(row[col]),
        source_url: chosenUrl,
      });
    }
  }

  if (records.length === 0) {
    return NextResponse.json({ error: "parsed 0 records from XLSX", period_end: periodEnd, url: chosenUrl }, { status: 500 });
  }

  // 4) Upsert in chunks of 500 (Supavisor payload cap).
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = records.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("ao_district_criminal_by_offense")
      .upsert(batch, { onConflict: "district_code,period_end,offense_category" });
    if (error) {
      return NextResponse.json({ error: `upsert failed at offset ${i}: ${error.message}` }, { status: 500 });
    }
    upserted += batch.length;
  }

  const { count: finalCount } = await supabase
    .from("ao_district_criminal_by_offense")
    .select("*", { count: "exact", head: true })
    .eq("period_end", periodEnd);

  const newRows = (finalCount ?? 0) - (existingCount ?? 0);
  if (newRows > 0) {
    await sendTelegram(
      `AO D-3 sync: period ${periodEnd} loaded (+${newRows} rows, total ${finalCount}). Source: ${chosenUrl}`,
    );
  }

  return NextResponse.json({
    ok: true,
    period_end: periodEnd,
    source_url: chosenUrl,
    parsed_rows: records.length,
    upserted,
    existing_count: existingCount ?? 0,
    final_count: finalCount ?? 0,
    new_rows: newRows,
    elapsed_ms: Date.now() - started,
  });
}
