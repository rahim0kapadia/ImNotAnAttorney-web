/**
 * Shared session-mode dispatch helpers.
 *
 * Called by CD + IB dispatchers when tier_generation_config.mode='session'.
 *
 * Design: the atomic case-row guard in the calling route flips status
 * directly to 'awaiting-session-generation' when mode resolves to
 * 'session' (single write, no TOCTOU window). This module only fires
 * the fire-and-forget Telegram notification afterward.
 *
 * CRON_AUTH_TOKEN missing: logged loudly. Under the zero-hallucination
 * mandate, stalled-awaiting-review is preferable to automated-fallback,
 * so we do NOT downgrade to the api path when Telegram is unconfigured.
 * Operator must poll the admin UI until env is fixed.
 */

/**
 * Origin for forwarded intra-host fetches. Prefers the canonical
 * env var over the request's own URL origin — Vercel normalizes
 * Host, but pinning to NEXT_PUBLIC_SITE_URL prevents Host-header
 * rewrite edge cases if an intermediate proxy ever forwards a
 * user-controlled Host. Fallback to req.url.origin is safe on
 * Vercel prod + preview where the origin comes from validated
 * Vercel routing.
 */
export function trustedSiteOrigin(reqUrl: string): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (envOrigin && /^https?:\/\//.test(envOrigin))
    return envOrigin.replace(/\/+$/, "");
  return new URL(reqUrl).origin;
}

/**
 * Fire the notify-session-handoff cron. Fire-and-forget — never blocks.
 * Logs a loud error when CRON_AUTH_TOKEN is unset so a prod config
 * regression is visible instead of silently stalling every case.
 */
export function fireSessionNotify(
  siteOrigin: string,
  caseId: string,
  tierLabel: string,
): void {
  const cronSecret = process.env.CRON_AUTH_TOKEN;
  if (!cronSecret) {
    // eslint-disable-next-line no-console
    console.error(
      `[${tierLabel}-dispatcher] CRON_AUTH_TOKEN missing; session-mode case ${caseId} flipped to awaiting-session-generation but Telegram notify skipped. Operator must poll admin UI until env is fixed.`,
    );
    return;
  }
  fetch(
    `${siteOrigin}/api/cron/notify-session-handoff?caseId=${encodeURIComponent(caseId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    },
  ).catch((err) =>
    // eslint-disable-next-line no-console
    console.error(
      `[${tierLabel}-dispatcher] notify-session-handoff failed: ${err instanceof Error ? err.message : String(err)}`,
    ),
  );
}
