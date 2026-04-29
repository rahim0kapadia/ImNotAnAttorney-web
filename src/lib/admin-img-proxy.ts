/**
 * HMAC-signed URL helper for /api/admin/img-proxy.
 *
 * Server-only — uses Web Crypto via globalThis.crypto.subtle. Lives in a
 * separate module so the emails route can import sign() without dragging the
 * route handler module graph along.
 *
 * Secret resolution (strict — no literal fallback):
 *   ADMIN_IMG_PROXY_SECRET || IMG_PROXY_SECRET || ADMIN_PASSWORD
 * Throws at first call if all three are unset. We reuse ADMIN_PASSWORD only
 * as a transition fallback — set ADMIN_IMG_PROXY_SECRET in production to
 * decouple proxy URL forgery from admin auth.
 */

const ENC = new TextEncoder();

function getSecret(): string {
  const s =
    process.env.ADMIN_IMG_PROXY_SECRET ||
    process.env.IMG_PROXY_SECRET ||
    process.env.ADMIN_PASSWORD;
  if (!s || s.length < 16) {
    throw new Error(
      "img-proxy secret missing or too short — set ADMIN_IMG_PROXY_SECRET (>=16 chars)"
    );
  }
  return s;
}

/** Signed URL TTL — short enough that a leaked URL (referer, history, screen
 *  share) is not a long-lived fetch oracle. 2h covers a typical admin session. */
export const SIGNED_URL_TTL_MS = 2 * 60 * 60 * 1000;

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENC.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(message));
  // base64url
  const b = Buffer.from(sig).toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sign `url + "|" + exp` -> HMAC-SHA256 base64url. exp is ms since epoch. */
export async function signImgUrl(url: string, expMs: number): Promise<string> {
  return hmac(url + "|" + String(expMs));
}

export async function verifyImgUrl(
  url: string,
  exp: string,
  sig: string
): Promise<boolean> {
  if (!url || !exp || !sig) return false;
  const expected = await signImgUrl(url, Number(exp));
  // Constant-time compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Rewrite `<img src="https://x">` URLs in `html` to point at our proxy.
 * Skips: data: URIs, cid: refs, already-relative URLs, our own origin.
 * Returns the rewritten HTML.
 */
export async function rewriteImgUrls(html: string): Promise<string> {
  if (!html || html.indexOf("<img") === -1) return html;
  const exp = Date.now() + SIGNED_URL_TTL_MS;

  // Collect unique src URLs first to minimize HMAC calls (and they're async).
  const urls = new Set<string>();
  const re = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = m[2];
    if (!u) continue;
    if (u.startsWith("data:") || u.startsWith("cid:")) continue;
    if (!/^https?:\/\//i.test(u)) continue;
    urls.add(u);
  }
  if (urls.size === 0) return html;

  const sigs: Record<string, string> = {};
  await Promise.all(
    Array.from(urls).map(async (u) => {
      sigs[u] = await signImgUrl(u, exp);
    })
  );

  return html.replace(re, (whole, quote: string, src: string) => {
    if (!src) return whole;
    if (src.startsWith("data:") || src.startsWith("cid:")) return whole;
    if (!/^https?:\/\//i.test(src)) return whole;
    const sig = sigs[src];
    if (!sig) return whole;
    const proxied =
      "/api/admin/img-proxy?u=" +
      encodeURIComponent(src) +
      "&exp=" +
      exp +
      "&sig=" +
      sig;
    return whole.replace(quote + src + quote, quote + proxied + quote);
  });
}
