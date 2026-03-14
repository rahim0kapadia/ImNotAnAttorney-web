import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/score/count — Returns the total score completions count.
 * Cached for 60 seconds to avoid hammering Supabase on every page load.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("counters")
      .select("value")
      .eq("id", "score_completions")
      .single();

    if (error || !data) {
      return NextResponse.json({ count: 0 }, {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
      });
    }

    return NextResponse.json({ count: data.value }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
