/**
 * URL safety guard for partner-supplied website_url and logo_url.
 *
 * Protections:
 *  - https-only on logo_url; http+https on website_url
 *  - blocks userinfo (`user:pass@host` SSRF trick)
 *  - blocks private / loopback / link-local / metadata hosts (IPv4 + IPv6,
 *    including IPv4-mapped IPv6 + alternate IPv4 literal forms like
 *    decimal/hex/octal/short dotted)
 *  - blocks multicast / reserved / TEST-NET / benchmarking ranges
 *  - logo_url: host must be on the strict CDN allowlist (Brandfetch CDN
 *    or our Supabase Storage public host)
 *  - IDN normalization via url.hostname (WHATWG URL already applies
 *    punycode); explicit `domainToASCII` fallback via URL parser
 */

import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

const ALLOWED_LOGO_HOSTS = new Set<string>(["cdn.brandfetch.io"]);

export interface UrlCheck {
  ok: boolean;
  reason: string | null;
}

function stripBrackets(host: string): string {
  if (host.startsWith("[") && host.endsWith("]")) return host.slice(1, -1);
  return host;
}

function parseIntMaybe(x: string, radix: number): number | null {
  if (x === "") return null;
  if (radix === 10 && !/^\d+$/.test(x)) return null;
  if (radix === 16 && !/^[0-9a-fA-F]+$/.test(x)) return null;
  if (radix === 8 && !/^[0-7]+$/.test(x)) return null;
  const n = parseInt(x, radix);
  return Number.isFinite(n) ? n : null;
}

function parsePart(raw: string): number | null {
  const s = raw.toLowerCase();
  if (/^0x[0-9a-f]+$/.test(s)) return parseIntMaybe(s.slice(2), 16);
  if (/^0[0-7]+$/.test(s)) return parseIntMaybe(s.slice(1), 8);
  return parseIntMaybe(s, 10);
}

/**
 * Canonicalize any IPv4 literal form (decimal, hex, octal, short) to a
 * 32-bit number. Accepts dotted-quad, dotted-3, dotted-2, single-integer.
 * Returns null when the input is not an IPv4 literal at all (e.g. a
 * normal DNS hostname).
 */
function canonicalizeV4(host: string): number | null {
  const parts = host.split(".");
  if (parts.length > 4 || parts.length < 1) return null;
  const nums = parts.map(parsePart);
  if (nums.some((n) => n === null)) return null;
  const finite = nums as number[];
  let value: number;
  if (parts.length === 4) {
    if (finite.some((n) => n < 0 || n > 255)) return null;
    value = ((finite[0] << 24) | (finite[1] << 16) | (finite[2] << 8) | finite[3]) >>> 0;
  } else if (parts.length === 3) {
    if (finite[0] > 255 || finite[1] > 255) return null;
    if (finite[2] > 0xffff) return null;
    value = (((finite[0] << 24) >>> 0) | ((finite[1] << 16) >>> 0) | (finite[2] & 0xffff)) >>> 0;
  } else if (parts.length === 2) {
    if (finite[0] > 255) return null;
    if (finite[1] > 0xffffff) return null;
    value = (((finite[0] << 24) >>> 0) | (finite[1] & 0xffffff)) >>> 0;
  } else {
    if (finite[0] > 0xffffffff) return null;
    value = finite[0] >>> 0;
  }
  return value;
}

interface IpRange {
  start: number;
  end: number;
}

const BLOCKED_V4_RANGES: IpRange[] = [
  { start: 0x00000000, end: 0x00ffffff }, // 0.0.0.0/8
  { start: 0x0a000000, end: 0x0affffff }, // 10.0.0.0/8
  { start: 0x64400000, end: 0x647fffff }, // 100.64.0.0/10 (CGNAT)
  { start: 0x7f000000, end: 0x7fffffff }, // 127.0.0.0/8 (loopback)
  { start: 0xa9fe0000, end: 0xa9feffff }, // 169.254.0.0/16 (link-local)
  { start: 0xac100000, end: 0xac1fffff }, // 172.16.0.0/12
  { start: 0xc0000000, end: 0xc00000ff }, // 192.0.0.0/24 (IETF)
  { start: 0xc0000200, end: 0xc00002ff }, // 192.0.2.0/24 (TEST-NET-1)
  { start: 0xc0a80000, end: 0xc0a8ffff }, // 192.168.0.0/16
  { start: 0xc6120000, end: 0xc613ffff }, // 198.18.0.0/15 (benchmarking)
  { start: 0xc6336400, end: 0xc63364ff }, // 198.51.100.0/24 (TEST-NET-2)
  { start: 0xcb007100, end: 0xcb0071ff }, // 203.0.113.0/24 (TEST-NET-3)
  { start: 0xe0000000, end: 0xefffffff }, // 224.0.0.0/4 (multicast)
  { start: 0xf0000000, end: 0xffffffff }, // 240.0.0.0/4 (reserved + broadcast)
];

function v4InBlockedRange(n: number): boolean {
  return BLOCKED_V4_RANGES.some((r) => n >= r.start && n <= r.end);
}

/**
 * Expand an IPv6 address string (possibly compressed with `::`, possibly
 * ending with a dotted-quad IPv4 embedding) into the canonical array of
 * 8 16-bit groups. Returns null on malformed input.
 */
function expandIpv6(bare: string): number[] | null {
  if (!bare || bare.length > 45) return null;
  const doubleColonCount = (bare.match(/::/g) || []).length;
  if (doubleColonCount > 1) return null;

  let left = "";
  let right = "";
  if (doubleColonCount === 1) {
    const idx = bare.indexOf("::");
    left = bare.slice(0, idx);
    right = bare.slice(idx + 2);
  } else {
    left = bare;
  }

  const parseGroups = (s: string): number[] | null => {
    if (!s) return [];
    const parts = s.split(":");
    const out: number[] = [];
    for (let i = 0; i < parts.length; i += 1) {
      const g = parts[i];
      if (g.includes(".")) {
        // Embedded IPv4 only valid in last position of full address.
        if (i !== parts.length - 1) return null;
        const v4 = canonicalizeV4(g);
        if (v4 === null) return null;
        out.push((v4 >>> 16) & 0xffff);
        out.push(v4 & 0xffff);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
        out.push(parseInt(g, 16));
      }
    }
    return out;
  };

  const leftGroups = parseGroups(left);
  const rightGroups = parseGroups(right);
  if (leftGroups === null || rightGroups === null) return null;

  let groups: number[];
  if (doubleColonCount === 1) {
    const fill = 8 - leftGroups.length - rightGroups.length;
    if (fill < 0) return null;
    groups = [...leftGroups, ...Array(fill).fill(0), ...rightGroups];
  } else {
    groups = leftGroups;
  }
  return groups.length === 8 ? groups : null;
}

/**
 * Reject IPv6 loopback, ULA (fc00::/7), link-local (fe80::/10),
 * multicast (ff00::/8), unspecified (::), and IPv4-mapped / 4-compatible
 * embeddings of any blocked IPv4 address.
 */
function isBlockedV6(bare: string): boolean {
  const h = bare.toLowerCase();
  const groups = expandIpv6(h);
  if (!groups) {
    // Fall back to textual checks if expansion fails.
    if (h === "::" || h === "::1") return true;
    if (/^fe[89ab][0-9a-f]/.test(h)) return true;
    if (/^f[cd]/.test(h)) return true;
    if (/^ff/.test(h)) return true;
    return false;
  }
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  // ::1 or ::
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0) {
    if (g7 === 0 || g7 === 1) return true;
  }
  // fe80::/10
  if ((g0 & 0xffc0) === 0xfe80) return true;
  // fc00::/7 ULA
  if ((g0 & 0xfe00) === 0xfc00) return true;
  // ff00::/8 multicast
  if ((g0 & 0xff00) === 0xff00) return true;
  // IPv4-embedded forms — always range-check the embedded v4 regardless of
  // which prefix convention put it there:
  //   ::ffff:x.y.z.w           — IPv4-mapped (RFC 4291 §2.5.5.2)
  //   ::x.y.z.w                — IPv4-compatible (deprecated, RFC 4291 §2.5.5.1)
  //   ::ffff:0:x.y.z.w         — IPv4-translated (RFC 2765 §2.1)
  //   64:ff9b::x.y.z.w         — NAT64 well-known prefix (RFC 6052 §2.1)
  const v4 = ((g6 << 16) | g7) >>> 0;
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  const ipv4Mapped = firstFiveZero && g5 === 0xffff;
  const ipv4Compat = firstFiveZero && g5 === 0;
  const ipv4Translated = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0;
  const nat64 = g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;
  if ((ipv4Mapped || ipv4Compat || ipv4Translated || nat64) && v4InBlockedRange(v4)) {
    return true;
  }
  // 2002::/16 (6to4) embeds v4 in g1-g2. RFC 3056 §2.
  if (g0 === 0x2002) {
    const sixToFour = ((g1 << 16) | g2) >>> 0;
    if (v4InBlockedRange(sixToFour)) return true;
  }
  // 2001::/32 (Teredo) — RFC 4380 §4. Embedded client v4 is XOR-encoded in g6/g7.
  if (g0 === 0x2001 && g1 === 0x0000) {
    const teredo = (((~g6) & 0xffff) << 16 | ((~g7) & 0xffff)) >>> 0;
    if (v4InBlockedRange(teredo)) return true;
  }
  return false;
}

function containsNonLdh(host: string): boolean {
  return /[^a-z0-9.\-]/i.test(host);
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
  const rawHost = u.hostname.toLowerCase();
  const host = stripBrackets(rawHost);
  if (!host) return { ok: false, reason: "Missing host" };
  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, reason: "Host blocked" };
  }
  const ipKind = isIP(host);
  if (ipKind === 4) {
    const n = canonicalizeV4(host);
    if (n !== null && v4InBlockedRange(n)) {
      return { ok: false, reason: "IPv4 address blocked" };
    }
  } else if (ipKind === 6) {
    if (isBlockedV6(host)) {
      return { ok: false, reason: "IPv6 address blocked" };
    }
  } else {
    // Non-IP hostname: catch alternate IPv4 literal forms (decimal, hex,
    // short-dotted, etc.) that Node's isIP rejects but `fetch` would resolve.
    const maybeV4 = canonicalizeV4(host);
    if (maybeV4 !== null) {
      if (v4InBlockedRange(maybeV4)) {
        return { ok: false, reason: "Numeric IPv4 literal in blocked range" };
      }
    } else if (containsNonLdh(host)) {
      // Reject anything that survived WHATWG normalization with non-ASCII
      // (IDN smuggling, etc.). WHATWG URL already punycodes valid IDNs to
      // ASCII, so any remaining non-ASCII is suspicious.
      return { ok: false, reason: "Host contains unsafe characters" };
    }
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
  const host = stripBrackets(u.hostname.toLowerCase());
  const allowed = new Set<string>(ALLOWED_LOGO_HOSTS);
  const supabaseHost = deriveSupabasePublicHost();
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
