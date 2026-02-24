import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function decodeEmail(param: string): string | null {
  try {
    const email = Buffer.from(param, "base64").toString("utf-8");
    if (!email || !email.includes("@")) return null;
    return email;
  } catch {
    return null;
  }
}

// GET: Show confirmation page (safe for email prefetch — no state change)
export async function GET(req: NextRequest) {
  const emailParam = req.nextUrl.searchParams.get("email");

  if (!emailParam) {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=missing", req.url)
    );
  }

  const email = decodeEmail(emailParam);
  if (!email) {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=invalid", req.url)
    );
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>Confirm Unsubscribe</title></head>
<body style="font-family: Arial, sans-serif; background: #0C0A09; color: #D4D4D8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
  <div style="text-align: center; max-width: 400px; padding: 32px;">
    <h1 style="color: #F59E0B;">Unsubscribe</h1>
    <p>Are you sure you want to unsubscribe?</p>
    <p style="color: #A1A1AA; font-size: 14px;">You will stop receiving emails from ImNotAnAttorney.</p>
    <form method="POST" action="${origin}/api/unsubscribe">
      <input type="hidden" name="email" value="${emailParam}" />
      <button type="submit" style="margin-top: 16px; padding: 12px 32px; background: #EF4444; color: white; font-weight: bold; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
        Confirm Unsubscribe
      </button>
    </form>
    <p style="margin-top: 16px;"><a href="${origin}" style="color: #F59E0B; text-decoration: underline;">Never mind, take me back</a></p>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

// POST: Process unsubscribe (from confirmation form or RFC 8058 one-click)
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  let emailParam: string | null = null;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    // Check for RFC 8058 one-click unsubscribe
    const listUnsub = formData.get("List-Unsubscribe");
    if (listUnsub === "One-Click") {
      // RFC 8058: email is in the URL query param
      emailParam = req.nextUrl.searchParams.get("email");
    } else {
      // Form submission from confirmation page
      emailParam = formData.get("email") as string | null;
    }
  } else {
    // JSON body fallback
    const body = await req.json().catch(() => ({}));
    emailParam = body.email || null;
  }

  if (!emailParam) {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=missing", req.url)
    );
  }

  const email = decodeEmail(emailParam);
  if (!email) {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=invalid", req.url)
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", email.toLowerCase().trim());

  if (error) {
    console.error("[Unsubscribe] Supabase error:", error);
  }

  // Always show success (don't leak whether email exists)
  return NextResponse.redirect(new URL("/unsubscribe?success=true", req.url));
}
