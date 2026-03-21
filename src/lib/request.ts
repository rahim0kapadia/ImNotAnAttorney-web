/**
 * Shared request utilities for API routes.
 */
import { NextRequest } from "next/server";

/**
 * Extracts the client IP from a Next.js request.
 * Prefers Cloudflare's cf-connecting-ip (most reliable behind Cloudflare),
 * then x-real-ip (set by some reverse proxies), then x-forwarded-for
 * (standard proxy header, first entry is the client).
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
