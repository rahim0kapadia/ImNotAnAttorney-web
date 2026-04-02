import { NextResponse } from "next/server";
import { getChargeCategories } from "@/lib/charge-taxonomy";

export async function GET() {
  try {
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
