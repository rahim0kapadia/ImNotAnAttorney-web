import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPromoCode } from "@/lib/promo-code";

export const getPartnerByCode = cache(async (code: string) => {
  if (!isValidPromoCode(code)) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("partners")
    .select("id, name, company, city, promo_code, status, check_in_enabled, flip_at, logo_url, logo_storage_path, brand_color_primary, brand_color_accent, brand_color_bg, brand_color_source, website_url, brand_contrast_passed, brand_updated_at")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  return data;
});
