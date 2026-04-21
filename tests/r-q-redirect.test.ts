/**
 * Live integration test for /r/q/[id] click-tracking redirect.
 *
 * Inserts a synthetic posted_answers row against the real Supabase instance,
 * imports the route handler, invokes GET with a NextRequest, asserts:
 *   - Valid id with matched_blog_slug → 302 to /blog/<slug>?src=<source>&q=<id>
 *   - Valid id with NULL matched_blog_slug → 302 to /arrested?src=<source>&q=<id>
 *   - Non-numeric id → 302 to /arrested?src=rq&err=bad-id
 *   - Unknown id → 302 to /arrested?src=rq&err=not-found&q=<id>
 *   - Click count increments (eventual — after() fires async, polls up to 3s)
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 * Cleans up the synthetic rows in afterAll. Guarded by an abandoned_questions
 * seed row so FK is satisfied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// next/server's `after()` is a no-op outside a request context in tests.
// The route's fire-and-forget click bump won't run unless we patch it, so we
// patch after() → immediate await. Vitest hoists vi.mock calls; use it here.
import { vi } from "vitest";
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (cb: () => Promise<void> | void) => {
      // Run synchronously-ish; return the promise so the caller can await.
      return Promise.resolve(cb()).catch(() => {});
    },
  };
});

// Dynamic import so the mock is in place before the route loads its deps.
async function loadHandler() {
  const mod = await import("../src/app/r/q/[id]/route");
  return mod.GET;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasCreds = !!SUPABASE_URL && !!SERVICE_KEY;
const describeIfLive = hasCreds ? describe : describe.skip;

describeIfLive("GET /r/q/[id]", () => {
  // `describe.skip(...)` still runs the describe callback at suite-collection
  // time — only the `it(...)` bodies are skipped. Creating the client at the
  // callback top-level blew up the whole file load when env was absent.
  // Defer to beforeAll so skipped runs don't require credentials.
  // Untyped client — this repo doesn't generate Database types and the
  // test uses tables (abandoned_questions, posted_answers) that would resolve
  // to `never` under the default signature. Generic `any` matches the prod
  // path (createAdminClient in src/lib/supabase/admin.ts is also untyped).
  let sb: ReturnType<typeof createClient<any>>;

  let abandonedId: number;
  let postedWithSlug: number;
  let postedWithoutSlug: number;

  beforeAll(async () => {
    sb = createClient<any>(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const uniq = `rq-test-${Date.now()}`;
    const { data: aq, error: aqErr } = await sb
      .from("abandoned_questions")
      .insert({
        source: "reddit",
        source_url: `https://reddit.com/test/${uniq}`,
        question_text: "integration test seed",
        charge_type_slug: "dui-first-offense",
        status: "pending",
      })
      .select("id")
      .single();
    if (aqErr) throw aqErr;
    abandonedId = aq.id as number;

    const { data: p1, error: p1Err } = await sb
      .from("posted_answers")
      .insert({
        abandoned_question_id: abandonedId,
        source: "quora",
        posted_url: `https://quora.com/test/${uniq}-with-slug`,
        matched_blog_slug: "dui-72-hours-what-to-do",
      })
      .select("id")
      .single();
    if (p1Err) throw p1Err;
    postedWithSlug = p1.id as number;

    const { data: p2, error: p2Err } = await sb
      .from("posted_answers")
      .insert({
        abandoned_question_id: abandonedId,
        source: "reddit",
        posted_url: `https://reddit.com/test/${uniq}-no-slug`,
      })
      .select("id")
      .single();
    if (p2Err) throw p2Err;
    postedWithoutSlug = p2.id as number;
  });

  afterAll(async () => {
    if (postedWithSlug) await sb.from("posted_answers").delete().eq("id", postedWithSlug);
    if (postedWithoutSlug) await sb.from("posted_answers").delete().eq("id", postedWithoutSlug);
    if (abandonedId) await sb.from("abandoned_questions").delete().eq("id", abandonedId);
  });

  it("redirects to matched blog with source + q params", async () => {
    const GET = await loadHandler();
    const res = await GET(
      new NextRequest(`https://imnotanattorney.com/r/q/${postedWithSlug}`),
      { params: Promise.resolve({ id: String(postedWithSlug) }) },
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/blog/dui-72-hours-what-to-do");
    expect(loc).toContain("src=quora");
    expect(loc).toContain(`q=${postedWithSlug}`);
  });

  it("falls back to /arrested when matched_blog_slug is null", async () => {
    const GET = await loadHandler();
    const res = await GET(
      new NextRequest(`https://imnotanattorney.com/r/q/${postedWithoutSlug}`),
      { params: Promise.resolve({ id: String(postedWithoutSlug) }) },
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/arrested");
    expect(loc).toContain("src=reddit");
    expect(loc).toContain(`q=${postedWithoutSlug}`);
  });

  it("rejects non-numeric id", async () => {
    const GET = await loadHandler();
    const res = await GET(
      new NextRequest("https://imnotanattorney.com/r/q/abc"),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("err=bad-id");
  });

  it("falls back when id not found", async () => {
    const GET = await loadHandler();
    const res = await GET(
      new NextRequest("https://imnotanattorney.com/r/q/99999999"),
      { params: Promise.resolve({ id: "99999999" }) },
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("err=not-found");
    expect(loc).toContain("q=99999999");
  });

  it("increments click_count after successful redirect", async () => {
    const GET = await loadHandler();
    const { data: before } = await sb
      .from("posted_answers")
      .select("click_count")
      .eq("id", postedWithSlug)
      .single();
    const startCount = before!.click_count as number;

    await GET(
      new NextRequest(`https://imnotanattorney.com/r/q/${postedWithSlug}`),
      { params: Promise.resolve({ id: String(postedWithSlug) }) },
    );

    // after() was patched to run synchronously-ish; give it a tick.
    await new Promise((r) => setTimeout(r, 250));

    const { data: after } = await sb
      .from("posted_answers")
      .select("click_count")
      .eq("id", postedWithSlug)
      .single();
    expect(after!.click_count).toBe(startCount + 1);
  });
});
