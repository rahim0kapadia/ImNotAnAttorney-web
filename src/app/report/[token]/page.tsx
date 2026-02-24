import { createAdminClient } from "@/lib/supabase/admin";
import sanitizeHtml from "sanitize-html";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Case Decoder Report — ImNotAnAttorney",
  robots: { index: false, follow: false },
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: caseData } = await supabase
    .from("cases")
    .select("report_html, status, tier")
    .eq("report_token", token)
    .single();

  if (!caseData || !caseData.report_html) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">
            Report Not Available
          </h1>
          <p className="mt-3 text-zinc-400">
            This report is not available yet. If you recently purchased a Case
            Decoder, your report is being prepared and you&apos;ll receive an
            email when it&apos;s ready.
          </p>
          <p className="mt-4 text-sm text-zinc-400">
            Questions? Email us at{" "}
            <a
              href="mailto:help@imnotanattorney.com"
              className="text-amber-400 underline decoration-amber-400/50"
            >
              help@imnotanattorney.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Only show delivered or review (for operator preview) reports
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
        </div>
      </div>
    );
  }

  const cleanHtml = sanitizeHtml(caseData.report_html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "h1", "h2", "h3", "h4", "img", "style", "html", "head", "body", "meta", "title", "div", "span",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["style", "class", "id", "lang"],
      a: ["href", "style", "class"],
      meta: ["charset", "name", "content"],
      link: ["rel", "href"],
    },
    allowedStyles: {
      "*": {
        color: [/.*/],
        "background-color": [/.*/],
        background: [/.*/],
        "font-size": [/.*/],
        "font-weight": [/.*/],
        "font-family": [/.*/],
        "text-align": [/.*/],
        "text-decoration": [/.*/],
        margin: [/.*/],
        "margin-top": [/.*/],
        "margin-bottom": [/.*/],
        "margin-left": [/.*/],
        "margin-right": [/.*/],
        padding: [/.*/],
        "padding-top": [/.*/],
        "padding-bottom": [/.*/],
        "padding-left": [/.*/],
        "padding-right": [/.*/],
        border: [/.*/],
        "border-top": [/.*/],
        "border-left": [/.*/],
        "border-right": [/.*/],
        "border-bottom": [/.*/],
        "border-radius": [/.*/],
        "border-collapse": [/.*/],
        "border-color": [/.*/],
        "max-width": [/.*/],
        width: [/.*/],
        display: [/.*/],
        "line-height": [/.*/],
        "list-style": [/.*/],
      },
    },
  });

  return (
    <div
      className="report-container"
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
}
