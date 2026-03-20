"use client";
/**
 * /partner/login/verify?token=xxx — Magic link verification page.
 *
 * Client-rendered page that calls the verify API via fetch (same origin).
 * This avoids Safari ITP issues with cookies set on cross-origin GET redirects.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No token provided.");
      return;
    }

    async function verify() {
      try {
        const res = await fetch(`/api/partner/magic-link/verify?token=${token}`);
        const data = await res.json();

        if (!res.ok) {
          setStatus("error");
          setErrorMsg(data.error || "Verification failed");
          return;
        }

        setStatus("success");
        // Redirect to dashboard after brief success message
        setTimeout(() => {
          window.location.href = "/partner/dashboard";
        }, 1500);
      } catch {
        setStatus("error");
        setErrorMsg("Could not verify your login link. Please try again.");
      }
    }

    verify();
  }, [token]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {status === "verifying" && (
          <div>
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white text-lg font-medium">Verifying your login...</p>
            <p className="text-zinc-400 text-sm mt-2">This will only take a moment.</p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white text-lg font-bold">You&apos;re in!</p>
            <p className="text-zinc-400 text-sm mt-2">Redirecting to your dashboard...</p>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-white text-lg font-bold">Login Failed</p>
            <p className="text-zinc-400 text-sm mt-2">{errorMsg}</p>
            <a
              href="/partner/login"
              className="inline-block mt-6 px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400"
            >
              Request New Link
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PartnerVerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
