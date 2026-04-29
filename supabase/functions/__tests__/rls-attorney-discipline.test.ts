// supabase/functions/__tests__/rls-attorney-discipline.test.ts
//
// T4.6 (worry-attorney-discipline-wire v2.4) — RLS posture smoke test.
//
// ⚠ STALE 2026-04-29: depends on FIXTURE-001/002/003 rows that were removed
//   from prod via 20260429a_remove_attorney_discipline_test_fixtures.sql.
//   Service-role probe will return [] instead of [≥1] until this test is
//   updated to seed its own fixture inline (or use a real CA attorney as the
//   probe target). NOT in npm test / CI — deno-only manual runner.
//   Tracked: launch-pristine cleanup, separate task.
//
// Asserts:
//   1. Anon-key SELECT on attorneys + attorney_discipline_events returns
//      HTTP 200 + body `[]` (RLS-blocked under PostgREST returns empty,
//      NOT 401 — Code v2 CRIT #3 verified live 2026-04-25).
//   2. Anon-key POST to /rest/v1/rpc/attorney_match_by_raw_name returns
//      HTTP 404 AND body parses to JSON with `code === 'PGRST202'`
//      (function not found / no EXECUTE grant).
//   3. Service-role POST to the same RPC against FIXTURE_CLEAN_ATTORNEY_NAME
//      returns 200 + non-empty array — proves the test exercises the actual
//      function path, not a typo'd 404 for the wrong reason.
//
// Pre-flight (runtime — not at import time): decode the JWT and assert
// `role === 'anon'`. Stale .env.local values returned 401 on every table
// during 2026-04-25 session, masking actual RLS posture.
//
// Runner: built-in `Deno.test`. Run with:
//   ANON_KEY=... SERVICE_ROLE_KEY=... SUPABASE_URL=... \
//     deno test --allow-net --allow-env --no-check=remote \
//     supabase/functions/__tests__/rls-attorney-discipline.test.ts

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { FIXTURE_CLEAN_ATTORNEY_NAME } from "../generate-report/__tests__/fixtures.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ??
  Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
let ANON_KEY = Deno.env.get("ANON_KEY") ??
  Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MGMT_TOKEN = Deno.env.get("SUPABASE_ACCESS_TOKEN") ?? "";
const PROJECT_REF = Deno.env.get("SUPABASE_PROJECT_REF") ?? "jxjbjmgdukwkoclydqdr";

function decodeJwtRole(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

// Per Plan T4.6 §3 (Sec v2 WARN #4): the anon key MUST come from the Supabase
// Mgmt API at runtime, NOT from .env.local. Stale .env.local returned 401 on
// every table during the 2026-04-25 session, masking actual RLS posture.
async function refreshAnonKeyIfStale(): Promise<void> {
  if (!MGMT_TOKEN || !SUPABASE_URL || !ANON_KEY) return;
  // Probe a known-RLS table — if 401, the key is stale; refresh from Mgmt API.
  try {
    const probe = await fetch(`${SUPABASE_URL}/rest/v1/cases?select=*&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (probe.status === 401) {
      const r = await fetch(
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`,
        { headers: { Authorization: `Bearer ${MGMT_TOKEN}` } },
      );
      if (r.ok) {
        const keys = (await r.json()) as Array<{ name?: string; api_key?: string }>;
        const fresh = keys.find((k) => k.name === "anon")?.api_key;
        if (fresh) ANON_KEY = fresh;
      }
    }
  } catch {
    // Falls through; tests will surface the 401 on first assertion.
  }
}

await refreshAnonKeyIfStale();

const SKIP_REASON =
  !SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY
    ? "missing SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY env (set via Supabase Mgmt API; do not use stale .env.local)"
    : null;

Deno.test({
  name: "RLS pre-flight: ANON_KEY is `anon`-role JWT (Sec v2 WARN #4)",
  ignore: SKIP_REASON !== null,
  fn() {
    if (SKIP_REASON) return;
    const role = decodeJwtRole(ANON_KEY);
    assertEquals(
      role,
      "anon",
      `ANON_KEY role is "${role}" (expected "anon") — fix or fetch via Mgmt API`,
    );
  },
});

Deno.test({
  name: "RLS: anon SELECT attorneys → 200 + []",
  ignore: SKIP_REASON !== null,
  async fn() {
    if (SKIP_REASON) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/attorneys?select=*`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    assertEquals(r.status, 200, "expected 200 (RLS empty)");
    const body = JSON.parse(await r.text());
    assertEquals(Array.isArray(body), true);
    assertEquals(body.length, 0, "expected RLS-blocked anon to see []");
  },
});

Deno.test({
  name: "RLS: anon SELECT attorney_discipline_events → 200 + []",
  ignore: SKIP_REASON !== null,
  async fn() {
    if (SKIP_REASON) return;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/attorney_discipline_events?select=*`,
      {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      },
    );
    assertEquals(r.status, 200);
    const body = JSON.parse(await r.text());
    assertEquals(Array.isArray(body), true);
    assertEquals(body.length, 0);
  },
});

Deno.test({
  name: "RLS: anon RPC attorney_match_by_raw_name → denied (404 PGRST202 or 401 42501)",
  ignore: SKIP_REASON !== null,
  async fn() {
    if (SKIP_REASON) return;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/attorney_match_by_raw_name`,
      {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jur: "CA", raw_name: "x" }),
      },
    );
    // Two valid denial shapes (both = anon EXECUTE denied):
    //   - 404 + body.code === 'PGRST202'  (PostgREST: function not in cache)
    //   - 401 + body.code === '42501'     (Postgres permission_denied)
    // We assert the union so the test is robust to PostgREST cache state.
    let body: { code?: string } = {};
    try {
      body = JSON.parse(await r.text());
    } catch {
      assert(false, "expected JSON body");
    }
    const allowed = (r.status === 404 && body.code === "PGRST202")
      || (r.status === 401 && body.code === "42501");
    assert(
      allowed,
      `expected denial (404+PGRST202 or 401+42501), got ${r.status} + ${JSON.stringify(body)}`,
    );
  },
});

Deno.test({
  name: "Positive control: service-role RPC returns clean attorney row",
  ignore: SKIP_REASON !== null,
  async fn() {
    if (SKIP_REASON) return;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/attorney_match_by_raw_name`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jur: "CA", raw_name: FIXTURE_CLEAN_ATTORNEY_NAME }),
      },
    );
    assertEquals(r.status, 200);
    const body = JSON.parse(await r.text());
    assert(Array.isArray(body));
    assert(body.length >= 1, "expected ≥1 row for fixture name");
    // FIXTURE-001 + FIXTURE-003 share the full_name → ambiguous probe row
    // exists. Service-role doesn't go through the ambiguous→no-match path
    // (that's client-side); it sees the raw rows.
  },
});
