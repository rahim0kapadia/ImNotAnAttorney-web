/**
 * GET /api/court-reminders/unsubscribe?token=xxx, Unsubscribes a reminder.
 * Sets status to 'unsubscribed'. Shows a simple confirmation page.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("court_reminders")
    .update({ status: "unsubscribed" })
    .eq("token", token)
    .eq("status", "active");

  if (error) {
    console.error("[Court Reminders] Unsubscribe error:", error);
  }

  // Always show success (even if token not found, prevent enumeration)
  return new NextResponse(
    `<!DOCTYPE html>
    <html lang="en"><head><meta charset="utf-8"><title>Unsubscribed</title>
    <style>body{background:#0C0A09;color:#D4D4D8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
    .box{text-align:center;max-width:400px;padding:2rem;}</style></head>
    <body><div class="box"><h1 style="color:#F59E0B;">Unsubscribed</h1>
    <p>You won't receive any more court date reminders from us.</p>
    <p style="color:#71717A;font-size:13px;margin-top:2rem;">If you change your mind, you can sign up again anytime.</p>
    </div></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
