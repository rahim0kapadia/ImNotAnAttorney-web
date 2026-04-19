import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export const getPartnerByCode = cache(async (code: string) => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("partners")
    .select("id, name, company, city, promo_code, status, check_in_enabled, flip_at")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  return data;
});
