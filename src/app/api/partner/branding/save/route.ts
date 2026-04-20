/**
 * PATCH /api/partner/branding/save — save partner branding fields.
 *
 * Auth: partner session cookie.
 * Accepts: brand_color_primary, brand_color_accent, brand_color_bg,
 *          brand_color_source, website_url, logo_url, logo_storage_path.
 * Enforces: hex format + WCAG AA contrast on brand_color_primary.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import { brandPassesSiteContrast, isHexColor } from "@/lib/partner-branding/contrast-guard";

const ALLOWED = new Set([
  "brand_color_primary",
  "brand_color_accent",
  "brand_color_bg",
  "brand_color_source",
  "website_url",
  "logo_url",
  "logo_storage_path",
]);

const VALID_SOURCES = new Set(["brandfetch", "colorthief", "manual"]);

export async function PATCH(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const unknown = Object.keys(body).filter((k) => !ALLOWED.has(k));
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown field(s): ${unknown.join(", ")}` }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  for (const key of ["brand_color_primary", "brand_color_accent", "brand_color_bg"] as const) {
    const val = body[key];
    if (val === undefined) continue;
    if (val === null || val === "") {
      updates[key] = null;
      continue;
    }
    if (typeof val !== "string" || !isHexColor(val)) {
      return NextResponse.json({ error: `${key} must be #RRGGBB` }, { status: 400 });
    }
    updates[key] = val.toUpperCase();
  }

  if (body.brand_color_source !== undefined) {
    const src = body.brand_color_source;
    if (src !== null && (typeof src !== "string" || !VALID_SOURCES.has(src))) {
      return NextResponse.json({ error: "brand_color_source invalid" }, { status: 400 });
    }
    updates.brand_color_source = src ?? null;
  }

  for (const key of ["website_url", "logo_url", "logo_storage_path"] as const) {
    const val = body[key];
    if (val === undefined) continue;
    if (val === null || val === "") {
      updates[key] = null;
      continue;
    }
    if (typeof val !== "string" || val.length > 500) {
      return NextResponse.json({ error: `${key} invalid` }, { status: 400 });
    }
    if (key === "website_url" || key === "logo_url") {
      if (!/^https?:\/\//.test(val)) {
        return NextResponse.json({ error: `${key} must be an http(s) URL` }, { status: 400 });
      }
    }
    updates[key] = val;
  }

  const primaryForCheck =
    (updates.brand_color_primary as string | null | undefined) ??
    (body.brand_color_primary as string | null | undefined);

  let contrastPassed = false;
  if (typeof primaryForCheck === "string" && isHexColor(primaryForCheck)) {
    contrastPassed = brandPassesSiteContrast(primaryForCheck);
    if (!contrastPassed) {
      return NextResponse.json(
        { error: "Primary color fails WCAG AA (>=4.5:1) against both #000 and #FFF backgrounds." },
        { status: 422 },
      );
    }
  }
  updates.brand_contrast_passed = contrastPassed;
  updates.brand_updated_at = new Date().toISOString();
  updates.updated_at = new Date().toISOString();

  const supabase = createAdminClient();
  const { error } = await supabase.from("partners").update(updates).eq("id", partner.id);
  if (error) {
    console.error("[PartnerBranding] save error:", error);
    return NextResponse.json({ error: "Failed to save branding" }, { status: 500 });
  }
  return NextResponse.json({ saved: true, brand_contrast_passed: contrastPassed });
}
