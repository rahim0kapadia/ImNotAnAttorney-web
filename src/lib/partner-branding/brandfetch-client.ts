import type { BrandfetchLogo } from "./types";

const CDN_BASE = "https://cdn.brandfetch.io";

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  let host = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0];
  if (!host || !host.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

export function buildLogoUrls(domain: string): BrandfetchLogo {
  const clientId = process.env.BRANDFETCH_CLIENT_ID;
  const suffix = clientId ? `?c=${encodeURIComponent(clientId)}` : "";
  return {
    domain,
    pngUrl: `${CDN_BASE}/${domain}${suffix}`,
    iconUrl: `${CDN_BASE}/${domain}/icon${suffix}`,
    symbolUrl: `${CDN_BASE}/${domain}/symbol${suffix}`,
  };
}

export async function probeLogoExists(logoUrl: string, timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // HEAD avoids downloading the image body for a probe. If the CDN
    // rejects HEAD (some do), the caller can fall back to GET, but
    // Brandfetch's CDN responds to HEAD cleanly.
    const res = await fetch(logoUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") || "";
    return type.startsWith("image/");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLogoByDomain(input: string): Promise<BrandfetchLogo | null> {
  const domain = normalizeDomain(input);
  if (!domain) return null;
  const urls = buildLogoUrls(domain);
  const ok = await probeLogoExists(urls.pngUrl);
  return ok ? urls : null;
}
