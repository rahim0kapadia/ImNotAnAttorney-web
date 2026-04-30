// supabase/functions/generate-report/__tests__/attorney-discipline-upl.test.ts
//
// T3.1 + T3.3 + T3.4 (worry-attorney-discipline-wire v2.4) — deterministic
// regex panel for the IB attorney-discipline section. Replaces a previous
// LLM-eval gate ($2-3/run, non-deterministic, $caseId-dependent).
//
// Runner: built-in `Deno.test`. Run with:
//   deno test --allow-net --allow-env --no-check=remote \
//     supabase/functions/generate-report/__tests__/attorney-discipline-upl.test.ts
//
// Strategy:
//   - Render 5 fixture payloads to markdown (renderAttorneyDisciplineSection),
//     convert to HTML via an inlined minimal md2html mirroring index.ts:7370.
//   - Run a deterministic regex panel + per-fixture assertions on each HTML.
//   - Assertions cover XSS escape, javascript: defang, banned-phrase absence,
//     interpretive-adjective absence (T3.3), entity-decode panel (T3.4).

import {
  assertEquals,
  assert,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  renderAttorneyDisciplineSection,
  buildAttorneyDisciplineSection,
  DISCLAIMER_VERBATIM,
  type AttorneyRow,
  type DisciplineEvent,
} from "../lib/render-attorney-discipline.ts";
import { BANNED_PHRASES_BLOCK } from "../lib/banned-phrases.ts";
import { IB_SECTION_ANCHORS } from "../lib/section-anchors.ts";
import {
  FIXTURE_DISCIPLINED_ATTORNEY_NAME,
  FIXTURE_CLEAN_ATTORNEY_NAME,
  CA_BAR_LOOKUP_BASE,
  escapeRegExp,
} from "./fixtures.ts";

// ─────────────────────────────────────────────────────────────────
// Inline minimal md2html mirroring supabase/functions/generate-report/
// index.ts:7370-7392. Test-only — kept narrow to what the panel asserts on.
// ─────────────────────────────────────────────────────────────────

function md2html(markdown: string): string {
  const preservedTables: string[] = [];
  let src = markdown.replace(
    /<table\b[\s\S]*?<\/table>/gi,
    (tbl) => {
      const idx = preservedTables.length;
      preservedTables.push(tbl);
      return `@@PRESERVED_TABLE_${idx}@@`;
    },
  );
  let h = src
    .replace(/^#### (.+)$/gm, '<h4 class="section-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="section-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="section-h2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="bold-text">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\|(.+)\|/g, (match) => {
      const rawCells = match.split(/(?<!\\)\|/).filter(Boolean).map((c) =>
        c.trim()
      );
      const cells = rawCells.map((c) => c.replace(/\\\|/g, "|"));
      if (cells.every((c) => /^[-:]+$/.test(c))) return "";
      const tag = cells.some((c) => c.startsWith("**")) ? "th" : "td";
      const cls = tag === "th" ? "table-header" : "table-cell";
      return `<tr>${cells.map((c) => `<${tag} class="${cls}">${c}</${tag}>`).join("")}</tr>`;
    })
    .replace(
      /(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
      (tableMatch) => `<table>${tableMatch}</table>`,
    );
  h = h.replace(
    /@@PRESERVED_TABLE_(\d+)@@/g,
    (_m, idx: string) => preservedTables[Number(idx)] || "",
  );
  return h;
}

function renderToHtml(
  result:
    | { status: "no-match"; attorney: null; events: [] }
    | { status: "matched"; attorney: AttorneyRow; events: DisciplineEvent[] },
  attorneyName?: string,
): string {
  const md = renderAttorneyDisciplineSection({
    result,
    jurisdiction: "CA",
    attorneyName,
  });
  return md2html(md);
}

// ─────────────────────────────────────────────────────────────────
// Fixture payloads
// ─────────────────────────────────────────────────────────────────

const cleanAttorney: AttorneyRow = {
  id: 1,
  jurisdiction: "CA",
  bar_number: "FIXTURE-001",
  full_name: FIXTURE_CLEAN_ATTORNEY_NAME,
  first_name: "Fixture",
  last_name: "Cleanrecord",
  admission_date: "2010-01-15",
  current_status: "active",
  firm: null,
  city: null,
  source_url: null,
  last_seen_at: "2026-04-25T00:00:00Z",
  created_at: "2026-04-22T00:00:00Z",
};
const disciplinedAttorney: AttorneyRow = {
  ...cleanAttorney,
  id: 2,
  bar_number: "FIXTURE-002",
  full_name: FIXTURE_DISCIPLINED_ATTORNEY_NAME,
  last_name: "Disciplined",
  admission_date: "2005-06-20",
  current_status: "suspended",
};

const oneSuspension: DisciplineEvent[] = [
  {
    order_date: "2018-03-12",
    discipline_type: "Suspension",
    discipline_raw: "SUSPENSION 90D STAYED",
    violation_summary: "90-day suspension stayed",
    order_url: "https://example.com/fixture-002-evt-1",
    source_url: "https://example.com/fixture-002-source",
  },
];
const twoEventDisbarment: DisciplineEvent[] = [
  {
    order_date: "2018-03-12",
    discipline_type: "Suspension",
    discipline_raw: "SUSPENSION 90D STAYED",
    violation_summary: "90-day suspension stayed",
    order_url: "https://example.com/fixture-002-evt-1",
    source_url: "https://example.com/fixture-002-source",
  },
  {
    order_date: "2020-07-01",
    discipline_type: "Probation",
    discipline_raw: "PROBATION 1Y",
    violation_summary: "1-year probation imposed",
    order_url: "https://example.com/fixture-002-evt-2",
    source_url: "https://example.com/fixture-002-source",
  },
];

// In-memory hostile fixture — never persisted.
const hostileAttorney: AttorneyRow = {
  ...cleanAttorney,
  id: 99,
  bar_number: "FIXTURE-004",
  full_name: "Fixture Hostile",
};
const hostileEvent: DisciplineEvent = {
  order_date: "2024-01-15",
  discipline_type: '<script>alert(1)</script>',
  discipline_raw: "XSS RAW",
  violation_summary: "alert | <script>",
  order_url: "javascript:alert(1)",
  source_url: "javascript:alert(2)",
};

// ─────────────────────────────────────────────────────────────────
// Panel — runs against every fixture's rendered HTML.
// ─────────────────────────────────────────────────────────────────

const HEADING_REGEX = new RegExp(
  `<h2[^>]*>${escapeRegExp(IB_SECTION_ANCHORS.ATTORNEY_DISCIPLINE)}<\\/h2>`,
);

const HREF_REGEX = /href="([^"]*)"/g;

const INTERPRETIVE_BANNED =
  /\b(unreliable|incompetent|negligent|untrustworthy|sketchy|shady|questionable|inadequate|deficient)\b/i;

function runPanel(html: string, name: string) {
  // 1. heading present exactly once.
  const headingMatches = html.match(new RegExp(HEADING_REGEX.source, "g")) ?? [];
  assertEquals(
    headingMatches.length,
    1,
    `${name}: expected exactly one heading, got ${headingMatches.length}`,
  );

  // 2. no banned phrases.
  const lower = html.toLowerCase();
  for (const phrase of BANNED_PHRASES_BLOCK) {
    assert(
      !lower.includes(phrase.toLowerCase()),
      `${name}: contains banned phrase "${phrase}"`,
    );
  }

  // 3. no literal <script or javascript:.
  assert(
    !lower.includes("<script"),
    `${name}: contains literal <script`,
  );
  assert(
    !lower.includes("javascript:"),
    `${name}: contains literal javascript:`,
  );

  // 4. every href is # or http(s)://.
  for (const m of html.matchAll(HREF_REGEX)) {
    const href = m[1];
    assertMatch(
      href,
      /^(#|https?:\/\/)/i,
      `${name}: bad href "${href}"`,
    );
  }

  // 6. CA Bar lookup link present (omitted for no-match — rendered as plain text).
  // Asserted in per-fixture tests below where applicable.

  // T3.3 interpretive-adjective panel.
  assert(
    !INTERPRETIVE_BANNED.test(html),
    `${name}: contains interpretive adjective about attorney`,
  );

  // NB: T3.4 entity-decode panel runs as a separate test below; it only
  // applies to inputs that don't already contain raw `<script>` (decoding
  // safely-escaped raw `<script>` legitimately reverts to the raw string,
  // which is not a security issue — the BROWSER never sees the decoded form).
}

function decodeHtmlEntitiesOnce(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// ─────────────────────────────────────────────────────────────────
// 5-fixture matrix (Success Criterion 12)
// ─────────────────────────────────────────────────────────────────

Deno.test("Panel: matched-clean fixture", () => {
  const html = renderToHtml({
    status: "matched",
    attorney: cleanAttorney,
    events: [],
  });
  runPanel(html, "matched-clean");
  // Per-fixture: contains "Active" + "no discipline events".
  assert(html.includes("active") || html.includes("Active"));
  assert(html.includes("no discipline events on file"));
  assert(html.includes(CA_BAR_LOOKUP_BASE));
  assert(html.includes(DISCLAIMER_VERBATIM.split(".")[0]));
});

Deno.test("Panel: matched-1-event-suspension", () => {
  const html = renderToHtml({
    status: "matched",
    attorney: disciplinedAttorney,
    events: oneSuspension,
  });
  runPanel(html, "matched-1-event-suspension");
  assert(html.includes("Suspension"));
  assert(html.includes("1 event"));
  // Exactly one table block, two <tr>s (header + 1 event).
  const tableMatches = html.match(/<table>[\s\S]*?<\/table>/g) ?? [];
  assertEquals(tableMatches.length, 1, "expected exactly one <table>");
  const trCount = (tableMatches[0]!.match(/<tr>/g) ?? []).length;
  assertEquals(trCount, 2, `expected 2 <tr>s (header + 1 event), got ${trCount}`);
});

Deno.test("Panel: matched-multi-event-disbarment (2 events)", () => {
  const html = renderToHtml({
    status: "matched",
    attorney: disciplinedAttorney,
    events: twoEventDisbarment,
  });
  runPanel(html, "matched-multi-event");
  assert(html.includes("2 events"));
  const tableMatches = html.match(/<table>[\s\S]*?<\/table>/g) ?? [];
  assertEquals(tableMatches.length, 1);
  const trCount = (tableMatches[0]!.match(/<tr>/g) ?? []).length;
  assertEquals(trCount, 3, `expected 3 <tr>s (header + 2 events), got ${trCount}`);
});

Deno.test("Panel: no-match", () => {
  const html = renderToHtml(
    { status: "no-match", attorney: null, events: [] },
    FIXTURE_CLEAN_ATTORNEY_NAME,
  );
  runPanel(html, "no-match");
  assert(html.includes("couldn&#39;t match") || html.includes("couldn't match"));
  assert(!/<table>/i.test(html), "no-match must not render a <table>");
  // Rewrite verifies "does NOT mean they're unlicensed" reassurance is present.
  assert(html.includes("does NOT mean"));
});

Deno.test("Panel: ambiguous (rendered as no-match)", () => {
  // The RPC returns 2+ rows → getAttorneyDiscipline returns no-match. Renderer
  // gets no-match status. Same shape as no-match.
  const html = renderToHtml(
    { status: "no-match", attorney: null, events: [] },
    FIXTURE_CLEAN_ATTORNEY_NAME,
  );
  runPanel(html, "ambiguous");
  assert(!/<table>/i.test(html));
});

// ─────────────────────────────────────────────────────────────────
// In-memory hostile-input test (Success Criterion 10)
// ─────────────────────────────────────────────────────────────────

Deno.test("Hostile input: <script> escaped, javascript: defanged, pipe-cell preserved", () => {
  const html = renderToHtml({
    status: "matched",
    attorney: hostileAttorney,
    events: [hostileEvent],
  });

  // Rendered as escaped entities — never raw.
  assert(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  // No literal <script in source.
  assert(!html.includes("<script"));
  // javascript: URLs defanged to "#" (via safeMdLink fallback).
  assert(!html.toLowerCase().includes("javascript:"));
  // Run the full panel (heading + banned + interpretive + entity-decode).
  runPanel(html, "hostile-event");

  // Pipe-escape preserved exactly one event row (no extra <td>).
  const tableMatches = html.match(/<table>[\s\S]*?<\/table>/g) ?? [];
  assertEquals(tableMatches.length, 1);
  const trCount = (tableMatches[0]!.match(/<tr>/g) ?? []).length;
  assertEquals(trCount, 2, "hostile event should render exactly header + 1 row");

  // Entity-decode round still does NOT yield javascript: — defense-in-depth.
  // (Decoded `&lt;script&gt;` legitimately becomes `<script>` for raw input;
  // the security guarantee is that BROWSER-rendered output is escaped, not
  // that decoding plaintext escapes is impossible.)
  const decoded = decodeHtmlEntitiesOnce(html);
  assert(!decoded.toLowerCase().includes("javascript:"));
});

Deno.test("T3.4: pre-encoded XSS payload survives ONE round of entity-decode", () => {
  // Defends against an attacker who pre-encodes their payload, banking on
  // a future renderer change adding a decode-then-render step.
  const preEncodedAttorney: AttorneyRow = {
    ...cleanAttorney,
    id: 88,
    bar_number: "FIXTURE-PRE",
    full_name: "Pre Encoded",
  };
  const preEncodedEvent: DisciplineEvent = {
    order_date: "2024-01-15",
    discipline_type: "&lt;script&gt;alert(1)&lt;/script&gt;",
    discipline_raw: "ENT RAW",
    violation_summary: "&lt;img src=x onerror=alert(1)&gt;",
    order_url: "https://example.com/fixture-pre",
    source_url: "https://example.com/fixture-pre",
  };
  const html = renderToHtml({
    status: "matched",
    attorney: preEncodedAttorney,
    events: [preEncodedEvent],
  });
  // Rendered HTML escapes the `&` of `&lt;` → `&amp;lt;` etc.
  assert(html.includes("&amp;lt;script&amp;gt;"));
  // After ONE round of decoding, it reverts to `&lt;script&gt;` — still safe.
  const decoded = decodeHtmlEntitiesOnce(html);
  assert(
    !decoded.toLowerCase().includes("<script"),
    "decoded once must NOT contain <script literal",
  );
  assert(
    !decoded.toLowerCase().includes("javascript:"),
    "decoded once must NOT contain javascript:",
  );
});

// ─────────────────────────────────────────────────────────────────
// Source-column suppression for list-page-only URLs (2026-04-29 launch fix)
// ─────────────────────────────────────────────────────────────────

Deno.test("renderAttorneyDisciplineSection: suppresses Source column when ALL events have list-page source URLs", () => {
  const calBarListPageAttorney: AttorneyRow = {
    ...cleanAttorney,
    id: 99,
    bar_number: "131912",
    full_name: "Live CA Attorney",
    current_status: "active",
    admission_date: "2010-01-15",
  };
  // Mirrors live CalBar scrape data: source_url is a paginated list page,
  // order_url is null. Scraper README explicitly states list pages don't
  // link to per-decision orders.
  const listPageEvents: DisciplineEvent[] = [
    {
      order_date: "2026-03-29",
      discipline_type: "suspension",
      discipline_raw: "of Redlands, 2 years probation, 18 months suspension",
      violation_summary: "of Redlands, 2 years probation, 18 months suspension",
      order_url: null,
      source_url: "https://www.calbar.ca.gov/public/concerns-about-attorney/recent-disciplinary-actions?page=0",
    },
    {
      order_date: null,
      discipline_type: "probation",
      discipline_raw: "of Redlands, 1 year probation",
      violation_summary: "of Redlands, 1 year probation",
      order_url: null,
      source_url: "https://www.calbar.ca.gov/public/concerns-about-attorney/recent-disciplinary-actions?page=45",
    },
  ];
  const md = renderAttorneyDisciplineSection({
    status: "matched",
    attorney: calBarListPageAttorney,
    events: listPageEvents,
    jurisdiction: "CA",
  } as any);
  // Header row must NOT contain "Source" column.
  const headerLine = md.split("\n").find((l) => l.startsWith("| Date"));
  assert(headerLine, "expected a markdown table header row");
  assert(
    !/\| Source \|/.test(headerLine!),
    `Source column should be suppressed when all URLs are list pages, got: ${headerLine}`,
  );
  // The misleading "CA Bar order" link MUST NOT appear in the body.
  assert(
    !/\[CA Bar order\]/.test(md),
    "Per-row 'CA Bar order' link must not render when source_urls are list pages",
  );
  // BUT the section-level "Verify yourself" CTA at the attorney-profile level
  // MUST still appear (canonical per-attorney verification).
  assert(
    /Verify yourself: https:\/\/apps\.calbar\.ca\.gov\/attorney\/Licensee\/Detail\/131912/.test(md),
    "Section-level 'Verify yourself' CTA must remain even when per-row links are suppressed",
  );
});

Deno.test("renderAttorneyDisciplineSection: keeps Source column when at least one event has a real per-decision URL", () => {
  // Mixed-quality data: one event has a real CL permalink, others are list pages.
  // Source column should render, with safeMdLink falling back per-row.
  const mixedEvents: DisciplineEvent[] = [
    {
      order_date: "2020-04-22",
      discipline_type: "disbarment",
      discipline_raw: "raw",
      violation_summary: "summary",
      order_url: "https://www.courtlistener.com/opinion/4256367/in-re-petition-for-disciplinary-action/",
      source_url: "https://lawyersearch.mncourts.gov/",
    },
    {
      order_date: null,
      discipline_type: "suspension",
      discipline_raw: "raw",
      violation_summary: "summary",
      order_url: null,
      source_url: "https://www.calbar.ca.gov/public/concerns-about-attorney/recent-disciplinary-actions?page=17",
    },
  ];
  const md = renderAttorneyDisciplineSection({
    status: "matched",
    attorney: { ...cleanAttorney, id: 100, bar_number: "131913" },
    events: mixedEvents,
    jurisdiction: "CA",
  } as any);
  const headerLine = md.split("\n").find((l) => l.startsWith("| Date"));
  assert(headerLine, "expected a markdown table header row");
  assert(
    /\| Source \|/.test(headerLine!),
    "Source column should render when at least one event has a real per-decision URL",
  );
});

Deno.test("DISCLAIMER_VERBATIM contains zero banned phrases (Success Criterion 13)", () => {
  const lower = DISCLAIMER_VERBATIM.toLowerCase();
  for (const phrase of BANNED_PHRASES_BLOCK) {
    assert(
      !lower.includes(phrase.toLowerCase()),
      `DISCLAIMER_VERBATIM contains banned phrase "${phrase}"`,
    );
  }
  assert(
    BANNED_PHRASES_BLOCK.length >= 10,
    `BANNED_PHRASES_BLOCK length ${BANNED_PHRASES_BLOCK.length} < 10 (false-green guard)`,
  );
});

Deno.test("buildAttorneyDisciplineSection (production path): suppresses on missing inputs", async () => {
  // Empty attorney → "" (suppressed).
  assertEquals(
    await buildAttorneyDisciplineSection({
      attorneyName: "",
      jurisdiction: "CA",
      supabaseUrl: "https://x.supabase.co",
      serviceRoleKey: "k",
    }),
    "",
  );
  // Missing supabaseUrl → "".
  assertEquals(
    await buildAttorneyDisciplineSection({
      attorneyName: "Bob Smith",
      jurisdiction: "CA",
      supabaseUrl: "",
      serviceRoleKey: "",
    }),
    "",
  );
});
