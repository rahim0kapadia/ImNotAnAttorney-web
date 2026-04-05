/**
 * Shared request utilities for API routes.
 */
import { NextRequest } from "next/server";

/**
 * Extracts the client IP from a Next.js request.
 * Priority order for Vercel deployment:
 *   1. x-real-ip — set by Vercel's edge, most reliable
 *   2. x-forwarded-for — standard proxy header (first entry is the client)
 *   3. cf-connecting-ip — only useful if behind Cloudflare (last resort)
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
