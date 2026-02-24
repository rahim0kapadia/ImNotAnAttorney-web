/**
 * next.config.ts -- Next.js configuration with security headers.
 *
 * Security headers applied to ALL routes via the `headers()` function:
 *
 *   - Strict-Transport-Security (HSTS): Forces HTTPS for 2 years (63072000 seconds),
 *     includes subdomains, and opts into the HSTS preload list. Once a browser sees
 *     this header, it will NEVER make an HTTP request to the domain. This is
 *     intentionally aggressive for a site handling legal case data.
 *
 *   - X-Content-Type-Options: "nosniff" -- Prevents browsers from MIME-sniffing
 *     responses away from the declared Content-Type. Mitigates drive-by download attacks.
 *
 *   - X-Frame-Options: "DENY" -- Prevents the site from being embedded in iframes
 *     on any domain, blocking clickjacking attacks. Note: the embed.js script works
 *     via script injection, NOT iframes, so this does not affect embeds.
 *
 *   - Referrer-Policy: "strict-origin-when-cross-origin" -- Sends the full URL as
 *     referrer for same-origin requests, but only the origin (no path) for cross-origin.
 *     Prevents leaking sensitive URL paths (like /report/case-id) to external sites.
 *
 * No CSP (Content-Security-Policy) header is configured yet. Consider adding one
 * before handling real customer data.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
