const PARTNER_BRANDED_SUFFIXES = ["", "/reminders"];

export function isPartnerBrandedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const match = pathname.match(/^\/r\/([^/]+)(\/.*)?$/);
  if (!match) return false;
  const code = match[1];
  if (!code || code === "q") return false;
  const suffix = match[2] ?? "";
  return PARTNER_BRANDED_SUFFIXES.includes(suffix);
}
