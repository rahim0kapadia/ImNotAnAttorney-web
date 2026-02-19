import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, email, chargeType } = body;

    if (!firstName || !email || !chargeType) {
      return NextResponse.json(
        { error: "Required fields missing" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase.from("intakes").insert({
      first_name: firstName,
      last_name: body.lastName || null,
      email: email.toLowerCase().trim(),
      phone: body.phone || null,
      charge_type: chargeType,
      state: body.state || null,
      has_attorney: body.hasAttorney || null,
      has_discovery: body.hasDiscovery || null,
      services: body.services || [],
      situation: body.situation || null,
    });

    if (error) {
      console.error("[Intake] Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Intake received" });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
