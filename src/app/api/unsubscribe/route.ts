import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const emailParam = req.nextUrl.searchParams.get("email");

  if (!emailParam) {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=missing", req.url)
    );
  }

  let email: string;
  try {
    email = Buffer.from(emailParam, "base64").toString("utf-8");
  } catch {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=invalid", req.url)
    );
  }

  if (!email || !email.includes("@")) {
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

  // Always show success to the user (even if email wasn't found — don't leak info)
  return NextResponse.redirect(new URL("/unsubscribe?success=true", req.url));
}
