/**
 * Standalone Report Viewer (/report/standalone/[token])
 *
 * Token-based delivery page for standalone research reports (Employment Impact,
 * License Risk, etc.). Customers receive the link via email after generation.
 *
 * Security:
 *   - Token is hashed (SHA-256) before DB lookup, raw token never stored
 *   - Refunded orders return 404 (report revoked)
 *   - Expired tokens show contact message
 *   - HTML fetched from Supabase Storage and sanitized before rendering
 *
 * SEO: robots noindex/nofollow, reports must not appear in search engines.
 *
 * A11y: No <main> element, root layout provides it. Uses <div> wrappers.
 * Disclaimer uses text-zinc-600 for 7:1 contrast on white. Upsell link is
 * self-describing. Waiting state has role="status" and refresh guidance.
 */
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, CONTACT_EMAIL } from "@/lib/site";
import { sanitizeReportHtml } from "@/lib/sanitize";
import { getProduct } from "@/lib/products";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const supabase = createAdminClient();
  const tokenHash = hashToken(token);

  const { data } = await supabase
    .from("orders")
    .select("standalone_product_slug")
    .eq("standalone_report_token_hash", tokenHash)
    .single();

  if (!data) return { robots: { index: false } };

  const product = getProduct(data.standalone_product_slug);
  return {
    title: product
      ? `Your ${product.name} | ImNotAnAttorney`
      : "Report | ImNotAnAttorney",
    robots: { index: false, follow: false },
  };
}

export default async function StandaloneReportPage({ params }: Props) {
  const { token } = await params;
  const supabase = createAdminClient();
  const tokenHash = hashToken(token);

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "standalone_product_slug, standalone_report_storage_path, standalone_report_token_expires_at, status"
    )
    .eq("standalone_report_token_hash", tokenHash)
    .single();

  if (error || !order) notFound();
  if (order.status === "refunded") notFound();

  if (!order.standalone_report_storage_path) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center max-w-md px-4" role="status">
          <h1 className="text-2xl font-bold mb-4">
            Your report is being generated
          </h1>
          <p className="text-zinc-400">
            You&apos;ll receive an email when it&apos;s ready. This usually
            takes under 60 seconds. Refresh this page to check if your report is
            ready.
          </p>
        </div>
      </div>
    );
  }

  if (order.standalone_report_token_expires_at) {
    const expires = new Date(order.standalone_report_token_expires_at);
    if (expires < new Date()) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <h1 className="text-2xl font-bold mb-4">Report Link Expired</h1>
            <p className="text-zinc-400">
              Contact{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-blue-400 underline"
                aria-label={`Email support at ${CONTACT_EMAIL}`}
              >
                {CONTACT_EMAIL}
              </a>{" "}
              for access.
            </p>
          </div>
        </div>
      );
    }
  }

  const { data: htmlBlob, error: storageError } = await supabase.storage
    .from("standalone-reports")
    .download(order.standalone_report_storage_path);

  if (storageError || !htmlBlob) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold mb-4">
            Report temporarily unavailable
          </h1>
          <p className="text-zinc-400">
            Please try again in a moment. If the issue persists, contact{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-blue-400 underline"
              aria-label={`Email support at ${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  const rawHtml = await htmlBlob.text();
  const safeHtml = sanitizeReportHtml(rawHtml);
  const product = getProduct(order.standalone_product_slug);

  return (
    <div className="min-h-screen bg-white text-zinc-900 print:bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {product && (
          <header className="mb-8 pb-6 border-b border-zinc-200">
            <h1 className="text-2xl font-bold">{product.name}</h1>
            <p className="text-zinc-500 text-sm mt-1">
              Generated by ImNotAnAttorney
            </p>
          </header>
        )}

        <article
          className="report-content"
          aria-label="Report content"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />

        {product?.upsellText && product.upsellTier && (
          <div className="mt-12 pt-8 border-t border-zinc-200">
            <p className="text-zinc-600 mb-4">{product.upsellText}</p>
            <a
              href={`/checkout?tier=${product.upsellTier}`}
              className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold text-sm"
            >
              Explore the Case Decoder
            </a>
          </div>
        )}

        <p className="mt-8 text-xs text-zinc-600 border-t border-zinc-100 pt-6">
          This report provides legal INFORMATION, not legal ADVICE. The
          analysis draws on methods developed by elite defense attorneys, applied
          specifically to your case details. Your attorney remains the final
          authority on strategy decisions.
        </p>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .report-content h1 { font-size: 1.25rem; font-weight: 700; margin: 1.75rem 0 0.75rem; color: #18181b; border-bottom: 1px solid #e4e4e7; padding-bottom: 0.5rem; }
        .report-content h2 { font-size: 1.25rem; font-weight: 700; margin: 1.75rem 0 0.75rem; color: #18181b; border-bottom: 1px solid #e4e4e7; padding-bottom: 0.5rem; }
        .report-content h3 { font-size: 1.1rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #27272a; }
        .report-content p { margin: 0.75rem 0; line-height: 1.7; color: #3f3f46; }
        .report-content ul, .report-content ol { margin: 0.75rem 0; padding-left: 1.5rem; }
        .report-content li { margin: 0.25rem 0; line-height: 1.6; color: #3f3f46; }
        .report-content ul { list-style-type: disc; }
        .report-content ol { list-style-type: decimal; }
        .report-content strong { font-weight: 600; color: #18181b; }
        .report-content em { font-style: italic; }
        .report-content a { color: #2563eb; text-decoration: underline; }
        .report-content blockquote { border-left: 3px solid #d4d4d8; padding-left: 1rem; margin: 1rem 0; color: #52525b; }
        .report-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        .report-content th, .report-content td { border: 1px solid #e4e4e7; padding: 0.5rem 0.75rem; text-align: left; }
        .report-content th { background: #f4f4f5; font-weight: 600; color: #18181b; }
        .report-content hr { border: none; border-top: 1px solid #e4e4e7; margin: 1.5rem 0; }
        .report-content code { background: #f4f4f5; padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-size: 0.875rem; }
        .report-content pre { background: #f4f4f5; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin: 1rem 0; }
        @media print {
          .report-content { font-size: 12pt; }
          .report-content h2 { break-after: avoid; }
        }
      `,
        }}
      />
    </div>
  );
}
