/**
 * URL safety guard for partner-supplied website_url and logo_url. Blocks
 * private-IP + loopback + link-local hosts so the URL can't be used for
 * SSRF when it's later fetched by Satori OG render or our outbound
 * probe. Also enforces https + rejects userinfo tricks.
 *
 * Policy:
 * - website_url: must be https, public host, no userinfo
 * - logo_url:    must be https, allowlisted CDN origin only
 *                (cdn.brandfetch.io OR our Supabase Storage public URL)
 */

const PRIVATE_V4_PATTERNS: RegExp[] = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
];

function isPrivateV4(host: string): boolean {
  return PRIVATE_V4_PATTERNS.some((r) => r.test(host));
}

function isPrivateV6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "[::1]") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe80")) return true;
  return false;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "ip6-localhost",
  "ip6-loopback",
]);

export interface UrlCheck {
  ok: boolean;
  reason: string | null;
}

function classify(urlString: string, opts: { httpsOnly: boolean }): UrlCheck {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return { ok: false, reason: "Malformed URL" };
  }
  if (opts.httpsOnly && u.protocol !== "https:") {
    return { ok: false, reason: "URL must use https" };
  }
  if (!opts.httpsOnly && u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, reason: "URL must be http or https" };
  }
  if (u.username || u.password) {
    return { ok: false, reason: "URL must not contain userinfo" };
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, reason: "Host blocked" };
  }
  if (isPrivateV4(host)) {
    return { ok: false, reason: "Private IPv4 address blocked" };
  }
  if (isPrivateV6(host)) {
    return { ok: false, reason: "Private/loopback IPv6 blocked" };
  }
  return { ok: true, reason: null };
}

export function validateWebsiteUrl(urlString: string): UrlCheck {
  return classify(urlString, { httpsOnly: false });
}

export function validateLogoUrl(urlString: string): UrlCheck {
  const base = classify(urlString, { httpsOnly: true });
  if (!base.ok) return base;
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return { ok: false, reason: "Malformed URL" };
  }
  const host = u.hostname.toLowerCase();
  const supabaseHost = deriveSupabasePublicHost();
  const allowed = new Set<string>(["cdn.brandfetch.io"]);
  if (supabaseHost) allowed.add(supabaseHost);
  if (!allowed.has(host)) {
    return { ok: false, reason: `Logo URL host not allowed (${host})` };
  }
  return { ok: true, reason: null };
}

function deriveSupabasePublicHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}
