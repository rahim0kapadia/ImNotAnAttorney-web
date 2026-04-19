/**
 * Next.js Middleware
 *
 * Two responsibilities:
 *   1. Nonce-based CSP, generates a per-request nonce for Content-Security-Policy,
 *      replacing 'unsafe-inline'/'unsafe-eval' in script-src with nonce-based policy.
 *   2. Centralized auth, timing-safe password check for /api/admin/* and /api/generate/*.
 *
 * Individual route handlers still have their own auth checks as defense-in-depth,
 * but this middleware provides a single enforcement point.
 */
import { NextRequest, NextResponse } from "next/server";

/**
 * Referral cookie + nonce-CSP prefixes. Each prefix corresponds to one Next.js
 * route group:
 *   - "r"          -> src/app/r/[code]         (generic referral landing)
 *   - "checkin"    -> src/app/checkin/[code]   (partner check-in landing)
 *   - "court-date" -> src/app/court-date/[code] (court-date capture landing)
 * Exclusive — a request path cannot hit more than one prefix; first match wins.
 */
const REFERRAL_PREFIXES = ["r", "checkin", "court-date"] as const;

/**
 * Build the Content-Security-Policy header for a given nonce + Supabase
 * connect-src. Used by both setReferralCookie() (for referral/check-in/court-date
 * routes) and the generic page-route path, so they stay in lockstep.
 */
function buildCsp(nonce: string, supabaseConnectSrc: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://vercel.live`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self' https://api.stripe.com https://vercel.live ${supabaseConnectSrc} https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com`,
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
  ].join("; ");
}

/**
 * HMAC-SHA256 timing-safe comparison.
 * Hashes both values with a fixed key, then compares the fixed-length digests.
 * Eliminates the length oracle present in XOR-based approaches.
 */
async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode("inna-middleware-hmac-key");
  const key = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const bufA = new Uint8Array(sigA);
  const bufB = new Uint8Array(sigB);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/**
 * Set the ref cookie (and optional ref_sub from ?sub=) + attach a fresh CSP
 * nonce to BOTH request and response headers for the given `/${prefix}/[code]`
 * route. Returns null if pathname doesn't match `/${prefix}/[code]` shape so
 * the caller can fall through to the next prefix or the generic CSP path.
 *
 * Request-header propagation is load-bearing: Server Components read the
 * nonce via headers().get("x-nonce"), which only sees request headers — not
 * response headers. Skipping the request-header set breaks inline scripts
 * on these routes under strict CSP.
 */
function setReferralCookie(
  req: NextRequest,
  pathname: string,
  prefix: string,
): NextResponse | null {
  const re = new RegExp(`^/${prefix}/([^/]+)`);
  const codeMatch = pathname.match(re);
  if (!codeMatch) return null;
  const code = codeMatch[1].toUpperCase();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const supabaseConnectSrc = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://*.supabase.co";
  const cspHeader = buildCsp(nonce, supabaseConnectSrc);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.cookies.set("ref", code, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 90 * 24 * 60 * 60, // 90 days
    path: "/",
  });

  const url = new URL(req.url);
  const sub = url.searchParams.get("sub");
  if (sub) {
    const cleanSub = sub.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
    if (cleanSub) {
      response.cookies.set("ref_sub", cleanSub, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 90 * 24 * 60 * 60,
        path: "/",
      });
    }
  }

  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export async function middleware(req: NextRequest) {
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
    if (!fromHeader || !(await timingSafeCompare(password, fromHeader))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Generate + Evaluate + Deliver routes (/api/generate/*, /api/evaluate/*, /api/deliver) ──
  if (
    pathname.startsWith("/api/generate") ||
    pathname.startsWith("/api/evaluate") ||
    pathname === "/api/deliver"
  ) {
    const secret = process.env.OPERATOR_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token || !(await timingSafeCompare(secret, token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Cron routes (/api/cron/*) ──────────────────────────────
  if (pathname.startsWith("/api/cron")) {
    const cronSecret = process.env.CRON_AUTH_TOKEN;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token || !(await timingSafeCompare(cronSecret, token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Partner API routes (/api/partner/*) ──────────────────────
  // Cookie-exists check only (no DB call in Edge). Route handlers do the
  // actual session validation via validatePartnerSession() in Node runtime.
  if (pathname.startsWith("/api/partner/") || pathname.startsWith("/api/partners/")) {
    // Public routes, no auth needed
    if (
      pathname === "/api/partner/magic-link" ||
      pathname === "/api/partner/magic-link/verify" ||
      pathname === "/api/partners/apply" ||
      pathname === "/api/partner/logout" ||
      pathname === "/api/partner/track-event"
    ) {
      return NextResponse.next();
    }
    // All other partner routes, check cookie exists
    // Must match PARTNER_SESSION_COOKIE in src/lib/partner-auth.ts (can't import, Edge Runtime)
    const session = req.cookies.get("partner-session");
    if (!session?.value) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Customer API routes (/api/customer/*) ──────────────────
  // Cookie-exists check only (no DB call in Edge). Route handlers do the
  // actual session validation via validateCustomerSession() in Node runtime.
  if (pathname.startsWith("/api/customer/")) {
    // Public routes, no auth needed
    if (
      pathname === "/api/customer/magic-link" ||
      pathname === "/api/customer/magic-link/verify" ||
      pathname === "/api/customer/logout"
    ) {
      return NextResponse.next();
    }
    // All other customer routes, check cookie exists
    // Must match CUSTOMER_SESSION_COOKIE in src/lib/customer-auth.ts (can't import, Edge Runtime)
    const session = req.cookies.get("customer-session");
    if (!session?.value) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Referral / check-in / court-date cookie + CSP ────────────
  // In Next.js 16, cookies().set() is not allowed in Server Components.
  // Middleware is the correct place to set cookies for page routes.
  // All three prefixes share identical cookie + nonce logic — handled by
  // setReferralCookie(). Helper forwards nonce into REQUEST headers so
  // Server Components can read it via headers().get("x-nonce").
  // Task 10 (bondsman-modes v2): uniform /r, /checkin, /court-date handling.
  // Exclusive prefixes — first match wins.
  for (const prefix of REFERRAL_PREFIXES) {
    if (pathname.startsWith(`/${prefix}/`) && !pathname.startsWith(`/${prefix}/api`)) {
      const response = setReferralCookie(req, pathname, prefix);
      if (response) return response;
    }
  }

  // ── Nonce-based CSP for page routes ──────────────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Scope Supabase connect-src to the specific project URL when available
  const supabaseConnectSrc = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://*.supabase.co";

  const cspHeader = buildCsp(nonce, supabaseConnectSrc);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // CSP must be on REQUEST headers too, Next.js parses the nonce from it during SSR
  requestHeaders.set("Content-Security-Policy", cspHeader);

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
    // Always match admin, operator, generate, cron, evaluate, and deliver API routes
    "/api/admin/:path*",
    "/api/operator/:path*",
    "/api/generate/:path*",
    "/api/cron/:path*",
    "/api/evaluate/:path*",
    "/api/deliver",
    "/api/partner/:path*",
    "/api/customer/:path*",
  ],
};
