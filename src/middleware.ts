/**
 * Next.js Middleware
 *
 * Two responsibilities:
 *   1. Nonce-based CSP — generates a per-request nonce for Content-Security-Policy,
 *      replacing 'unsafe-inline'/'unsafe-eval' in script-src with nonce-based policy.
 *   2. Centralized auth — timing-safe password check for /api/admin/* and /api/generate/*.
 *
 * Individual route handlers still have their own auth checks as defense-in-depth,
 * but this middleware provides a single enforcement point.
 */
import { NextRequest, NextResponse } from "next/server";

function timingSafeCompare(a: string, b: string): boolean {
  // Edge Runtime doesn't have Node's timingSafeEqual, so use constant-time comparison
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length !== bufB.length) return false;
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Admin + Operator routes (/api/admin/*, /api/operator/*) ──
  if (pathname.startsWith("/api/admin") || pathname.startsWith("/api/operator")) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }
    const fromHeader = req.headers.get("x-admin-password");
    if (!fromHeader || !timingSafeCompare(password, fromHeader)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Generate routes (/api/generate/*) ────────────────────────
  if (pathname.startsWith("/api/generate")) {
    const secret = process.env.OPERATOR_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token || !timingSafeCompare(secret, token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Nonce-based CSP for page routes ──────────────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const cspHeader = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://vercel.live`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://api.stripe.com https://vercel.live https://*.supabase.co",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and images
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // Always match admin, operator, and generate API routes
    "/api/admin/:path*",
    "/api/operator/:path*",
    "/api/generate/:path*",
  ],
};
