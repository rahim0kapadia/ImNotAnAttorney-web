// src/lib/notification-prefs.ts
/**
 * @fileoverview Notification channel preference system.
 *
 * JSONB override columns on court_reminders (client) and partners (bondsman)
 * store only non-default preferences. This module provides types, defaults,
 * merge logic, channel routing helpers, and consent guards.
 */

export type Channel = "email" | "sms" | "both";

export interface ClientNotificationPrefs {
  court_reminders: Channel;
  magic_link: Channel;
  check_in: Channel;
  post_court: Channel;
}

export interface PartnerNotificationPrefs {
  magic_link: Channel;
  client_reminded: Channel;
  drip: Channel;
  payout: Channel;
}

export const CLIENT_DEFAULTS: ClientNotificationPrefs = {
  court_reminders: "email",
  magic_link: "email",
  check_in: "email",
  post_court: "email",
};

export const PARTNER_DEFAULTS: PartnerNotificationPrefs = {
  magic_link: "email",
  client_reminded: "email",
  drip: "email",
  payout: "email",
};

// SAFETY: court_reminders must NEVER be "sms" alone.
// If phone is dead at 3AM, email is the fallback that keeps people out of jail.
export const COURT_REMINDER_SAFE_CHANNELS = new Set<Channel>(["email", "both"]);

export function getClientPrefs(
  overrides: Partial<ClientNotificationPrefs> | null
): ClientNotificationPrefs {
  return { ...CLIENT_DEFAULTS, ...overrides };
}

export function getPartnerPrefs(
  overrides: Partial<PartnerNotificationPrefs> | null
): PartnerNotificationPrefs {
  return { ...PARTNER_DEFAULTS, ...overrides };
}

export function autoUpgradeOnPhone(
  current: Partial<ClientNotificationPrefs> | null
): Partial<ClientNotificationPrefs> {
  const merged = { ...(current || {}) };
  if (!merged.court_reminders || merged.court_reminders === "email") {
    merged.court_reminders = "both";
  }
  return merged;
}

/** Validates client pref overrides. Returns false if court_reminders is "sms" (unsafe). */
export function validateClientPrefs(overrides: Partial<ClientNotificationPrefs>): boolean {
  if (overrides.court_reminders && !COURT_REMINDER_SAFE_CHANNELS.has(overrides.court_reminders)) {
    return false;
  }
  return true;
}

export function shouldSendEmail(pref: Channel): boolean {
  return pref === "email" || pref === "both";
}

export function shouldSendSMS(pref: Channel): boolean {
  return pref === "sms" || pref === "both";
}

/** 10DLC consent guard — ALL client SMS must pass through this. */
export function canSendClientSMS(
  phone: string | null | undefined,
  smsConsentAt: string | null | undefined
): boolean {
  return !!(phone && smsConsentAt);
}
