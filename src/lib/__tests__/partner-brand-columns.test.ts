import { describe, it, expect } from "vitest";
import { PARTNER_BRAND_COLUMNS, PARTNER_BRAND_SELECT } from "../partner-brand-columns";

describe("PARTNER_BRAND_COLUMNS", () => {
  it("includes every partner-branding column consumed by OG images and PartnerBrandedShell", () => {
    expect(PARTNER_BRAND_COLUMNS).toEqual([
      "logo_url",
      "logo_storage_path",
      "brand_color_primary",
      "brand_color_accent",
      "brand_color_bg",
      "brand_color_source",
      "website_url",
      "brand_contrast_passed",
      "brand_updated_at",
    ]);
  });

  it("PARTNER_BRAND_SELECT returns a comma-joined SELECT fragment", () => {
    expect(PARTNER_BRAND_SELECT).toBe(
      "logo_url, logo_storage_path, brand_color_primary, brand_color_accent, brand_color_bg, brand_color_source, website_url, brand_contrast_passed, brand_updated_at"
    );
  });
});
