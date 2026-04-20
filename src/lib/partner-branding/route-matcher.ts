const PARTNER_BRANDED_SUFFIXES = ["", "/reminders"];
// Promo codes are 3-20 chars, uppercase alphanumeric + underscore.
// Pattern match guards against future sibling routes like /r/admin
// or /r/login accidentally rendering partner chrome.
const PROMO_CODE_SHAPE = /^[A-Z0-9_]{3,20}$/;

export function isPartnerBrandedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const match = pathname.match(/^\/r\/([^/]+)(\/.*)?$/);
  if (!match) return false;
  const code = match[1];
  if (!code) return false;
  if (!PROMO_CODE_SHAPE.test(code)) return false;
  const suffix = match[2] ?? "";
  return PARTNER_BRANDED_SUFFIXES.includes(suffix);
}
