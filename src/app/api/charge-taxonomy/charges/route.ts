import { NextRequest, NextResponse } from "next/server";
import { getCommonCharges } from "@/lib/charge-taxonomy";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(supabase, `taxonomy-charges:${ip}`, 30, 60);
    if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json([]);

    const category = req.nextUrl.searchParams.get("category");
    const jurisdiction = req.nextUrl.searchParams.get("jurisdiction");
    if (!category) return NextResponse.json([]);

    const charges = await getCommonCharges(category, jurisdiction, url, key);

    // If jurisdiction provided, enrich with statute info (single batch query)
    if (jurisdiction && charges.length > 0) {
      const slugList = charges.map((c) => c.slug).join(",");
      const statuteRes = await fetch(
        `${url}/rest/v1/jurisdiction_statutes?common_charge_slug=in.(${slugList})&jurisdiction=eq.${encodeURIComponent(jurisdiction)}&active=eq.true&select=common_charge_slug,statute_number,offense_class,penalty_min,penalty_max,fine_max,mandatory_minimum`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const statutes: Array<{
        common_charge_slug: string;
        statute_number: string | null;
        offense_class: string | null;
        penalty_min: string | null;
        penalty_max: string | null;
        fine_max: string | null;
        mandatory_minimum: string | null;
      }> = statuteRes.ok ? await statuteRes.json() : [];
      const statuteMap = new Map(statutes.map((s) => [s.common_charge_slug, s]));

      const enriched = charges.map((c) => {
        const statute = statuteMap.get(c.slug);
        return {
          slug: c.slug,
          label: c.label,
          description: c.description,
          statute_number: statute?.statute_number ?? null,
          offense_class: statute?.offense_class ?? null,
          penalty_min: statute?.penalty_min ?? null,
          penalty_max: statute?.penalty_max ?? null,
          fine_max: statute?.fine_max ?? null,
          mandatory_minimum: statute?.mandatory_minimum ?? null,
        };
      });
      return NextResponse.json(enriched, {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    }

    return NextResponse.json(charges.map(c => ({
      slug: c.slug,
      label: c.label,
      description: c.description,
      statute_number: null,
      offense_class: null,
    })), {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json([]);
  }
}
