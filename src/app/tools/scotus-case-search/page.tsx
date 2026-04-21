/**
 * @fileoverview /tools/scotus-case-search — free SCOTUS research tool.
 *
 * Server-rendered search over 8,411 SCOTUS cases (Oyez source via walkerdb).
 * Free, ungated. Generates MOFU organic traffic that feeds into paid tiers
 * (Similar Cases Analyzer, Federal Sentencing Distribution, etc.).
 *
 * UPL-safe per content rules: returns Oyez facts / questions / holdings
 * (information), never advice. Every result links to the authoritative
 * opinion on Justia.
 *
 * Rate limiting: this page rate-limits the same bucket as the API route
 * (PR #21 code-review finding #1) so a crawler hitting /tools/...?q=X
 * repeatedly can't bypass the API's 60/5min guard by targeting the page.
 *
 * See plan at ImNotAnAttorney/docs/plans/2026-04-21-walkerdb-scotus-ingest.md.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ScotusSearchResult } from "@/app/api/tools/scotus-case-search/route";

export const metadata: Metadata = {
  title: "SCOTUS Case Search — Free Tool | ImNotAnAttorney",
  description:
    "Search 8,400+ Supreme Court cases by issue, party, or keyword. Facts, questions, and holdings in plain English — sourced from Oyez.",
  alternates: {
    canonical: "/tools/scotus-case-search",
  },
  openGraph: {
    title: "Free SCOTUS Case Search",
    description:
      "Search 8,400+ Supreme Court cases. Facts, questions, holdings — in plain English.",
    type: "website",
    url: "/tools/scotus-case-search",
  },
};

interface PageProps {
  searchParams: Promise<{
    q?: string;
    year_from?: string;
    year_to?: string;
  }>;
}

const YEAR_RE = /^\d{4}$/;
const DEFAULT_LIMIT = 20;

function getIpFromHeaders(h: Headers): string {
  return (
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

export default async function ScotusCaseSearchPage({ searchParams }: PageProps) {
  const { q = "", year_from = "", year_to = "" } = await searchParams;

  const trimmedQ = q.trim().slice(0, 300);
  const validYearFrom = YEAR_RE.test(year_from) ? year_from : null;
  const validYearTo = YEAR_RE.test(year_to) ? year_to : null;
  const yearRangeInvalid =
    !!(validYearFrom && validYearTo) && Number(validYearFrom) > Number(validYearTo);

  // Rate limit: the page bypasses the API route's rate limiter if we hit the
  // RPC directly. Mirror the same bucket + limit so a crawler can't abuse the
  // page URL to flood Supabase with FTS queries (code-review finding #1).
  const h = await headers();
  const ip = getIpFromHeaders(h);
  const supabase = createAdminClient();
  const { limited } = await checkRateLimit(supabase, `scotus-search-page:${ip}`, 60, 300);

  const results: ScotusSearchResult[] = [];
  let errorMessage: string | null = null;
  let rateLimited = false;

  if (limited) {
    rateLimited = true;
    errorMessage = "You've hit the search rate limit. Try again in a minute.";
  } else if (yearRangeInvalid) {
    errorMessage = "From year must be less than or equal to To year.";
  } else if (trimmedQ === "" && !validYearFrom && !validYearTo) {
    // No query + no filters → don't touch the DB. Empty state instead.
    // (code-review finding #10: rank=0 + limit 20 otherwise returns 20
    // year-sorted cases that the page hides anyway.)
  } else {
    const { data, error } = await supabase.rpc("scotus_case_search", {
      q: trimmedQ === "" ? null : trimmedQ,
      year_from: validYearFrom,
      year_to: validYearTo,
      result_limit: DEFAULT_LIMIT,
    });
    if (error) {
      errorMessage = "Search temporarily unavailable. Try again in a moment.";
    } else if (data) {
      results.push(...(data as ScotusSearchResult[]));
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <header className="mb-8">
          <h1 id="page-title" className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            SCOTUS Case Search
          </h1>
          <p className="text-zinc-300">
            Search 8,400+ Supreme Court cases. Facts, questions, and holdings in plain English,
            sourced from Oyez. Free. No email required.
          </p>
        </header>

        <form
          method="GET"
          action="/tools/scotus-case-search"
          className="mb-8 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end"
          aria-labelledby="page-title"
        >
          <div>
            <label htmlFor="q" className="block text-sm text-zinc-300 mb-1">
              Search terms
            </label>
            <input
              type="text"
              id="q"
              name="q"
              defaultValue={trimmedQ}
              maxLength={300}
              placeholder="miranda warnings"
              autoComplete="off"
              className="w-full rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="year_from" className="block text-sm text-zinc-300 mb-1">
              From year
            </label>
            <input
              type="text"
              id="year_from"
              name="year_from"
              inputMode="numeric"
              defaultValue={validYearFrom ?? ""}
              placeholder="2000"
              autoComplete="off"
              className="w-24 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="year_to" className="block text-sm text-zinc-300 mb-1">
              To year
            </label>
            <input
              type="text"
              id="year_to"
              name="year_to"
              inputMode="numeric"
              defaultValue={validYearTo ?? ""}
              placeholder="2025"
              autoComplete="off"
              className="w-24 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-900 font-semibold px-5 py-2"
          >
            Search
          </button>
        </form>

        {errorMessage ? (
          <p
            role={rateLimited ? "status" : "alert"}
            className="rounded-md bg-red-950 border border-red-700 text-red-200 p-4 mb-6"
          >
            {errorMessage}
          </p>
        ) : null}

        <section aria-label="Search results">
          <h2 className="sr-only">Search results</h2>
          {results.length === 0 && !errorMessage ? (
            trimmedQ ? (
              <p className="text-zinc-400">
                No cases matched <q>{trimmedQ}</q> in the selected year range.
              </p>
            ) : (
              <p className="text-zinc-400">Type a query above to search.</p>
            )
          ) : null}
          <ul className="space-y-6 list-none p-0">
            {results.map((r) => (
              <li key={r.case_id}>
                <ScotusResultCard r={r} />
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-16 border-t border-zinc-800 pt-6 text-xs text-zinc-400 space-y-2">
          <h2 className="sr-only">Attribution and disclaimer</h2>
          <p>
            Sourced from{" "}
            <a
              href="https://www.oyez.org/"
              className="text-emerald-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Oyez
            </a>{" "}
            via{" "}
            <a
              href="https://github.com/walkerdb/supreme_court_transcripts"
              className="text-emerald-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              walkerdb/supreme_court_transcripts
            </a>{" "}
            (8,411 cases, 1793-2025).
          </p>
          <p>
            This tool returns legal INFORMATION, not legal advice. Oyez
            summaries reflect their editorial interpretation; the authoritative
            source for any holding is the underlying opinion (linked to Justia).
            Decisions about how to use this information stay with you and your
            attorney.
          </p>
        </footer>
      </div>
    </main>
  );
}

const OYEZ_CANONICAL_HOSTS = new Set(["api.oyez.org", "www.oyez.org", "oyez.org"]);

function safeOyezUrl(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    if (!OYEZ_CANONICAL_HOSTS.has(u.hostname)) return null;
    // Rewrite the API host to the public-facing site without relying on
    // naive string replace (code-review finding #8 — avoids open-redirect
    // if Oyez ever returns a host like api.oyez.org.evil.example).
    const rewritten = new URL(u.toString());
    if (rewritten.hostname === "api.oyez.org") {
      rewritten.hostname = "www.oyez.org";
    }
    return rewritten.toString();
  } catch {
    return null;
  }
}

function ScotusResultCard({ r }: { r: ScotusSearchResult }) {
  const citation =
    r.citation_volume && r.citation_page
      ? `${r.citation_volume} U.S. ${r.citation_page}${r.citation_year ? ` (${r.citation_year})` : ""}`
      : r.citation_year
        ? `(${r.citation_year})`
        : null;

  const oyezUrl = safeOyezUrl(r.oyez_href);

  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <header className="mb-3">
        <h3 className="text-xl font-semibold text-zinc-100">
          {r.name ?? "(unnamed case)"}
        </h3>
        {citation ? (
          <p className="text-sm text-zinc-400 mt-1">{citation}</p>
        ) : null}
      </header>

      {r.question_snippet ? (
        <div className="mb-3">
          <h4 className="text-xs uppercase tracking-wider text-emerald-400 mb-1">
            Question
          </h4>
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">
            {r.question_snippet}
          </p>
        </div>
      ) : null}

      {r.facts_snippet ? (
        <div className="mb-3">
          <h4 className="text-xs uppercase tracking-wider text-emerald-400 mb-1">
            Facts
          </h4>
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">
            {r.facts_snippet}
          </p>
        </div>
      ) : null}

      {r.conclusion_snippet ? (
        <div className="mb-3">
          <h4 className="text-xs uppercase tracking-wider text-emerald-400 mb-1">
            Holding / conclusion
          </h4>
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">
            {r.conclusion_snippet}
          </p>
        </div>
      ) : null}

      <footer className="mt-4 flex flex-wrap gap-3 text-sm">
        {r.justia_url ? (
          <a
            href={r.justia_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline"
          >
            Read full opinion (Justia) →
          </a>
        ) : null}
        {oyezUrl ? (
          <a
            href={oyezUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline"
          >
            Oyez page →
          </a>
        ) : null}
      </footer>

      <CtaRow />
    </article>
  );
}

function CtaRow() {
  return (
    <div className="mt-4 pt-4 border-t border-zinc-800 text-xs text-zinc-400">
      Researching a federal case?{" "}
      <Link
        href="/intake/standalone/federal-sentencing-distribution"
        className="text-emerald-400 hover:underline"
      >
        Get a Federal Sentencing Distribution Report →
      </Link>
    </div>
  );
}
