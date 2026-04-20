/**
 * Server-side reachability probe for partner-supplied logo URLs.
 *
 * The round-1 save route validated URL SHAPE (https, host allowlist,
 * no userinfo, no private IPs). It did NOT validate that the URL
 * resolves to an actual image — which is how a misconfigured
 * Brandfetch hotlink (missing BRANDFETCH_CLIENT_ID → 302 to the
 * hotlinking-guidelines HTML page) could persist silently to
 * `partners.logo_url` and produce a broken <img> for every viewer.
 *
 * This probe is the reachability layer. It:
 *   - follows redirects with a bounded hop count (so a chain doesn't
 *     eat the request budget),
 *   - times out at 3s per hop,
 *   - rejects non-image Content-Type (HTML redirect pages, 404 bodies),
 *   - reads at most the first 32 bytes + re-sniffs magic bytes for
 *     PNG/JPEG/WEBP (Content-Type is spoofable),
 *   - caps total bytes read to prevent OOM if the upstream lies about
 *     Content-Length.
 *
 * Intended caller: POST /api/partner/branding/save on a logo_url write.
 * Also safe to call from a periodic audit script to flag partners whose
 * stored logo_url has started returning broken responses.
 */

import { sniffImageType } from "./file-sniff";

const HEAD_BYTES = 32;
const TOTAL_CAP_BYTES = 512 * 1024;
const PER_HOP_TIMEOUT_MS = 3000;
const MAX_REDIRECTS = 3;

export type ProbeResult =
  | { ok: true; contentType: string; sniffed: "png" | "jpeg" | "webp" }
  | { ok: false; reason: string };

async function readInitialBytes(res: Response, capBytes = HEAD_BYTES): Promise<Uint8Array | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < capBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      chunks.push(value);
      if (total >= TOTAL_CAP_BYTES) break;
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function probeImageUrl(url: string): Promise<ProbeResult> {
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, reason: "Logo URL must be https" };
  }
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_HOP_TIMEOUT_MS);
    try {
      const res = await fetch(current, { method: "GET", redirect: "manual", signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        try { await res.body?.cancel(); } catch { /* ignore */ }
        if (!loc) return { ok: false, reason: `Redirect with no Location header at hop ${hop}` };
        let next: URL;
        try {
          next = new URL(loc, current);
        } catch {
          return { ok: false, reason: "Malformed Location header" };
        }
        if (next.username || next.password) {
          return { ok: false, reason: "Redirect target contains userinfo" };
        }
        current = next.toString();
        continue;
      }
      if (!res.ok) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        return { ok: false, reason: `Upstream returned HTTP ${res.status}` };
      }
      const type = (res.headers.get("content-type") || "").toLowerCase();
      const typeBase = type.split(";")[0].trim();
      if (!typeBase.startsWith("image/")) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        return { ok: false, reason: `Content-Type is ${typeBase || "missing"}, not image/*` };
      }
      const bytes = await readInitialBytes(res);
      if (!bytes || bytes.byteLength === 0) {
        return { ok: false, reason: "Empty response body" };
      }
      const sniffed = sniffImageType(bytes);
      if (!sniffed) {
        return { ok: false, reason: "Magic bytes do not match PNG/JPEG/WEBP" };
      }
      return { ok: true, contentType: typeBase, sniffed };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: `Fetch failed: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: `Exceeded ${MAX_REDIRECTS} redirects` };
}
