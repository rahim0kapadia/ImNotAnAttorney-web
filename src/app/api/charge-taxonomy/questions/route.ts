import { NextRequest, NextResponse } from "next/server";
import { getChargeQuestions } from "@/lib/charge-taxonomy";

export async function GET(req: NextRequest) {
  try {
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
    })));
  } catch {
    return NextResponse.json([]);
  }
}
