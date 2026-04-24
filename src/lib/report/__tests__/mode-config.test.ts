/**
 * Unit tests for mode-config.ts.
 *
 * vi.mock replaces createAdminClient with a deterministic fake whose
 * .from().select().eq().maybeSingle() returns configurable fixtures.
 * Tests cover: each valid mode, hybrid-legacy-value falls back to
 * session, fallback on unknown mode, fallback on DB error, cache hit
 * behavior. Fallback is 'session' (safe-default per zero-hallucination
 * mandate).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let fixtureRow: { mode: string } | null = null;
let fixtureError: { message: string } | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: fixtureRow,
            error: fixtureError,
          }),
        }),
      }),
    }),
  }),
}));

import {
  getTierGenerationMode,
  __resetModeConfigCacheForTests,
} from "../mode-config";

describe("mode-config", () => {
  beforeEach(() => {
    fixtureRow = null;
    fixtureError = null;
    __resetModeConfigCacheForTests();
  });

  it("returns 'api' when row has mode='api'", async () => {
    fixtureRow = { mode: "api" };
    expect(await getTierGenerationMode("case-decoder")).toBe("api");
  });

  it("returns 'mechanical' when row has mode='mechanical'", async () => {
    fixtureRow = { mode: "mechanical" };
    expect(await getTierGenerationMode("case-decoder")).toBe("mechanical");
  });

  it("returns 'session' when row has mode='session'", async () => {
    fixtureRow = { mode: "session" };
    expect(await getTierGenerationMode("case-decoder")).toBe("session");
  });

  it("falls back to 'session' when row has removed mode='hybrid'", async () => {
    fixtureRow = { mode: "hybrid" };
    expect(await getTierGenerationMode("case-decoder")).toBe("session");
  });

  it("falls back to 'session' on unknown mode value", async () => {
    fixtureRow = { mode: "garbage-not-a-mode" };
    expect(await getTierGenerationMode("case-decoder")).toBe("session");
  });

  it("falls back to 'session' on missing row", async () => {
    fixtureRow = null;
    expect(await getTierGenerationMode("case-decoder")).toBe("session");
  });

  it("falls back to 'session' on DB read error", async () => {
    fixtureError = { message: "connection refused" };
    expect(await getTierGenerationMode("case-decoder")).toBe("session");
  });

  it("caches within the TTL window (second call does not re-query)", async () => {
    fixtureRow = { mode: "mechanical" };
    const a = await getTierGenerationMode("case-decoder");
    // Change fixture — cache should shield us from the new value
    fixtureRow = { mode: "session" };
    const b = await getTierGenerationMode("case-decoder");
    expect(a).toBe("mechanical");
    expect(b).toBe("mechanical");
  });
});
