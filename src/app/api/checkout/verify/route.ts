import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return NextResponse.json({ verified: false });
    }
    return NextResponse.json({
      verified: true,
      tier: session.metadata?.tier,
      email: session.customer_email || session.customer_details?.email,
      amount: session.amount_total,
      productName: session.metadata?.product_name,
    });
  } catch {
    return NextResponse.json({ verified: false });
  }
}
