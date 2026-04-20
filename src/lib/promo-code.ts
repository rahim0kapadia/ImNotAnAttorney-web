export const PROMO_CODE_REGEX = /^[A-Z0-9]{2,20}$/i;
export function isValidPromoCode(code: unknown): code is string {
  return typeof code === "string" && PROMO_CODE_REGEX.test(code);
}
