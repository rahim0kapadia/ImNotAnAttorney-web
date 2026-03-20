/**
 * GA4 custom event helpers.
 *
 * These fire via `gtag()` which is injected by `@next/third-parties/google`
 * in the root layout. Each event maps to a GA4 custom event that can be
 * used for conversion tracking and funnel analysis.
 *
 * Usage: import { trackScoreStarted } from "@/lib/analytics";
 *        trackScoreStarted("dui");
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type GtagEvent = {
  action: string;
  params?: Record<string, string | number | boolean>;
};

function sendEvent({ action, params }: GtagEvent) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", action, params);
  }
}

/** User begins the Defense Milestone Score quiz */
export function trackScoreStarted(chargeType: string) {
  sendEvent({ action: "score_started", params: { charge_type: chargeType } });
}

/** User completes the score quiz */
export function trackScoreCompleted(chargeType: string, band: string, score: number) {
  sendEvent({
    action: "score_completed",
    params: { charge_type: chargeType, band, score },
  });
}

/** User submits their email (any capture point) */
export function trackEmailCaptured(source: string) {
  sendEvent({ action: "email_captured", params: { source } });
}

/** User lands on checkout page */
export function trackCheckoutStarted(tier: string) {
  sendEvent({ action: "checkout_started", params: { tier } });
}

/** Stripe payment succeeds (fired on success page) */
export function trackPurchaseCompleted(tier: string, value: number) {
  sendEvent({
    action: "purchase_completed",
    params: { tier, value, currency: "USD" },
  });
}

/** User accesses/downloads a playbook PDF */
export function trackPlaybookDownloaded(tier: string) {
  sendEvent({ action: "playbook_downloaded", params: { tier } });
}
