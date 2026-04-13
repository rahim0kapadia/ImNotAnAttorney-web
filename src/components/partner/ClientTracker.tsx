"use client";
/**
 * ClientTracker — FTA prevention dashboard for partners.
 *
 * Shows all clients who signed up through the partner's link with
 * court dates, reminder status, and conversion tracking. Replaces
 * the simple "Court prep sign-ups: N" counter.
 */

import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";

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
}

interface ClientTrackerProps {
  clients: CourtClient[];
  onAddClient: () => void;
  checkInSummary: Record<string, { count: number; lastCheckIn: string | null }>;
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

export function ClientTracker({ clients, onAddClient }: ClientTrackerProps) {
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

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
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
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Charge</th>
                <th className="pb-2 pr-4">Court Date</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Reminders</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const days = daysUntil(c.court_date);
                const badge = statusBadge(c.status, days, !!c.converted_at);
                const chargeName = CHARGE_DISPLAY_NAMES[c.charge_type] || c.charge_type;
                return (
                  <tr key={c.id} className="border-b border-zinc-800">
                    <td className="py-3 pr-4 text-white">{c.first_name}</td>
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
