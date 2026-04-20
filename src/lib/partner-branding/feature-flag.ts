export function partnerBrandingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PARTNER_BRANDING_ENABLED === "true";
}
