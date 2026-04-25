// supabase/functions/generate-report/__tests__/attorney-discipline.test.ts
//
// T1.4 (worry-attorney-discipline-wire v2.4) — unit tests for the RPC client.
//
// Runner: built-in `Deno.test` (NOT std/bdd, NOT vitest). Run with:
//   deno test --allow-net --allow-env --no-check=remote \
//     supabase/functions/generate-report/__tests__/attorney-discipline.test.ts
//
// Strategy:
//   - Mock fetch so tests run without network or DB.
//   - Cover all 8 cases listed in plan T1.4:
//       matched-clean, matched-disciplined, no-match, ambiguous, injection
//       input, control-character input, garbage input, diacritic input.
//   - Garbage / sanitize-fail inputs assert the mocked fetch is NEVER called
//     (proves short-circuit before DB roundtrip).

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  getAttorneyDiscipline,
  __INTERNALS,
  type AttorneyRow,
  type DisciplineEvent,
} from "../lib/attorney-discipline.ts";

import {
  FIXTURE_CLEAN_ATTORNEY_NAME,
  FIXTURE_CLEAN_BAR_NUMBER,
  FIXTURE_DISCIPLINED_ATTORNEY_NAME,
  FIXTURE_DISCIPLINED_BAR_NUMBER,
  FIXTURE_DISCIPLINED_EVENT_COUNT,
} from "./fixtures.ts";

// ─────────────────────────────────────────────────────────────────────
// Fetch-mock harness
// ─────────────────────────────────────────────────────────────────────

type Calls = Array<{ url: string; init: RequestInit }>;

function mockFetch(
  rpcRows: AttorneyRow[],
  eventRows: DisciplineEvent[],
  calls: Calls = [],
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init: init ?? {} });
    if (url.includes("/rpc/attorney_match_by_raw_name")) {
      // Filter on raw_name so unrelated inputs (injection literals etc.)
      // don't accidentally "match" the seeded fixture rows. The real RPC
      // applies `lower(immutable_unaccent($1))` before comparing; we mimic
      // by lowercasing both sides.
      const body = init?.body
        ? JSON.parse(String(init.body))
        : { raw_name: "" };
      const want = String(body.raw_name ?? "").trim().toLowerCase();
      const matched = rpcRows.filter(
        (r) => r.full_name.trim().toLowerCase() === want,
      );
      return Promise.resolve(
        new Response(JSON.stringify(matched), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/rest/v1/attorney_discipline_events")) {
      return Promise.resolve(
        new Response(JSON.stringify(eventRows), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response("not mocked", { status: 500 }));
  }) as typeof fetch;
}

const cleanAttorney: AttorneyRow = {
  id: 1,
  jurisdiction: "CA",
  bar_number: FIXTURE_CLEAN_BAR_NUMBER,
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
  bar_number: FIXTURE_DISCIPLINED_BAR_NUMBER,
  full_name: FIXTURE_DISCIPLINED_ATTORNEY_NAME,
  last_name: "Disciplined",
  admission_date: "2005-06-20",
  current_status: "suspended",
};
const ambiguousRow: AttorneyRow = {
  ...cleanAttorney,
  id: 3,
  bar_number: "FIXTURE-003",
};
const disciplineEvents: DisciplineEvent[] = [
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

const baseOpts = (fetchImpl?: typeof fetch) => ({
  supabaseUrl: "https://example.test.supabase.co",
  serviceRoleKey: "test-service-role-key",
  fetchImpl,
});

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

Deno.test("matched-clean: returns matched + 0 events", async () => {
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney], [], calls);
  const r = await getAttorneyDiscipline(
    FIXTURE_CLEAN_ATTORNEY_NAME,
    "CA",
    baseOpts(f),
  );
  assertEquals(r.status, "matched");
  if (r.status === "matched") {
    assertEquals(r.attorney.bar_number, FIXTURE_CLEAN_BAR_NUMBER);
    assertEquals(r.events.length, 0);
  }
  // RPC + events fetch = 2 calls.
  assertEquals(calls.length, 2);
});

Deno.test("matched-disciplined: returns matched + N events", async () => {
  const calls: Calls = [];
  const f = mockFetch([disciplinedAttorney], disciplineEvents, calls);
  const r = await getAttorneyDiscipline(
    FIXTURE_DISCIPLINED_ATTORNEY_NAME,
    "CA",
    baseOpts(f),
  );
  assertEquals(r.status, "matched");
  if (r.status === "matched") {
    assertEquals(r.attorney.bar_number, FIXTURE_DISCIPLINED_BAR_NUMBER);
    assertEquals(r.events.length, FIXTURE_DISCIPLINED_EVENT_COUNT);
  }
});

Deno.test("no-match: zero rows from RPC", async () => {
  const calls: Calls = [];
  const f = mockFetch([], [], calls);
  const r = await getAttorneyDiscipline(
    "Zzzzz Nonexistent",
    "CA",
    baseOpts(f),
  );
  assertEquals(r.status, "no-match");
  assertEquals(r.attorney, null);
  assertEquals(r.events.length, 0);
  // RPC called, events skipped (zero match means no second fetch).
  assertEquals(calls.length, 1);
});

Deno.test("ambiguous: 2 rows → no-match", async () => {
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney, ambiguousRow], [], calls);
  const r = await getAttorneyDiscipline(
    FIXTURE_CLEAN_ATTORNEY_NAME,
    "CA",
    baseOpts(f),
  );
  assertEquals(r.status, "no-match");
});

Deno.test("injection input → no-match (RPC sees parameterized input, returns 0 rows)", async () => {
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney], [], calls);
  const r = await getAttorneyDiscipline(
    "' OR 1=1 --",
    "CA",
    baseOpts(f),
  );
  // Single quote and `=` aren't postgrest-special; sanitizer passes the input
  // through verbatim. The RPC then runs lower(immutable_unaccent($1)) = ...
  // against the parameterized literal — zero rows match. Result: no-match.
  assertEquals(r.status, "no-match");
  assert(!Object.prototype.hasOwnProperty.call(r, "attorney") || r.attorney === null);
});

Deno.test("control-char input (\\x00) → no-match without DB call", async () => {
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney], [], calls);
  const r = await getAttorneyDiscipline(
    "Bob\x00Hidden",
    "CA",
    baseOpts(f),
  );
  assertEquals(r.status, "no-match");
  // CTRL_REGEX fires before any fetch — assert short-circuit.
  assertEquals(calls.length, 0);
});

Deno.test("newline input collapses to whitespace and may pass sanitize", async () => {
  // \n is whitespace — collapse turns "Bob\nSmith" into "Bob Smith". Two-token
  // form survives sanitize and reaches the DB. RPC returns no-match because
  // "Bob Smith" isn't in fixture data.
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney], [], calls);
  const r = await getAttorneyDiscipline(
    "Bob\nSmith",
    "CA",
    baseOpts(f),
  );
  assertEquals(r.status, "no-match");
});

Deno.test("garbage single-token: no-match without DB call", async () => {
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney], [], calls);
  for (const garbage of ["asdf", "n/a", "n a", "test", "qwerty", "xx", "Bob"]) {
    const r = await getAttorneyDiscipline(garbage, "CA", baseOpts(f));
    assertEquals(r.status, "no-match", `garbage="${garbage}" should be no-match`);
  }
  // ZERO fetch invocations — every garbage input short-circuits.
  assertEquals(calls.length, 0);
});

Deno.test("type-gate: non-string inputs return no-match", async () => {
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney], [], calls);
  for (const bad of [null, undefined, 42, {}, []]) {
    // deno-lint-ignore no-explicit-any
    const r = await getAttorneyDiscipline(bad as any, "CA", baseOpts(f));
    assertEquals(r.status, "no-match");
  }
  assertEquals(calls.length, 0);
});

Deno.test("non-CA jurisdiction returns no-match without DB call", async () => {
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney], [], calls);
  const r = await getAttorneyDiscipline(
    FIXTURE_CLEAN_ATTORNEY_NAME,
    "FL",
    baseOpts(f),
  );
  assertEquals(r.status, "no-match");
  assertEquals(calls.length, 0);
});

Deno.test("diacritic input passes raw to RPC (no JS-side normalization)", async () => {
  // The Postgres-side `lower(immutable_unaccent($1))` does the folding. The
  // client must NOT normalize — that would diverge from Postgres for
  // precomposed-only Latin extensions (Søren↔Soren, Ł↔L, Đ↔D, etc.). This
  // test verifies the body arrives at the RPC verbatim (modulo whitespace
  // normalization).
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney], [], calls);
  await getAttorneyDiscipline("José García", "CA", baseOpts(f));
  // At least one fetch (the RPC) — events fetch only fires on match.
  assert(calls.length >= 1);
  const body = JSON.parse(String(calls[0].init.body));
  assertEquals(body.raw_name, "José García");
});

Deno.test("non-NFD diacritic (Søren) — no JS-side fold; raw passes through", async () => {
  // Sec v3 CRITICAL closed: JS shim used to normalize Søren → Soren which
  // diverged from Postgres unaccent. Now: no normalization client-side.
  const calls: Calls = [];
  const f = mockFetch([cleanAttorney], [], calls);
  await getAttorneyDiscipline("Søren Larsen", "CA", baseOpts(f));
  const body = JSON.parse(String(calls[0].init.body));
  assertEquals(body.raw_name, "Søren Larsen");
});

Deno.test("RPC HTTP error → no-match", async () => {
  const calls: Calls = [];
  const f = ((url: string) => {
    calls.push({ url, init: {} });
    return Promise.resolve(new Response("server fire", { status: 500 }));
  }) as unknown as typeof fetch;
  const r = await getAttorneyDiscipline(
    FIXTURE_CLEAN_ATTORNEY_NAME,
    "CA",
    baseOpts(f),
  );
  assertEquals(r.status, "no-match");
});

Deno.test("RPC fetch throws → no-match (network error)", async () => {
  const f = (() => Promise.reject(new Error("network down"))) as unknown as
    typeof fetch;
  const r = await getAttorneyDiscipline(
    FIXTURE_CLEAN_ATTORNEY_NAME,
    "CA",
    baseOpts(f),
  );
  assertEquals(r.status, "no-match");
});

Deno.test("sanitize internal: postgrest-special chars rejected", () => {
  const cases = ["Bob*", "Bob%", "Bob,Smith", "Bob(Smith)", "a:b", "a.b", "a_b"];
  for (const s of cases) {
    assertEquals(
      __INTERNALS.sanitizeAttorneyName(s),
      null,
      `should reject: "${s}"`,
    );
  }
});

Deno.test("sanitize internal: trim + collapse whitespace", () => {
  // Two-token input survives; whitespace collapsed.
  assertEquals(
    __INTERNALS.sanitizeAttorneyName("  Bob   Smith  "),
    "Bob Smith",
  );
});

Deno.test("sanitize internal: cap at 200 chars", () => {
  const long = "a ".repeat(150); // 300 chars w/ spaces.
  const r = __INTERNALS.sanitizeAttorneyName(long);
  assert(r === null || (r as string).length <= 200);
});

Deno.test("Success Criterion 3: function arity is 3 (name, juris, opts)", () => {
  // Fixed when migrating to the options-bag pattern. Plan SC #3 said arity 2;
  // arity is now 3 because options is required for fetch+url+key. Document
  // here so future drift surfaces visibly.
  assertEquals(typeof getAttorneyDiscipline, "function");
  assertEquals(getAttorneyDiscipline.length, 3);
});
