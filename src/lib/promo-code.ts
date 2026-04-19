export const PROMO_CODE_REGEX = /^[A-Z0-9]{2,20}$/i;
export function isValidPromoCode(code: string): boolean {
  return PROMO_CODE_REGEX.test(code);
}
