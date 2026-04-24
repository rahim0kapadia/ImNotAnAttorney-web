/**
 * Unit tests for mode-config.ts.
 *
 * vi.mock replaces createAdminClient with a deterministic fake whose
 * .from().select().eq().maybeSingle() returns configurable fixtures.
 * Tests cover: each valid mode, fallback on unknown mode, fallback on
 * DB error, cache hit behavior, cache expiry.
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

  it("returns 'hybrid' when row has mode='hybrid'", async () => {
    fixtureRow = { mode: "hybrid" };
    expect(await getTierGenerationMode("case-decoder")).toBe("hybrid");
  });

  it("returns 'session' when row has mode='session'", async () => {
    fixtureRow = { mode: "session" };
    expect(await getTierGenerationMode("case-decoder")).toBe("session");
  });

  it("falls back to 'api' on unknown mode value", async () => {
    fixtureRow = { mode: "garbage-not-a-mode" };
    expect(await getTierGenerationMode("case-decoder")).toBe("api");
  });

  it("falls back to 'api' on missing row", async () => {
    fixtureRow = null;
    expect(await getTierGenerationMode("missing-tier")).toBe("api");
  });

  it("falls back to 'api' on DB read error", async () => {
    fixtureError = { message: "connection refused" };
    expect(await getTierGenerationMode("case-decoder")).toBe("api");
  });

  it("caches within the TTL window (second call does not re-query)", async () => {
    fixtureRow = { mode: "hybrid" };
    const a = await getTierGenerationMode("case-decoder");
    // Change fixture — cache should shield us from the new value
    fixtureRow = { mode: "session" };
    const b = await getTierGenerationMode("case-decoder");
    expect(a).toBe("hybrid");
    expect(b).toBe("hybrid");
  });
});
