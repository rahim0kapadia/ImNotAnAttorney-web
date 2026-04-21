import { describe, it, expect, vi, beforeEach } from "vitest";
import { PARTNER_BRAND_COLUMNS } from "../partner-brand-columns";

const capturedSelects: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (cols: string) => {
        capturedSelects.push(cols);
        return {
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
            }),
          }),
        };
      },
    }),
  }),
}));

describe("getPartnerByCode", () => {
  beforeEach(() => {
    capturedSelects.length = 0;
  });

  it("SELECT string includes every PARTNER_BRAND_COLUMNS entry", async () => {
    const { getPartnerByCode } = await import("../partner-by-code");
    await getPartnerByCode("TESTCODE1");

    expect(capturedSelects).toHaveLength(1);
    const select = capturedSelects[0];
    for (const col of PARTNER_BRAND_COLUMNS) {
      expect(select).toContain(col);
    }
  });

  it("SELECT string includes partner identity columns", async () => {
    const { getPartnerByCode } = await import("../partner-by-code");
    await getPartnerByCode("TESTCODE2");

    const select = capturedSelects[0];
    expect(select).toContain("id");
    expect(select).toContain("promo_code");
    expect(select).toContain("status");
    expect(select).toContain("check_in_enabled");
  });
});
