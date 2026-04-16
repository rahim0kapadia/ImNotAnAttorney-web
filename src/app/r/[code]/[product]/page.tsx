/**
 * /r/[code]/[product], Deep link: sets ref cookie + redirects to product checkout.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REFERRAL_COOKIE_MAX_AGE, sanitizeSubId } from "@/lib/referral";

const PRODUCT_MAP: Record<string, string> = {
  "case-decoder": "case-decoder",
  "intelligence-brief": "intelligence-brief",
  "x-ray": "x-ray",
  "war-room": "war-room",
  "dui": "dui-first-offense",
  "situation-room": "situation-room",
};

interface PageProps {
  params: Promise<{ code: string; product: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function DeepLinkPage({ params, searchParams }: PageProps) {
  const { code, product } = await params;
  const { sub } = await searchParams;

  const tierSlug = PRODUCT_MAP[product.toLowerCase()];
  if (!tierSlug) {
    redirect(`/r/${code}`);
  }

  const supabase = createAdminClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  if (!partner) {
    redirect(`/checkout?tier=${tierSlug}`);
  }

  // Referral cookie is set by middleware (Next.js 16, cookies().set() not allowed in Server Components)

  redirect(`/checkout?tier=${tierSlug}`);
}
