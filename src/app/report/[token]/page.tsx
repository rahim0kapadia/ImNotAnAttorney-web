/**
 * Report Viewer Page (/report/[token])
 *
 * Token-based report delivery page. Customers access their completed reports
 * via a unique URL token — no login required. The token is emailed to the
 * customer when their report is marked as "delivered" in Supabase.
 *
 * User journey position:
 *   Delivery email (report link) -> THIS PAGE
 *   No other entry points — token is the only access mechanism.
 *
 * Security & access control:
 *   1. Token-based auth — no user accounts needed, token is unguessable UUID
 *   2. Refunded case blocking — status="refunded" shows "Report No Longer Available"
 *      (customer loses access after full refund per refund policy)
 *   3. Status gating — only "delivered" and "review" statuses show the report.
 *      "review" is for operator preview before marking as delivered.
 *      Other statuses (pending, uploaded, processing) show "Not Ready Yet"
 *   4. HTML sanitization (sanitize-html) — reports are stored as HTML in Supabase.
 *      Tightened allowedTags: REMOVED <style>, <html>, <head>, <body>, <meta>, <link>
 *      (all XSS vectors). CSS property values use strict regex patterns instead of
 *      wildcards. This prevents:
 *        - Script injection via style tags
 *        - External resource loading via link/meta tags
 *        - CSS expression() attacks via wildcard style values
 *
 * Data flow:
 *   Server component fetches case by report_token from Supabase `cases` table.
 *   Reads: report_html, status, tier.
 *   Sanitizes HTML then renders via dangerouslySetInnerHTML in a report-container div.
 *
 * SEO: robots noindex/nofollow — reports should not appear in search engines.
 * Metadata: Dynamic title based on tier name (e.g., "Your Case Decoder Report").
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTACT_EMAIL } from "@/lib/site";
import sanitizeHtml from "sanitize-html";
import type { Metadata } from "next";
import PrintButton from "./PrintButton";

/** Maps tier slugs to display names for the page title. */
const TIER_NAMES: Record<string, string> = {
  "case-decoder": "Case Decoder",
  "intelligence-brief": "Intelligence Brief",
  "x-ray": "X-Ray",
  "war-room": "War Room",
  "situation-room": "Situation Room",
};

/** Dynamic metadata — generates tier-specific title, sets noindex/nofollow. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("cases")
    .select("tier")
    .eq("report_token", token)
    .single();

  const tierName = data?.tier ? TIER_NAMES[data.tier] || "Report" : "Report";
  return {
    title: `Your ${tierName} Report — ImNotAnAttorney`,
    robots: { index: false, follow: false },
  };
}

/**
 * ReportPage — async server component that fetches case data by token,
 * applies access controls, sanitizes HTML, and renders the report.
 */
export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: caseData } = await supabase
    .from("cases")
    .select("report_html, status, tier, report_token_expires_at")
    .eq("report_token", token)
    .single();

  // ACCESS CONTROL 0: Token expiration — reports expire after 12 months.
  if (caseData?.report_token_expires_at && new Date(caseData.report_token_expires_at) < new Date()) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Report Link Expired</h1>
          <p className="mt-3 text-zinc-400">
            This report link has expired. Contact us to request a new link.
          </p>
          <p className="mt-4 text-sm text-zinc-400">
            Email us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-400 underline decoration-amber-400/50">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ACCESS CONTROL 1: Refunded cases — customer loses report access after full refund.
  // This is enforced here (not just in the webhook) as a defense-in-depth measure.
  if (caseData && caseData.status === "refunded") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">
            Report No Longer Available
          </h1>
          <p className="mt-3 text-zinc-400">
            Your refund was processed and report access has been revoked per our
            refund policy. If you have questions, contact us.
          </p>
          <p className="mt-4 text-sm text-zinc-400">
            Email us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-amber-400 underline decoration-amber-400/50"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (!caseData || !caseData.report_html) {
    // Status-aware messages for cases without report HTML yet
    const status = caseData?.status;

    // generation-failed: explain the issue and set expectation
    if (status === "generation-failed" || status === "intake-stalled") {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              Report Generation Issue
            </h1>
            <p className="mt-3 text-zinc-400">
              Report generation encountered an issue. Our team has been notified
              and will reach out within 24 hours.
            </p>
            <p className="mt-4 text-sm text-zinc-400">
              Questions? Email us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-400 underline decoration-amber-400/50">
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      );
    }

    // awaiting-intake: direct customer to intake form
    if (status === "awaiting-intake") {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              Waiting for Your Case Details
            </h1>
            <p className="mt-3 text-zinc-400">
              Please complete your case details form so we can begin generating
              your report.
            </p>
            <a
              href="/intake"
              className="mt-6 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Complete Your Case Details
            </a>
          </div>
        </div>
      );
    }

    // pending/uploaded: waiting for discovery documents
    if (status === "pending" || status === "uploaded" || status === "submitted") {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              Waiting for Discovery Documents
            </h1>
            <p className="mt-3 text-zinc-400">
              {status === "pending"
                ? "Your report requires discovery documents to be submitted before analysis can begin."
                : "Your discovery documents have been received. Analysis is in progress."}
            </p>
            {status === "pending" && (
              <a
                href="/upload"
                className="mt-6 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                Upload Discovery Documents
              </a>
            )}
          </div>
        </div>
      );
    }

    // Default: generic "not available yet" (covers intake, generating, and other in-progress statuses)
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">
            Report Not Available Yet
          </h1>
          <p className="mt-3 text-zinc-400">
            Your report is being prepared. You&apos;ll receive an email when
            it&apos;s ready.
          </p>
          <p className="mt-4 text-sm text-zinc-400">
            Haven&apos;t received your report within 48 hours? Contact{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-amber-400 underline decoration-amber-400/50"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ACCESS CONTROL 2: Status gate — only "delivered" (customer) and "review"
  // (operator preview) statuses render the report. All other statuses
  // (pending, uploaded, processing) show "Not Ready Yet" to prevent
  // premature access to incomplete reports.
  if (caseData.status !== "delivered" && caseData.status !== "review") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">
            Report Not Ready Yet
          </h1>
          <p className="mt-3 text-zinc-400">
            Your report is still being prepared. You&apos;ll receive an email
            when it&apos;s ready to view.
          </p>
          <p className="mt-4 text-sm text-zinc-400">
            Haven&apos;t received your report within 48 hours? Contact{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-amber-400 underline decoration-amber-400/50"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    );
  }

  // HTML SANITIZATION — Critical security layer.
  // Reports are authored HTML stored in Supabase, rendered via dangerouslySetInnerHTML.
  // Tightened from the sanitize-html defaults:
  //   REMOVED tags: <style> (CSS injection), <html>/<head>/<body> (structural),
  //     <meta>/<link> (external resource loading, redirect attacks)
  //   CSS values: Strict regex patterns instead of /.*/ wildcards.
  //     Prevents CSS expression() attacks, url() data exfiltration,
  //     and @import-based stylesheet injection.
  //   Allowed: Standard formatting tags, tables, images (src/alt/width/height only),
  //     links (href/target/rel), and safe inline styles for layout/colors.
  const cleanHtml = sanitizeHtml(caseData.report_html, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "a", "div", "span",
      "ul", "ol", "li",
      "strong", "em", "b", "i", "u",
      "table", "tr", "td", "th", "thead", "tbody",
      "br", "hr",
      "blockquote", "img", "title",
    ],
    allowedAttributes: {
      "*": ["style", "class", "id"],
      a: ["href", "style", "class", "target", "rel"],
      img: ["src", "alt", "width", "height"],
    },
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
        "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
        background: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
        "font-size": [/^\d+(?:px|em|rem|%)$/],
        "font-weight": [/^(?:bold|normal|\d{3})$/],
        "font-family": [/^[-\w\s,']+$/],
        "text-align": [/^(?:left|center|right|justify)$/],
        "text-decoration": [/^(?:none|underline|line-through|overline)(?:\s|$)/],
        margin: [/^[-\d]+(?:px|em|rem|%)(?:\s|$)/],
        "margin-top": [/^[-\d]+(?:px|em|rem|%)$/],
        "margin-bottom": [/^[-\d]+(?:px|em|rem|%)$/],
        "margin-left": [/^[-\d]+(?:px|em|rem|%)$/],
        "margin-right": [/^[-\d]+(?:px|em|rem|%)$/],
        padding: [/^[\d]+(?:px|em|rem|%)(?:\s|$)/],
        "padding-top": [/^[\d]+(?:px|em|rem|%)$/],
        "padding-bottom": [/^[\d]+(?:px|em|rem|%)$/],
        "padding-left": [/^[\d]+(?:px|em|rem|%)$/],
        "padding-right": [/^[\d]+(?:px|em|rem|%)$/],
        border: [/^\d+px\s/],
        "border-top": [/^\d+px\s/],
        "border-left": [/^\d+px\s/],
        "border-right": [/^\d+px\s/],
        "border-bottom": [/^\d+px\s/],
        "border-radius": [/^[\d]+(?:px|em|rem|%)$/],
        "border-collapse": [/^(?:collapse|separate)$/],
        "border-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^[a-zA-Z]+$/],
        "max-width": [/^[\d]+(?:px|em|rem|%)$/],
        width: [/^[\d]+(?:px|em|rem|%)$/],
        display: [/^(?:block|inline|inline-block|flex|none|table|table-row|table-cell)$/],
        "line-height": [/^[\d.]+(?:px|em|rem|%)?$/],
        "list-style": [/^(?:none|disc|circle|square|decimal|lower-alpha|upper-alpha)$/],
      },
    },
  });

  return (
    <>
      {/* Print-friendly styles — lives OUTSIDE sanitized HTML so the sanitizer
          can't strip it. Mirrors the @media print block from renderReportHtml()
          which sanitize-html removes (it strips <style> tags for XSS safety). */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  body { background: white !important; color: #1a1a1a !important; }
  .report-container, .report-container * { color: #1a1a1a !important; background: white !important; }
  .report-container h2, .report-container h3, .report-container h4 { color: #92400e !important; }
  .report-container strong { color: #1a1a1a !important; }
  .report-container blockquote { border-left-color: #92400e !important; }
  .report-container table { border-color: #d4d4d8 !important; }
  .report-container td, .report-container th { border-color: #d4d4d8 !important; color: #1a1a1a !important; }
  nav, footer, .print-hidden { display: none !important; }
  .report-container h2 { page-break-before: auto; page-break-after: avoid; }
  .report-container table, .report-container blockquote { page-break-inside: avoid; }
}
`,
        }}
      />
      <div className="print-hidden mb-4 flex flex-col items-start gap-2">
        <PrintButton />
        <p className="text-xs text-zinc-500">
          Click &quot;Download as PDF&quot; then select &quot;Save as PDF&quot;
          in your browser&apos;s print dialog.
        </p>
      </div>
      <div
        className="report-container"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    </>
  );
}
