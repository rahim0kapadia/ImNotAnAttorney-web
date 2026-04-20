/**
 * PATCH /api/partner/branding/save — save partner branding fields.
 *
 * Auth: partner session cookie.
 * Accepts: brand_color_primary, brand_color_accent, brand_color_bg,
 *          brand_color_source, website_url, logo_url, logo_storage_path.
 * Enforces:
 *  - Hex format on color fields.
 *  - URL safety on website_url + logo_url (blocks private IPs + userinfo;
 *    logo_url host must be our Supabase Storage or cdn.brandfetch.io).
 *  - Brand primary must pass WCAG AA (>=4.5:1) against the site's dark bg (#000).
 *  - brand_contrast_passed is recomputed against the EFFECTIVE primary
 *    (merging the request over the stored row) so partial updates don't
 *    silently flip the flag.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import { brandPassesSiteContrast, isHexColor } from "@/lib/partner-branding/contrast-guard";
import { validateWebsiteUrl, validateLogoUrl } from "@/lib/partner-branding/url-guard";
import { checkRateLimit } from "@/lib/rate-limit";

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

function nullableHex(
  key: string,
  val: unknown,
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (val === undefined) return { ok: true, value: undefined };
  if (val === null || val === "") return { ok: true, value: null };
  if (typeof val !== "string" || !isHexColor(val)) {
    return { ok: false, error: `${key} must be #RRGGBB` };
  }
  return { ok: true, value: val.toUpperCase() };
}

export async function PATCH(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();

  const { limited } = await checkRateLimit(
    supabase,
    `partner-branding-save:${partner.id}`,
    30,
    60 * 60,
  );
  if (limited) {
    return NextResponse.json({ error: "Too many save attempts. Try again later." }, { status: 429 });
  }

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
    const parsed = nullableHex(key, body[key]);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (parsed.value !== undefined) {
      updates[key] = parsed.value;
    }
  }

  if (body.brand_color_source !== undefined) {
    const src = body.brand_color_source;
    if (src !== null && (typeof src !== "string" || !VALID_SOURCES.has(src))) {
      return NextResponse.json({ error: "brand_color_source invalid" }, { status: 400 });
    }
    updates.brand_color_source = src ?? null;
  }

  if (body.website_url !== undefined) {
    const val = body.website_url;
    if (val === null || val === "") {
      updates.website_url = null;
    } else if (typeof val !== "string" || val.length > 500) {
      return NextResponse.json({ error: "website_url invalid" }, { status: 400 });
    } else {
      const check = validateWebsiteUrl(val);
      if (!check.ok) {
        return NextResponse.json({ error: check.reason ?? "website_url rejected" }, { status: 400 });
      }
      updates.website_url = val;
    }
  }

  if (body.logo_url !== undefined) {
    const val = body.logo_url;
    if (val === null || val === "") {
      updates.logo_url = null;
    } else if (typeof val !== "string" || val.length > 500) {
      return NextResponse.json({ error: "logo_url invalid" }, { status: 400 });
    } else {
      const check = validateLogoUrl(val);
      if (!check.ok) {
        return NextResponse.json({ error: check.reason ?? "logo_url rejected" }, { status: 400 });
      }
      updates.logo_url = val;
    }
  }

  if (body.logo_storage_path !== undefined) {
    const val = body.logo_storage_path;
    if (val === null || val === "") {
      updates.logo_storage_path = null;
    } else if (typeof val !== "string" || val.length > 500) {
      return NextResponse.json({ error: "logo_storage_path invalid" }, { status: 400 });
    } else {
      // Path MUST live under this partner's promo_code folder. Without this
      // guard, Partner A can PATCH logo_storage_path="BB/logo.png" and a
      // subsequent upload for Partner A would trigger a cross-partner
      // storage.remove() against Partner B's object (horizontal file
      // deletion). Partner-owner check tied to promo_code prefix.
      const expectedPrefix = `${partner.promo_code}/`;
      if (!val.startsWith(expectedPrefix)) {
        return NextResponse.json(
          { error: "logo_storage_path must live under your own partner folder" },
          { status: 400 },
        );
      }
      updates.logo_storage_path = val;
    }
  }

  // Re-evaluate contrast against the EFFECTIVE primary (stored merged
  // with request). Partial updates must not silently flip the flag.
  const primaryRequested = "brand_color_primary" in updates
    ? (updates.brand_color_primary as string | null)
    : undefined;

  let effectivePrimary: string | null;
  if (primaryRequested !== undefined) {
    effectivePrimary = primaryRequested;
  } else {
    const { data: existing, error: loadErr } = await supabase
      .from("partners")
      .select("brand_color_primary")
      .eq("id", partner.id)
      .single();
    if (loadErr) {
      console.error("[PartnerBranding] load existing primary failed:", loadErr);
      return NextResponse.json({ error: "Failed to save branding" }, { status: 500 });
    }
    effectivePrimary = (existing?.brand_color_primary as string | null) ?? null;
  }

  let contrastPassed = false;
  if (typeof effectivePrimary === "string" && isHexColor(effectivePrimary)) {
    contrastPassed = brandPassesSiteContrast(effectivePrimary);
    if (primaryRequested !== undefined && !contrastPassed) {
      return NextResponse.json(
        { error: "Primary color fails WCAG AA (>=4.5:1) against the site dark background (#000). Pick a lighter or more saturated color." },
        { status: 422 },
      );
    }
  }

  updates.brand_contrast_passed = contrastPassed;
  updates.brand_updated_at = new Date().toISOString();
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase.from("partners").update(updates).eq("id", partner.id);
  if (error) {
    console.error("[PartnerBranding] save error:", error);
    return NextResponse.json({ error: "Failed to save branding" }, { status: 500 });
  }
  return NextResponse.json({ saved: true, brand_contrast_passed: contrastPassed });
}
