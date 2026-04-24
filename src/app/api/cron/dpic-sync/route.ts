/**
 * @file /api/cron/dpic-sync — Weekly DPIC executions refresh.
 *
 * Source: http://deathpenaltyinfo.org/query/executions.csv (public, no auth).
 * Updated weekdays ~12pm ET. ~1,600 total rows growing ~15-25/year.
 *
 * Strategy: full-fetch → normalize → upsert (one supabase call, no per-row INSERT).
 * ON CONFLICT (execution_date, inmate_name, state_code) keeps idempotent. New rows
 * land; existing rows update only `ingested_at`.
 *
 * Auth: requireCron (Bearer CRON_AUTH_TOKEN).
 * Schedule: Monday 13:00 ET via cron-job.org (registered separately).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { parse as csvParseSync } from "csv-parse/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const SOURCE_URL = "http://deathpenaltyinfo.org/query/executions.csv";

const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA",
  HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA", KANSAS: "KS",
  KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA",
  MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT",
  NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM",
  "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK",
  OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT",
  VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY",
  "DISTRICT OF COLUMBIA": "DC",
};

function pick(row: Record<string, string>, ...names: string[]): string | null {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function parseDateISO(s: string | null): string | null {
  if (!s) return null;
  if (s.length === 10 && s[4] === "-" && s[7] === "-") return s;
  const parts = s.split("/");
  if (parts.length === 3) {
    let [mm, dd, yy] = parts.map((p) => p.trim());
    if (mm.length === 1) mm = "0" + mm;
    if (dd.length === 1) dd = "0" + dd;
    if (yy.length === 2) yy = (parseInt(yy, 10) < 50 ? "20" : "19") + yy;
    if (yy.length === 4) return `${yy}-${mm}-${dd}`;
  }
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

function parseStateCode(s: string | null): string | null {
  if (!s) return null;
  const up = s.trim().toUpperCase();
  if (up === "FEDERAL" || up === "US" || up === "FED" || up === "UNITED STATES") return "US";
  if (up.length === 2 && /^[A-Z]{2}$/.test(up)) return up;
  return STATE_NAME_TO_CODE[up] ?? null;
}

function parseBool(s: string | null): boolean | null {
  if (s === null || s === undefined) return null;
  const t = String(s).trim().toLowerCase();
  if (!t || t === "n/a" || t === "unknown") return null;
  if (["y", "yes", "true", "1"].includes(t)) return true;
  if (["n", "no", "false", "0"].includes(t)) return false;
  return null;
}

function parseList(s: string | null): string[] | null {
  if (!s) return null;
  const out = s.split(/[,;|/]/).map((t) => t.trim()).filter(Boolean);
  return out.length > 0 ? out : null;
}

function composeName(row: Record<string, string>): string | null {
  const parts = [
    row["First Name"] || row["first_name"] || "",
    row["Middle Name(s)"] || row["Middle Name"] || row["middle_name"] || "",
    row["Last Name"] || row["last_name"] || "",
    row["Suffix"] || row["suffix"] || "",
  ].map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : null;
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

  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "ImNotAnAttorney DPIC sync (support@imnotanattorney.com)" },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `DPIC fetch failed: ${res.status} ${res.statusText}` }, { status: 502 });
  }
  const csvText = await res.text();

  const rows = csvParseSync(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const normalized: Array<Record<string, unknown>> = [];
  let skippedNoDate = 0;
  let skippedNoName = 0;
  let skippedNoState = 0;
  for (const r of rows) {
    const execution_date = parseDateISO(pick(r, "Date", "Execution Date", "ExecutionDate", "date"));
    const inmate_name = pick(r, "Name", "Inmate Name", "InmateName", "name") || composeName(r);
    const raw_state = pick(r, "State", "state");
    const state_code = parseStateCode(raw_state);
    if (!execution_date) { skippedNoDate++; continue; }
    if (!inmate_name) { skippedNoName++; continue; }
    if (!state_code) { skippedNoState++; continue; }

    normalized.push({
      execution_date,
      inmate_name,
      inmate_race: pick(r, "Race", "Inmate Race", "race"),
      inmate_sex: (() => {
        const s = pick(r, "Sex", "Inmate Sex", "sex");
        if (!s) return null;
        const c = s.trim().toUpperCase().charAt(0);
        return c === "M" || c === "F" ? c : null;
      })(),
      inmate_age: (() => {
        const s = pick(r, "Age", "Inmate Age", "age");
        if (!s) return null;
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : null;
      })(),
      state_code,
      region: pick(r, "Region", "region"),
      method: pick(r, "Method", "method"),
      federal_flag: parseBool(pick(r, "Federal", "federal")) === true || state_code === "US",
      foreign_national: parseBool(pick(r, "Foreign National", "ForeignNational", "foreign_national")),
      juvenile_at_crime: parseBool(pick(r, "Juvenile", "Juvenile at Crime", "juvenile")),
      volunteer: parseBool(pick(r, "Volunteer", "volunteer")),
      victim_count: (() => {
        const s = pick(r, "Number of Victims", "Victim(s)", "Victim Count", "victim_count");
        if (!s) return null;
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : null;
      })(),
      victim_races: parseList(pick(r, "Victim Race", "Victim Races", "victim_race")),
      victim_sexes: parseList(pick(r, "Victim Sex", "Victim Sexes", "victim_sex")),
      county: pick(r, "County", "county"),
    });
  }

  const supabase = createAdminClient();

  // Pre-count for delta reporting.
  const { count: beforeCount } = await supabase
    .from("dpic_executions")
    .select("*", { count: "exact", head: true });

  // Upsert all rows in chunks — supabase-js handles batching, but an explicit
  // chunk size of 500 keeps requests under the Supavisor payload cap.
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < normalized.length; i += CHUNK) {
    const batch = normalized.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("dpic_executions")
      .upsert(batch, { onConflict: "execution_date,inmate_name,state_code", ignoreDuplicates: true });
    if (error) {
      return NextResponse.json({ error: `upsert failed at offset ${i}: ${error.message}` }, { status: 500 });
    }
    upserted += batch.length;
  }

  const { count: afterCount } = await supabase
    .from("dpic_executions")
    .select("*", { count: "exact", head: true });

  const newRows = (afterCount ?? 0) - (beforeCount ?? 0);
  const elapsedMs = Date.now() - started;

  if (newRows > 0) {
    await sendTelegram(
      `DPIC sync: +${newRows} new execution(s) loaded. Total ${afterCount}. Latest CSV source: ${SOURCE_URL}`,
    );
  }

  return NextResponse.json({
    ok: true,
    source_url: SOURCE_URL,
    parsed_rows: rows.length,
    normalized_rows: normalized.length,
    upserted,
    before_count: beforeCount ?? 0,
    after_count: afterCount ?? 0,
    new_rows: newRows,
    skipped: { no_date: skippedNoDate, no_name: skippedNoName, no_state: skippedNoState },
    elapsed_ms: elapsedMs,
  });
}
