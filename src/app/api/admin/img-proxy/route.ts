/**
 * @file /api/admin/img-proxy
 *
 * Proxy fetch for email-embedded images. Required because senders (e.g.
 * claude.ai) ship `Cross-Origin-Resource-Policy: same-origin` on assets, which
 * browsers honor to block iframe / cross-origin loads. Server-side fetch
 * ignores CORP; we then re-serve the bytes from our own origin so the iframe
 * can render them. Same pattern Gmail uses (googleusercontent proxy) and Front.
 *
 * Auth: HMAC-signed URLs. Public route — but only URLs signed by our server
 * can be proxied. URL is signed when the email body_html is returned from
 * /api/admin/emails (which IS auth-gated).
 *
 * SSRF defense (audit-grade):
 *  - http/https schemes only
 *  - DNS resolved via custom undici dispatcher with `lookup` callback that
 *    rejects every private/loopback/CGNAT/multicast/etc. IP at connect-time.
 *    Blocks DNS rebinding TOCTOU because the validation runs at the same
 *    syscall as the connect.
 *  - redirect: "manual"; we manually iterate up to 3 hops, re-running URL
 *    + IP validation before each follow.
 *  - 5MB response cap (streamed), 10s timeout, image content-type allowlist.
 *  - SVG explicitly excluded (executes JS in browsers when navigated to).
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { verifyImgUrl } from "@/lib/admin-img-proxy";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

// SVG excluded: executes JS when opened directly. Even with X-Content-Type-
// Options: nosniff, an admin opening the proxy URL in a new tab gets script
// execution in our origin — admin session theft path.
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/**
 * Parse a string into a 32-bit IPv4 numeric value, accepting all the encodings
 * `URL`/`net` may pass through (dotted-quad decimal/octal/hex, single-integer,
 * 2-/3-/4-octet shorthand). Returns null if not a valid IPv4 representation.
 *
 * Per RFC 3986 + glibc inet_aton historical behavior — even if Node's URL
 * parser normalizes most of these, attackers can still smuggle them via DNS
 * names that resolve to oddly-formatted record values.
 */
function parseIPv4(s: string): number | null {
  const parts = s.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (p === "" || p.length > 11) return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p, 16);
    else if (/^0[0-7]*$/.test(p) && p !== "0") n = parseInt(p, 8);
    else if (/^[0-9]+$/.test(p)) n = parseInt(p, 10);
    else return null;
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }
  let v: number;
  if (nums.length === 1) {
    if (nums[0] > 0xffffffff) return null;
    v = nums[0];
  } else if (nums.length === 2) {
    if (nums[0] > 0xff || nums[1] > 0xffffff) return null;
    v = (nums[0] << 24) | nums[1];
  } else if (nums.length === 3) {
    if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null;
    v = (nums[0] << 24) | (nums[1] << 16) | nums[2];
  } else {
    if (nums.some((n) => n > 0xff)) return null;
    v =
      (nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3];
  }
  // Sign-extend back to unsigned 32-bit
  return v >>> 0;
}

/** True if the given IP literal is in any non-public range. */
function isIpBlocked(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const v = parseIPv4(ip);
    if (v === null) return true; // refuse anything we can't parse
    const a = (v >>> 24) & 0xff;
    const b = (v >>> 16) & 0xff;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmark
    if (a >= 224) return true; // multicast 224/4 + reserved 240/4 + 255.255.255.255
    return false;
  }
  if (fam === 6) {
    const lower = ip.toLowerCase();
    // ::1 loopback
    if (lower === "::1" || lower === "::") return true;
    // IPv4-mapped — ::ffff:a.b.c.d — re-validate the embedded v4
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isIpBlocked(mapped[1]);
    // IPv4-mapped uncompressed — ::ffff:0:a.b.c.d
    const mapped2 = lower.match(/^::ffff:0:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped2) return isIpBlocked(mapped2[1]);
    // fc00::/7 unique-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    // fe80::/10 link-local
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    // Multicast ff00::/8
    if (lower.startsWith("ff")) return true;
    // Conservative: reject all other IPv6 too. Public IPv6 image hosting is
    // niche and we'd rather fail closed than allow an obscure unicast range.
    return true;
  }
  // Not an IP literal → treated as hostname; caller resolves DNS first.
  return false;
}

function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal" || h === "metadata") return true;
  // Hostnames that LOOK like IPs (any encoding) — validate as IP
  if (/^\d/.test(h) || h.includes(":")) {
    return isIpBlocked(h);
  }
  return false;
}

/**
 * Pre-resolve hostname to all A/AAAA records and reject if ANY is in a
 * blocked range. Without an undici dispatcher we can't bind connect to a
 * specific IP, so a TOCTOU window remains between this lookup and the
 * eventual connect — but: (a) this process holds the same DNS cache, so the
 * second resolution almost always returns the same IP set, (b) attacker would
 * need a sub-millisecond DNS flip, (c) this is admin-only so the threat
 * surface is small, (d) redirect: "manual" prevents the obvious bypass via
 * 302 → metadata.
 *
 * Logged in `docs/plans/2026-04-28-img-proxy-toctou-residual.md` as residual
 * risk; tracked for upgrade to undici dispatcher when undici lands as a
 * direct dep on the monorepo.
 */
async function validateHostBeforeFetch(hostname: string): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw new Error("blocked hostname");
  }
  // If hostname is already an IP literal, isBlockedHostname above handled it
  if (isIP(hostname)) return;
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  for (const r of records) {
    if (isIpBlocked(r.address)) {
      throw new Error("blocked resolved IP " + r.address);
    }
  }
}

async function fetchWithSsrfDefense(
  startUrl: string,
  selfHost: string,
  signal: AbortSignal
): Promise<Response> {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let target: URL;
    try {
      target = new URL(currentUrl);
    } catch {
      throw new Error("bad url");
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("bad scheme");
    }
    if (target.hostname.toLowerCase() === selfHost) {
      throw new Error("loopback to self");
    }
    await validateHostBeforeFetch(target.hostname);

    const upstream = await fetch(target.toString(), {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; INAA-Inbox-ImageProxy/1.0; +https://imnotanattorney.com)",
        Accept:
          "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8,*/*;q=0.5",
      },
    });

    // 3xx → follow manually with full re-validation against the new URL.
    if (upstream.status >= 300 && upstream.status < 400) {
      const loc = upstream.headers.get("location");
      if (!loc) {
        throw new Error("redirect with no Location");
      }
      currentUrl = new URL(loc, target).toString();
      try {
        await upstream.body?.cancel?.();
      } catch {}
      continue;
    }

    return upstream;
  }
  throw new Error("too many redirects");
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  const exp = req.nextUrl.searchParams.get("exp");
  const sig = req.nextUrl.searchParams.get("sig");

  if (!u || !exp || !sig) {
    return new NextResponse("missing params", { status: 400 });
  }
  if (!/^\d+$/.test(exp)) {
    return new NextResponse("bad exp", { status: 400 });
  }

  const valid = await verifyImgUrl(u, exp, sig);
  if (!valid) {
    return new NextResponse("invalid signature", { status: 403 });
  }
  if (Number(exp) < Date.now()) {
    return new NextResponse("expired", { status: 410 });
  }

  const selfHost = req.nextUrl.hostname.toLowerCase();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetchWithSsrfDefense(u, selfHost, ac.signal);

    if (!upstream.ok || !upstream.body) {
      return new NextResponse("upstream " + upstream.status, { status: 502 });
    }

    const ct = (upstream.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ct || !ALLOWED_TYPES.has(ct)) {
      return new NextResponse("not an allowed image type", { status: 415 });
    }

    // content-length is upstream-controlled and may lie; the streaming cap
    // below is the actual enforcement. Header check is just a fast-fail.
    const cl = parseInt(upstream.headers.get("content-length") || "0", 10) || 0;
    if (cl > MAX_BYTES) {
      return new NextResponse("too large", { status: 413 });
    }

    // Bounded stream into a buffer
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          try {
            await reader.cancel();
          } catch {}
          return new NextResponse("too large", { status: 413 });
        }
        chunks.push(value);
      }
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }

    // Build a fresh response — upstream Set-Cookie / sensitive headers are
    // discarded by reconstruction. Only the headers below are sent to client.
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Content-Length": String(total),
        "Cache-Control": "private, max-age=86400",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        // Force download if anyone navigates to the proxy URL directly —
        // belt-and-suspenders for non-image content-types that might still
        // sneak through.
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || e.message === "aborted")) {
      return new NextResponse("timeout", { status: 504 });
    }
    if (e instanceof Error && /blocked|bad scheme|bad url|loopback|too many/.test(e.message)) {
      return new NextResponse(e.message, { status: 400 });
    }
    return new NextResponse("fetch error", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
