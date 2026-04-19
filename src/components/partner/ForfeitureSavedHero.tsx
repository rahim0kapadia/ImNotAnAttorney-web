"use client";
/**
 * ForfeitureSavedHero, outcome-framed banner at top of /partner/dashboard.
 *
 * Voice: bondsman-native (bond exposure, forfeiture shield, FTA as the villain).
 * NOT SaaS-generic ("metrics", "engagement", "insights"). This is the block
 * that answers "am I getting value?" in under three seconds for a 40-60yo
 * bail agent scanning the dashboard on their phone at a jail desk.
 *
 * Exposure numbers are ESTIMATED from charge type when a real bond amount
 * is not captured (court_reminders.bond_amount_cents does not exist today).
 * The "(estimated)" label is a trust commitment; revisit if a real column
 * lands later.
 */

import { formatCents } from "@/lib/format";

interface ForfeitureSavedHeroProps {
  protectedExposureCents: number;
  clientsActive: number;
  remindersSentThisMonth: number;
  monthLabel: string;
  /** When true, the dollar figure is derived from per-charge-type averages, not a stored bond amount. */
  exposureIsEstimated?: boolean;
}

export function ForfeitureSavedHero({
  protectedExposureCents,
  clientsActive,
  remindersSentThisMonth,
  monthLabel,
  exposureIsEstimated = true,
}: ForfeitureSavedHeroProps) {
  const hasAny = clientsActive > 0 || remindersSentThisMonth > 0;

  return (
    <section
      aria-labelledby="forfeiture-hero-heading"
      className="bg-zinc-900 rounded-xl border border-amber-500/40 p-6 md:p-8"
    >
      <p id="forfeiture-hero-heading" className="font-display text-lg md:text-xl text-amber-400 mb-2">
        Your Forfeiture Shield
      </p>

      <p className="font-display text-4xl md:text-5xl font-bold text-white leading-tight">
        {formatCents(protectedExposureCents)}
        {exposureIsEstimated && (
          <span className="ml-2 align-middle text-xs md:text-sm font-normal text-zinc-500">
            (estimated)
          </span>
        )}
      </p>
      <p className="text-sm md:text-base text-zinc-300 mt-1">
        in bond exposure protected
      </p>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-300">
        <span>
          <span className="font-bold text-white">{clientsActive}</span>{" "}
          {clientsActive === 1 ? "client" : "clients"} active
        </span>
        <span className="text-zinc-600" aria-hidden="true">
          &middot;
        </span>
        <span>
          <span className="font-bold text-white">{remindersSentThisMonth}</span>{" "}
          {remindersSentThisMonth === 1 ? "reminder" : "reminders"} delivered in {monthLabel}
        </span>
      </div>

      <p className="mt-4 text-xs md:text-sm text-zinc-400 italic">
        Industry FTA rate: 15&ndash;20%. Every client we keep on track is a bond you don&apos;t forfeit.
      </p>

      {!hasAny && (
        <p className="mt-3 text-xs text-zinc-500">
          No clients on the board yet. Text your partner link to the next one you bond out and this number starts working for you within the hour.
        </p>
      )}
    </section>
  );
}
