/**
 * Extracted validator for partner logo_storage_path values. Kept in a
 * separate module so we can unit-test it without spinning up the API
 * route's request pipeline.
 *
 * Rules (must match /api/partner/branding/save route — single source of
 * truth):
 *   - Pre-filter: reject % (URL-encoded traversal), backslash, null byte.
 *   - Strict regex: `<PROMO>/<file>.<ext>` exact shape.
 *       PROMO = [A-Z0-9]{2,20}
 *       file  = [A-Za-z0-9][A-Za-z0-9._-]*
 *       ext   = png | jpg | jpeg | webp (case-insensitive)
 *   - First segment must equal partner.promo_code (case-insensitive).
 */

export type LogoPathCheck =
  | { ok: true }
  | { ok: false; error: string; status: 400 };

const STRICT_PATH = /^[A-Z0-9]{2,20}\/[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpg|jpeg|webp)$/i;

export function validateLogoStoragePath(
  val: unknown,
  promoCode: string | null | undefined,
): LogoPathCheck {
  if (!promoCode) {
    return { ok: false, status: 400, error: "logo_storage_path requires an approved partner promo_code" };
  }
  if (typeof val !== "string" || val.length === 0 || val.length > 500) {
    return { ok: false, status: 400, error: "logo_storage_path invalid" };
  }
  if (val.includes("%") || val.includes("\\") || val.includes("\0")) {
    return { ok: false, status: 400, error: "logo_storage_path must not contain %, backslash, or null" };
  }
  if (!STRICT_PATH.test(val)) {
    return { ok: false, status: 400, error: "logo_storage_path must be `<PROMO>/<file>.(png|jpg|jpeg|webp)` with no traversal" };
  }
  const firstSegment = val.split("/")[0];
  if (firstSegment.toUpperCase() !== promoCode.toUpperCase()) {
    return { ok: false, status: 400, error: "logo_storage_path must live under your own partner folder" };
  }
  return { ok: true };
}
