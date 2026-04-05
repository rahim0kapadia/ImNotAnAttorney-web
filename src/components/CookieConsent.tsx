"use client";

import { useState, useEffect, useCallback } from "react";

const CONSENT_KEY = "cookie-consent";
const ACCEPTED = "accepted";
const DECLINED = "declined";

function loadGA4(gaId: string) {
  // Prevent double-loading
  if (
    document.querySelector(
      `script[src*="googletagmanager.com/gtag/js?id=${gaId}"]`
    )
  ) {
    return;
  }

  const script = document.createElement("script");
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  script.async = true;
  document.head.appendChild(script);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  // gtag must use the arguments object per Google's spec
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function gtag(..._args: any[]) {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", gaId);
}

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);

    if (consent === ACCEPTED && gaId) {
      loadGA4(gaId);
    } else if (!consent) {
      setShowBanner(true);
    }
    // "declined" -- do nothing
  }, [gaId]);

  const handleAccept = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, ACCEPTED);
    setShowBanner(false);
    if (gaId) {
      loadGA4(gaId);
    }
  }, [gaId]);

  const handleDecline = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, DECLINED);
    setShowBanner(false);
  }, []);

  if (!showBanner) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-describedby="cookie-consent-description"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-700 bg-zinc-900 px-4 py-4 sm:px-6 sm:py-5"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p id="cookie-consent-description" className="text-sm text-zinc-300">
          We use cookies to understand how you use our site. No personal data is
          shared with third parties.
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            onClick={handleDecline}
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
