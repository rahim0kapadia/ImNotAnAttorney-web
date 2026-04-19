"use client";
/**
 * ClientTracker, FTA prevention dashboard for partners.
 *
 * Shows all clients who signed up through the partner's link with
 * court dates, reminder status, and conversion tracking. Replaces
 * the simple "Court prep sign-ups: N" counter.
 *
 * Bondsman-modes v2: Check-Ins + Schedule columns only render when
 * checkInEnabled. Referral-mode partners see a compact table without
 * check-in columns (thead/tbody cell counts must match in both modes).
 */

import { Star } from "lucide-react";
import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";
import { getETDow, getETDate } from "@/lib/check-in-schedule";

interface CourtClient {
  id: string;
  token: string;
  first_name: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  status: string;
  reminders_sent: string[];
  created_at: string;
  converted_at: string | null;
  check_in_days: string[] | null;
  check_in_source: string | null;
}

interface ClientTrackerProps {
  clients: CourtClient[];
  onAddClient: () => void;
  checkInSummary: Record<string, { count: number; lastCheckIn: string | null }>;
  checkInEnabled: boolean;
}

function daysUntil(dateStr: string): number {
  const court = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.ceil((court.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function statusBadge(status: string, daysLeft: number, converted: boolean) {
  if (converted) return { label: "Converted", color: "text-green-400 bg-green-400/10" };
  if (status === "completed") return { label: "Past", color: "text-zinc-500 bg-zinc-500/10" };
  if (status === "unsubscribed") return { label: "Unsubscribed", color: "text-zinc-500 bg-zinc-500/10" };
  if (daysLeft < 0) return { label: "Past", color: "text-zinc-500 bg-zinc-500/10" };
  if (daysLeft <= 1) return { label: "Tomorrow", color: "text-red-400 bg-red-400/10" };
  if (daysLeft <= 3) return { label: `${daysLeft}d`, color: "text-amber-400 bg-amber-400/10" };
  if (daysLeft <= 7) return { label: `${daysLeft}d`, color: "text-yellow-400 bg-yellow-400/10" };
  return { label: `${daysLeft}d`, color: "text-zinc-300 bg-zinc-700" };
}

function reminderProgress(sent: string[]): string {
  const total = 4; // 14d, 7d, 3d, 1d
  const count = (sent || []).filter(k => k.startsWith("reminder_")).length;
  return `${count}/${total}`;
}

export function ClientTracker({ clients, onAddClient, checkInSummary, checkInEnabled }: ClientTrackerProps) {
  const todayDow = getETDow();
  const todayDateStr = getETDate();
  const activeClients = clients.filter(c => c.status === "active");
  const upcomingThisWeek = activeClients.filter(c => {
    const d = daysUntil(c.court_date);
    return d >= 0 && d <= 7;
  });

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Your Clients</h2>
        <button
          onClick={onAddClient}
          className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition-colors cursor-pointer"
        >
          + Add Client
        </button>
      </div>

      {/* Summary stats, 4 tiles with check-ins, 3 without */}
      <div className={`grid ${checkInEnabled ? "grid-cols-4" : "grid-cols-3"} gap-3 mb-6`}>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{activeClients.length}</p>
          <p className="text-xs text-zinc-400">Active</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{upcomingThisWeek.length}</p>
          <p className="text-xs text-zinc-400">This Week</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{clients.filter(c => c.converted_at).length}</p>
          <p className="text-xs text-zinc-400">Converted</p>
        </div>
        {checkInEnabled && (
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{Object.values(checkInSummary).reduce((sum, s) => sum + s.count, 0)}</p>
            <p className="text-xs text-zinc-400">Check-Ins</p>
          </div>
        )}
      </div>

      {clients.length === 0 ? (
        <p className="text-zinc-400 text-sm">
          No clients yet. When defendants use your link and sign up for court prep, they&apos;ll appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-zinc-700">
                <th scope="col" className="pb-2 pr-4">Name</th>
                <th scope="col" className="pb-2 pr-4">Charge</th>
                <th scope="col" className="pb-2 pr-4">Court Date</th>
                <th scope="col" className="pb-2 pr-4">Status</th>
                <th scope="col" className="pb-2 pr-4">Reminders</th>
                {checkInEnabled && <th scope="col" className="pb-2 pr-4">Check-Ins</th>}
                {checkInEnabled && <th scope="col" className="pb-2 pr-4">Schedule</th>}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const days = daysUntil(c.court_date);
                const badge = statusBadge(c.status, days, !!c.converted_at);
                const chargeName = CHARGE_DISPLAY_NAMES[c.charge_type] || c.charge_type;
                const ciData = checkInSummary[c.id];
                const hasSchedule = c.check_in_days && c.check_in_days.length > 0;
                const isScheduledToday = hasSchedule && c.check_in_days!.includes(todayDow);
                const checkedInToday = ciData?.lastCheckIn &&
                  new Date(ciData.lastCheckIn).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) === todayDateStr;

                // Dot + sr-only label for check-in state. Only rendered when checkInEnabled.
                let dot: React.ReactNode = null;
                if (checkInEnabled) {
                  if (hasSchedule) {
                    if (checkedInToday) {
                      dot = (
                        <>
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" aria-hidden="true" />
                          <span className="sr-only">Checked in today</span>
                        </>
                      );
                    } else if (isScheduledToday) {
                      dot = (
                        <>
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden="true" />
                          <span className="sr-only">Missed check-in today</span>
                        </>
                      );
                    } else {
                      dot = (
                        <>
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-600" aria-hidden="true" />
                          <span className="sr-only">Not scheduled today</span>
                        </>
                      );
                    }
                  } else if (c.court_date > todayDateStr) {
                    dot = <span className="text-xs text-amber-400 font-medium">Schedule needed</span>;
                  }
                }

                return (
                  <tr key={c.id} className="border-b border-zinc-800">
                    <td className="py-3 pr-4 text-white">
                      <span className="flex items-center gap-2">
                        {c.first_name}
                        {dot}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">{chargeName}</td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {new Date(c.court_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">{reminderProgress(c.reminders_sent)}</td>
                    {checkInEnabled && (
                      <td className="py-3 pr-4 text-zinc-400">
                        {ciData ? (
                          <span>
                            {ciData.count}{" "}
                            <span className="text-zinc-400 text-xs">
                              {ciData.lastCheckIn ? `(${new Date(ciData.lastCheckIn).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : ""}
                            </span>
                          </span>
                        ) : (
                          <span>&mdash;</span>
                        )}
                      </td>
                    )}
                    {checkInEnabled && (
                      <td className="py-3 pr-4 text-zinc-400 text-xs">
                        {hasSchedule ? (
                          <span>
                            {c.check_in_days!.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}
                            {c.check_in_source === "partner" && (
                              <>
                                <Star className="inline ml-1 h-3 w-3 text-amber-400" aria-hidden="true" />
                                <span className="sr-only">Set by partner</span>
                              </>
                            )}
                          </span>
                        ) : (
                          <span>&mdash;</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
