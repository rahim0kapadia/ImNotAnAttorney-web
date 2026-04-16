/**
 * GET /api/customer/cases, Customer dashboard data.
 *
 * Returns the customer's orders and cases.
 * Auth: session cookie validated via requireCustomerAuth().
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCustomerAuth } from "@/lib/customer-helpers";

export async function GET(req: NextRequest) {
  const { customer, error: authError } = await requireCustomerAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Fetch orders for this customer
    const { data: orders } = await supabase
      .from("orders")
      .select("id, tier, amount, status, paid_at, created_at, priority_delivery")
      .eq("email", customer.email)
      .order("created_at", { ascending: false });

    // Fetch cases for this customer
    const { data: cases } = await supabase
      .from("cases")
      .select("id, order_id, tier, status, delivered_at, created_at, report_token")
      .eq("email", customer.email)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      orders: orders || [],
      cases: cases || [],
    });
  } catch (err) {
    console.error("[customer/cases] Failed to fetch customer data:", err);
    return NextResponse.json({ error: "Failed to fetch customer data" }, { status: 500 });
  }
}
