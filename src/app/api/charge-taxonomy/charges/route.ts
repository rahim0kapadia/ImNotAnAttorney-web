import { NextRequest, NextResponse } from "next/server";
import { getCommonCharges, getJurisdictionStatute } from "@/lib/charge-taxonomy";

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json([]);

    const category = req.nextUrl.searchParams.get("category");
    const jurisdiction = req.nextUrl.searchParams.get("jurisdiction");
    if (!category) return NextResponse.json([]);

    const charges = await getCommonCharges(category, jurisdiction, url, key);

    // If jurisdiction provided, enrich with statute info
    if (jurisdiction) {
      const enriched = await Promise.all(charges.map(async (c) => {
        const statute = await getJurisdictionStatute(c.slug, jurisdiction, url, key);
        return {
          slug: c.slug,
          label: c.label,
          description: c.description,
          statute_number: statute?.statute_number ?? null,
          offense_class: statute?.offense_class ?? null,
        };
      }));
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
