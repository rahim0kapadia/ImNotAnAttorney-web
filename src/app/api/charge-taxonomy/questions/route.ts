import { NextRequest, NextResponse } from "next/server";
import { getChargeQuestions } from "@/lib/charge-taxonomy";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(supabase, `taxonomy-questions:${ip}`, 30, 60);
    if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json([]);

    const charge = req.nextUrl.searchParams.get("charge");
    if (!charge) return NextResponse.json([]);

    const questions = await getChargeQuestions(charge, url, key);
    return NextResponse.json(questions.map(q => ({
      question_id: q.question_id,
      label: q.label,
      options: q.options,
    })), {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json([]);
  }
}
