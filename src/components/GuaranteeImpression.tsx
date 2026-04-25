"use client";

/**
 * GuaranteeImpression — client-side attribution wrapper for the Hormozi
 * money-back guarantee sections across the site.
 *
 * Fires when the wrapped guarantee block enters the viewport:
 *   - GA4 `guarantee_viewed` event (product_surface + tier_hint)
 *   - sessionStorage flag `guarantee_viewed=true` so the downstream /checkout
 *     form can include it in the /api/checkout POST body, which then lands in
 *     Stripe session metadata (`guarantee_viewed`). That metadata can be
 *     cross-referenced against refund events to compute guarantee-claim rate
 *     and guarantee-attributable conversion lift (Hormozi APEX-S4).
 *
 * Fires once per page-load. IntersectionObserver threshold 0.5 so half the
 * block must be visible — avoids firing on a viewport flyby.
 *
 * Cited: Alex Hormozi, $100M Offers ch. 5 (Guarantees). Tracking design
 * per Peep Laja (CRO) hierarchy — measure the trust-objection-overcome layer.
 */

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

interface GuaranteeImpressionProps {
  /**
   * Where the guarantee is shown. MUST be a developer-controlled string
   * literal — never user input or URL-param-driven. Values flow into GA4
   * events + Stripe metadata; the /api/checkout server allowlists this
   * field, so unknown surfaces are dropped server-side, but keeping it
   * literal at every call site avoids silent drops in production reporting.
   */
  surface: "homepage" | "services" | "checkout" | "playbook-sales" | "playbook";
  /**
   * Optional tier or product hint (e.g. "playbook", "case-decoder", "x-ray").
   * MUST be a developer-controlled tier slug or product slug — never user
   * input. Server validates via isValidTier / isValidProduct and drops
   * unknown values from Stripe metadata.
   */
  tierHint?: string;
  children: React.ReactNode;
}

export function GuaranteeImpression({ surface, tierHint, children }: GuaranteeImpressionProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (fired) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // Graceful degrade — fire immediately on browsers without IO
      writeAttribution(surface, tierHint);
      setFired(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            writeAttribution(surface, tierHint);
            setFired(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fired, surface, tierHint]);

  return <div ref={ref}>{children}</div>;
}

function writeAttribution(surface: string, tierHint: string | undefined) {
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage?.setItem("guarantee_viewed", "true");
      window.sessionStorage?.setItem("guarantee_viewed_surface", surface);
      if (tierHint) window.sessionStorage?.setItem("guarantee_viewed_tier_hint", tierHint);
    }
  } catch {
    // sessionStorage disabled / quota full — non-fatal
  }
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", "guarantee_viewed", {
        surface,
        ...(tierHint && { tier_hint: tierHint }),
      });
    }
  } catch {
    // gtag missing or threw — non-fatal
  }
}

/**
 * Helper for /checkout form submit. Returns the current attribution payload
 * (or empty object if nothing to attribute). Spread into the /api/checkout
 * POST body.
 */
export function readGuaranteeAttribution(): { guaranteeViewed?: boolean; guaranteeViewedSurface?: string; guaranteeViewedTierHint?: string } {
  try {
    if (typeof window === "undefined") return {};
    const viewed = window.sessionStorage?.getItem("guarantee_viewed");
    if (viewed !== "true") return {};
    const surface = window.sessionStorage?.getItem("guarantee_viewed_surface") || undefined;
    const tierHint = window.sessionStorage?.getItem("guarantee_viewed_tier_hint") || undefined;
    return {
      guaranteeViewed: true,
      ...(surface && { guaranteeViewedSurface: surface }),
      ...(tierHint && { guaranteeViewedTierHint: tierHint }),
    };
  } catch {
    return {};
  }
}

/**
 * Clears the sessionStorage attribution keys. Call after a successful
 * /api/checkout POST so a subsequent visitor on a shared/kiosk tab does not
 * inherit the prior session's attribution flag. Non-PII risk, but
 * defense-in-depth minimization.
 */
export function clearGuaranteeAttribution(): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage?.removeItem("guarantee_viewed");
    window.sessionStorage?.removeItem("guarantee_viewed_surface");
    window.sessionStorage?.removeItem("guarantee_viewed_tier_hint");
  } catch {
    // sessionStorage disabled / quota full — non-fatal
  }
}
