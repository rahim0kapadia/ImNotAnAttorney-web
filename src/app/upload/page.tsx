/**
 * Upload Page (/upload?case=<caseId>&email=...)
 *
 * Discovery document upload page for customers who purchased discovery-tier
 * services (X-Ray $2,497+, War Room, Situation Room, Witness Pack).
 * Customers receive a personalized upload link via email after checkout.
 *
 * User journey position:
 *   Checkout success email -> THIS PAGE -> /api/upload/finalize -> analysis begins
 *   /checkout/success (fallback link) -> THIS PAGE
 *
 * Query parameters:
 *   ?case=<caseId> — Required. The Supabase case ID for file association.
 *     If missing, shows "Missing case reference" error with link home.
 *   ?email=... — Optional. Pre-fills the email field for ownership verification.
 *
 * Page structure:
 *   1. Missing case guard — Error state if ?case param is absent
 *   2. Success state — Shows file count + "analysis in progress" after finalize
 *   3. Upload form:
 *      a. "What to upload" guidance — Police reports, lab results, statements, etc.
 *      b. Email field — Must match checkout email (case ownership verification)
 *      c. FileUpload component — Drag-and-drop with accepted types:
 *         PDF, Word, images, audio, video. 50MB per file limit.
 *      d. Finalize button — Appears after files are uploaded (fileCount > 0)
 *         Calls /api/upload/finalize with caseId + email
 *         Includes confirm() dialog: "Submit X documents for analysis? This cannot be undone."
 *      e. Legal disclaimer + document security notice
 *
 * Data flow:
 *   FileUpload component uploads files to Supabase Storage (per-case folder).
 *   Finalize endpoint (/api/upload/finalize):
 *     - Verifies email matches case record
 *     - Updates case status to "uploaded"
 *     - Sends operator notification
 *
 * Wrapped in Suspense for useSearchParams.
 */
"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { FileUpload } from "@/components/FileUpload";
import Link from "next/link";

/**
 * UploadContent — client component handling case ID validation, file upload
 * tracking, and the finalize submission flow.
 */
function UploadContent() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("case");
  const prefillEmail = searchParams.get("email") || "";
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [email, setEmail] = useState(prefillEmail);

  // Guard: case ID is required — without it, we can't associate uploads
  if (!caseId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">
            Missing case reference
          </h1>
          <p className="mt-3 text-zinc-400">
            Use the upload link from your confirmation email.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-amber-400 underline"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Success state: shown after finalize completes
  if (submitted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl text-amber-400">
            &#10003;
          </div>
          <h1 className="text-2xl font-bold text-white">
            Documents Received
          </h1>
          <p className="mt-3 text-zinc-400">
            We received {fileCount} file{fileCount !== 1 ? "s" : ""}. Your
            analysis is now in progress.
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            You&apos;ll receive an email when your report is ready.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-white md:text-3xl">
          Upload Your Discovery Documents
        </h1>
        <p className="mt-3 text-zinc-400">
          Upload the discovery documents your attorney provided. We accept PDF,
          Word documents, images, audio, and video files. Maximum 50MB per file.
        </p>

        <div className="mt-4 rounded-lg border border-zinc-500 bg-zinc-900/50 p-4">
          <p className="text-sm font-semibold text-zinc-300">
            What to upload:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-400">
            <li>- Police reports and arrest affidavits</li>
            <li>- Lab results and forensic reports</li>
            <li>- Witness statements</li>
            <li>- Body camera / dashcam footage</li>
            <li>- Warrants and affidavits</li>
            <li>- Any other evidence provided by your attorney</li>
          </ul>
        </div>

        <div className="mt-6">
          <label htmlFor="upload-email" className="block text-sm font-semibold text-zinc-300">
            Your email address
          </label>
          <input
            id="upload-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-base text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">Must match the email you used at checkout.</p>
        </div>

        <div className="mt-8">
          <FileUpload
            caseId={caseId}
            email={email}
            onUploadComplete={(files) => setFileCount(files.length)}
          />
        </div>

        {/* FINALIZE BUTTON — Only appears after at least 1 file uploaded.   */}
        {/* Includes a confirm() dialog to prevent accidental submission.    */}
        {/* POSTs to /api/upload/finalize which verifies email ownership,   */}
        {/* updates case status, and notifies the operator.                  */}
        {fileCount > 0 && (
          <>
            <button
              onClick={async () => {
                if (!window.confirm(`Submit ${fileCount} document${fileCount !== 1 ? "s" : ""} for analysis? This cannot be undone.`)) return;
                setSubmitting(true);
                setSubmitError(null);
                try {
                  const res = await fetch("/api/upload/finalize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ caseId, email: email || undefined }),
                  });
                  if (res.ok) {
                    setSubmitted(true);
                  } else {
                    const data = await res.json();
                    setSubmitError(data.error || "Something went wrong. Please try again.");
                  }
                } catch {
                  setSubmitError("Couldn't reach our servers. Please try again.");
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
              className="mt-6 w-full rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Submitting..."
                : `Submit ${fileCount} Document${fileCount !== 1 ? "s" : ""} for Analysis`}
            </button>
            {submitError && (
              <div className="mt-3 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
                <p className="text-sm text-red-400">{submitError}</p>
              </div>
            )}
          </>
        )}

        <div className="mt-8 rounded-lg border border-zinc-500 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            ImNotAnAttorney provides legal information and research — not legal advice. No attorney-client relationship is created.
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Your documents are encrypted and stored securely. We use them only
            for your case analysis. They are never shared with third parties.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Page export with Suspense boundary for useSearchParams. */
export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-400">Loading...</p>
        </div>
      }
    >
      <UploadContent />
    </Suspense>
  );
}
