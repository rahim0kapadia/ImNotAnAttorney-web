import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Thin dispatcher — validates auth + idempotency, then fires off
 * the Supabase Edge Function (150s timeout) for the heavy work.
 * Returns immediately so Vercel Hobby's timeout is never hit.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.OPERATOR_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { caseId, force } = body;
  if (!caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch case for idempotency check
  const { data: caseData, error: caseError } = await supabase
    .from("cases")
    .select("status, report_token")
    .eq("id", caseId)
    .single();

  if (caseError || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  // Idempotency: skip if already generated/delivered (unless force=true)
  if (!force && (caseData.status === "review" || caseData.status === "delivered")) {
    return NextResponse.json({
      success: true,
      caseId,
      reportToken: caseData.report_token,
      status: caseData.status,
      skipped: true,
      message: `Report already ${caseData.status}. Pass force:true to regenerate.`,
    });
  }

  // Update status to "generating" so we can track progress
  await supabase
    .from("cases")
    .update({ status: "generating", updated_at: new Date().toISOString() })
    .eq("id", caseId);

  // Fire-and-forget to Supabase Edge Function (150s timeout)
  const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-report`;

  fetch(edgeFunctionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ caseId, force }),
  }).catch((err) =>
    console.error("[Generate] Edge function invocation failed:", err)
  );

  return NextResponse.json({
    success: true,
    caseId,
    status: "generating",
    message: "Report generation started. Check case status for updates.",
  });
}
