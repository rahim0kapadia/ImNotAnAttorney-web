import { NextRequest, NextResponse } from "next/server";
import { getChargeCategories } from "@/lib/charge-taxonomy";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(supabase, `taxonomy-categories:${ip}`, 30, 60);
    if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json([]);
    const categories = await getChargeCategories(url, key);
    return NextResponse.json(categories, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json([]);
  }
}
