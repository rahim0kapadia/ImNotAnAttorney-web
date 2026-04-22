import { describe, it, expect, vi, beforeEach } from "vitest";
import { PARTNER_BRAND_COLUMNS } from "../partner-brand-columns";

const capturedSelects: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const chainable = {
      from: (table: string) => ({
        select: (cols: string) => {
          capturedSelects.push(`${table}::${cols}`);
          return {
            eq: () => chainable.from(table).select(cols),
            gt: () => chainable.from(table).select(cols),
            limit: () => chainable.from(table).select(cols),
            maybeSingle: async () => ({
              data: { partner_id: "test-partner-id" },
              error: null,
            }),
            single: async () => ({ data: null, error: new Error("stop") }),
          };
        },
      }),
    };
    return chainable;
  },
}));

describe("validatePartnerSession", () => {
  beforeEach(() => {
    capturedSelects.length = 0;
  });

  it("partners SELECT includes every PARTNER_BRAND_COLUMNS entry", async () => {
    const { validatePartnerSession } = await import("../partner-auth");
    await validatePartnerSession("fake-session-token");

    const partnersSelect = capturedSelects.find((s) =>
      s.startsWith("partners::")
    );
    expect(partnersSelect, "expected a SELECT on partners").toBeTruthy();
    for (const col of PARTNER_BRAND_COLUMNS) {
      expect(partnersSelect).toContain(col);
    }
  });
});
