/**
 * global-error.tsx -- Global error boundary that catches errors in the ROOT LAYOUT.
 *
 * This is the last-resort error boundary. It fires when `src/app/layout.tsx` itself
 * throws an error, meaning the normal `<html>`, `<body>`, Header, Footer, and
 * Tailwind CSS are all unavailable.
 *
 * Because the root layout is broken, this component MUST:
 *   1. Be a Client Component ("use client").
 *   2. Render its own `<html>` and `<body>` tags.
 *   3. Use inline styles (NOT Tailwind classes) since globals.css may not have loaded.
 *
 * Provides two recovery actions:
 *   1. "Try Again" -- calls `reset()` to re-render the root layout.
 *   2. "Go Home" -- full page navigation to "/" via `<a>` tag.
 *
 * Inline styles replicate the site's dark theme (bg: #0C0A09, amber: #F59E0B)
 * so the error page looks intentional, not broken.
 *
 * Contact email (help@imnotanattorney.com) is shown for persistent errors.
 */
"use client";

import { CONTACT_EMAIL } from "@/lib/site";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          backgroundColor: "#0C0A09",
          color: "#D4D4D8",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
          padding: "16px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "500px" }}>
          <h1 style={{ color: "white", fontSize: "24px", marginBottom: "16px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#A1A1AA", marginBottom: "24px" }}>
            We hit an unexpected error. Please try again or contact us if the
            problem persists.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "12px 24px",
                backgroundColor: "#F59E0B",
                color: "black",
                fontWeight: "bold",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                padding: "12px 24px",
                border: "1px solid #3F3F46",
                color: "white",
                textDecoration: "none",
                borderRadius: "8px",
                fontSize: "14px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Go Home
            </a>
          </div>
          <p style={{ marginTop: "32px", fontSize: "12px", color: "#52525B" }}>
            Questions?{" "}
            <a
              href={"mailto:" + CONTACT_EMAIL}
              style={{ color: "#F59E0B", textDecoration: "underline" }}
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}
