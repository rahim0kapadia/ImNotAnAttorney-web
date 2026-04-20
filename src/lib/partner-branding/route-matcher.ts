import { PROMO_CODE_REGEX } from "@/lib/promo-code";

const PARTNER_BRANDED_SUFFIXES = ["", "/reminders"];

/**
 * True when `pathname` is a pre-quiz partner-branded surface (the
 * referral bridge `/r/[code]` or its reminders page). Used by the root
 * layout to suppress global Header/Footer so the shell owns chrome.
 *
 * The `[code]` segment must match the canonical promo-code shape from
 * `src/lib/promo-code.ts` (`[A-Z0-9]{2,20}`, case-insensitive). Keeping
 * a single source of truth prevents drift where this route-matcher
 * accepts 3-char+ codes but real partners with 2-char codes (e.g.
 * "FL", "AA") get their branding silently stripped.
 */
export function isPartnerBrandedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const match = pathname.match(/^\/r\/([^/]+)(\/.*)?$/);
  if (!match) return false;
  const code = match[1];
  if (!code) return false;
  if (!PROMO_CODE_REGEX.test(code)) return false;
  const suffix = match[2] ?? "";
  return PARTNER_BRANDED_SUFFIXES.includes(suffix);
}
