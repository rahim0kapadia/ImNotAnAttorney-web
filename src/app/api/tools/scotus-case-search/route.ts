/**
 * @fileoverview GET /api/tools/scotus-case-search — free SCOTUS case search.
 *
 * Query params:
 *   q          text query — websearch_to_tsquery syntax (quotes, OR, -negation)
 *   year_from  4-digit year lower bound on citation_year (optional)
 *   year_to    4-digit year upper bound on citation_year (optional)
 *   limit      1..50 (default 20)
 *
 * Response:
 *   { results: SearchResult[], query: { q, year_from, year_to, limit } }
 *
 * Data: public.scotus_cases (8,411 Oyez-sourced SCOTUS cases). See plan at
 * ImNotAnAttorney/docs/plans/2026-04-21-walkerdb-scotus-ingest.md.
 *
 * UPL-safe — returns information (case facts, questions, holdings) and
 * source links (Oyez, Justia). Never advice.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const YEAR_RE = /^\d{4}$/;

export type ScotusSearchResult = {
  case_id: number;
  name: string | null;
  term: string | null;
  citation_year: string | null;
  citation_volume: string | null;
  citation_page: string | null;
  first_party: string | null;
  second_party: string | null;
  facts_snippet: string | null;
  question_snippet: string | null;
  conclusion_snippet: string | null;
  justia_url: string | null;
  oyez_href: string | null;
  decided_date: string | null;
  rank: number;
};

function parseInputs(req: NextRequest): {
  ok: true;
  q: string;
  year_from: string | null;
  year_to: string | null;
  limit: number;
} | { ok: false; error: string } {
  const url = new URL(req.url);
  const rawQ = (url.searchParams.get("q") ?? "").trim();
  const rawYearFrom = url.searchParams.get("year_from");
  const rawYearTo = url.searchParams.get("year_to");
  const rawLimit = url.searchParams.get("limit");

  if (rawQ.length > 300) {
    return { ok: false, error: "q must be ≤ 300 characters" };
  }
  if (rawYearFrom !== null && rawYearFrom !== "" && !YEAR_RE.test(rawYearFrom)) {
    return { ok: false, error: "year_from must be a 4-digit year" };
  }
  if (rawYearTo !== null && rawYearTo !== "" && !YEAR_RE.test(rawYearTo)) {
    return { ok: false, error: "year_to must be a 4-digit year" };
  }

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return { ok: false, error: `limit must be an integer 1..${MAX_LIMIT}` };
    }
    limit = parsed;
  }

  return {
    ok: true,
    q: rawQ,
    year_from: rawYearFrom && YEAR_RE.test(rawYearFrom) ? rawYearFrom : null,
    year_to: rawYearTo && YEAR_RE.test(rawYearTo) ? rawYearTo : null,
    limit,
  };
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const supabase = createAdminClient();

  const { limited } = await checkRateLimit(supabase, `scotus-search:${ip}`, 60, 300);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = parseInputs(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { q, year_from, year_to, limit } = parsed;

  const { data, error } = await supabase.rpc("scotus_case_search", {
    q: q === "" ? null : q,
    year_from,
    year_to,
    result_limit: limit,
  });

  if (error) {
    console.error("[scotus-case-search] RPC error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const results: ScotusSearchResult[] = (data ?? []) as ScotusSearchResult[];

  return NextResponse.json(
    {
      query: { q, year_from, year_to, limit },
      count: results.length,
      results,
      dataSource:
        "Oyez API via walkerdb/supreme_court_transcripts (8,411 SCOTUS cases, 1793-2025).",
      sourceUrl: "https://github.com/walkerdb/supreme_court_transcripts",
      disclaimer:
        "This search returns legal INFORMATION about Supreme Court cases — not legal advice. Oyez summaries reflect their editorial interpretation; the underlying opinion (linked via Justia) is the authoritative source.",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
