"use client";

/**
 * ComplianceReportClient — date-filterable, print-optimized compliance
 * report table for surety audits. Receives all data from the server
 * component; filtering and print happen client-side.
 */

import { useState, useMemo } from "react";
import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";
import { formatDaysDisplay, countScheduledDays } from "@/lib/check-in-schedule";

// ── Types ──────────────────────────────────────────────────────
interface ComplianceClient {
  id: string;
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

interface ComplianceReportClientProps {
  partner: {
    name: string;
    email: string;
    company: string | null;
    promo_code: string | null;
  };
  clients: ComplianceClient[];
  checkIns: Array<{ court_reminder_id: string; checked_in_at: string }>;
}

type DateRange = "all" | "30" | "90" | "q1" | "q2" | "q3" | "q4";

// ── Helpers ────────────────────────────────────────────────────
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getQuarterBounds(q: number): { start: Date; end: Date } {
  const year = new Date().getFullYear();
  const startMonth = (q - 1) * 3;
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + 3, 0, 23, 59, 59, 999),
  };
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Calculate compliance rate for display.
 * Denominator counts from created_at (intentional simplification).
 * Numerator capped at scheduled to prevent >100% display.
 */
function getComplianceRate(client: ComplianceClient, clientCheckIns: number): string {
  if (!client.check_in_days || client.check_in_days.length === 0) return "\u2014";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const endDate = today < client.court_date ? today : client.court_date;
  const startDate = new Date(client.created_at).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const scheduled = countScheduledDays(client.check_in_days, startDate, endDate);
  if (scheduled === 0) return "\u2014";
  const pct = Math.min(100, Math.round((clientCheckIns / scheduled) * 100));
  return `${Math.min(clientCheckIns, scheduled)} / ${scheduled} (${pct}%)`;
}

// ── Component ──────────────────────────────────────────────────
export function ComplianceReportClient({
  partner,
  clients,
  checkIns,
}: ComplianceReportClientProps) {
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // Build per-client check-in summary
  const checkInMap = useMemo(() => {
    const map: Record<string, { count: number; lastCheckIn: string | null }> =
      {};
    for (const ci of checkIns) {
      const existing = map[ci.court_reminder_id];
      if (!existing) {
        map[ci.court_reminder_id] = {
          count: 1,
          lastCheckIn: ci.checked_in_at,
        };
      } else {
        existing.count++;
        if (ci.checked_in_at > (existing.lastCheckIn || "")) {
          existing.lastCheckIn = ci.checked_in_at;
        }
      }
    }
    return map;
  }, [checkIns]);

  // Filter clients by selected date range
  const filteredClients = useMemo(() => {
    if (dateRange === "all") return clients;

    if (dateRange === "30" || dateRange === "90") {
      const cutoff = daysAgo(Number(dateRange));
      return clients.filter((c) => new Date(c.created_at) >= cutoff);
    }

    // Quarter filter — by court_date
    const q = Number(dateRange.replace("q", ""));
    const { start, end } = getQuarterBounds(q);
    return clients.filter((c) => {
      const d = new Date(c.court_date);
      return d >= start && d <= end;
    });
  }, [clients, dateRange]);

  // Summary stats
  const totalDefendants = filteredClients.length;
  const activeCount = filteredClients.filter(
    (c) => c.status === "active"
  ).length;
  const completedCount = filteredClients.filter(
    (c) => c.status === "completed"
  ).length;
  const totalReminders = filteredClients.reduce(
    (sum, c) =>
      sum +
      (c.reminders_sent || []).filter((k) => k.startsWith("reminder_")).length,
    0
  );
  const totalCheckIns = filteredClients.reduce(
    (sum, c) => sum + (checkInMap[c.id]?.count || 0),
    0
  );
  const clientsWithCheckIn = filteredClients.filter(
    (c) => (checkInMap[c.id]?.count || 0) > 0
  ).length;
  const complianceRate =
    totalDefendants > 0
      ? ((clientsWithCheckIn / totalDefendants) * 100).toFixed(0)
      : "0";
  const conversions = filteredClients.filter((c) => c.converted_at).length;

  const dateRangeLabel: Record<DateRange, string> = {
    all: "All Time",
    "30": "Last 30 Days",
    "90": "Last 90 Days",
    q1: "Q1 " + new Date().getFullYear(),
    q2: "Q2 " + new Date().getFullYear(),
    q3: "Q3 " + new Date().getFullYear(),
    q4: "Q4 " + new Date().getFullYear(),
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white print:bg-white print:text-black">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Controls — hidden in print */}
        <div className="flex items-center justify-between mb-8 print:hidden">
          <a
            href="/partner/dashboard"
            className="text-amber-400 hover:text-amber-300 text-sm"
          >
            &larr; Back to Dashboard
          </a>
          <div className="flex items-center gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="all">All Time</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="q1">Q1 {new Date().getFullYear()}</option>
              <option value="q2">Q2 {new Date().getFullYear()}</option>
              <option value="q3">Q3 {new Date().getFullYear()}</option>
              <option value="q4">Q4 {new Date().getFullYear()}</option>
            </select>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 cursor-pointer"
            >
              Print / Save as PDF
            </button>
          </div>
        </div>

        {/* Report Header */}
        <header className="text-center mb-8 print:mb-4">
          <h1 className="text-2xl font-bold print:text-black">
            Defendant Management Report
          </h1>
          <p className="text-lg mt-1 print:text-gray-800">
            {partner.company || partner.name}
          </p>
          <p className="text-zinc-400 text-sm mt-1 print:text-gray-600">
            Generated{" "}
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}{" "}
            &middot; {dateRangeLabel[dateRange]}
          </p>
        </header>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Defendants" value={totalDefendants} />
          <StatCard label="Active" value={activeCount} />
          <StatCard label="Completed" value={completedCount} />
          <StatCard label="Reminders Sent" value={totalReminders} />
          <StatCard label="Check-Ins" value={totalCheckIns} />
          <StatCard label="Compliance Rate" value={`${complianceRate}%`} />
        </div>

        {conversions > 0 && (
          <p className="text-sm text-zinc-400 mb-6 print:text-gray-600 text-center">
            {conversions} defendant{conversions !== 1 ? "s" : ""} converted to
            paid products
          </p>
        )}

        {/* Per-defendant table */}
        {filteredClients.length === 0 ? (
          <p className="text-center text-zinc-400 py-12 print:text-gray-500">
            No defendants in the selected date range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-zinc-700 print:border-gray-300">
                  <th className="pb-2 pr-3 font-semibold">Name</th>
                  <th className="pb-2 pr-3 font-semibold">Charge</th>
                  <th className="pb-2 pr-3 font-semibold">Court Date</th>
                  <th className="pb-2 pr-3 font-semibold">Status</th>
                  <th className="pb-2 pr-3 font-semibold text-right">
                    Reminders
                  </th>
                  <th className="pb-2 pr-3 font-semibold text-right">
                    Check-Ins
                  </th>
                  <th className="pb-2 pr-3 font-semibold">Last Check-In</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-200">Schedule</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-200">Compliance</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => {
                  const ci = checkInMap[c.id];
                  const reminderCount = (c.reminders_sent || []).filter((k) =>
                    k.startsWith("reminder_")
                  ).length;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-zinc-800 print:border-gray-200"
                    >
                      <td className="py-2 pr-3">
                        {c.first_name}
                      </td>
                      <td className="py-2 pr-3 text-zinc-400 print:text-gray-600">
                        {CHARGE_DISPLAY_NAMES[c.charge_type] || c.charge_type}
                      </td>
                      <td className="py-2 pr-3">
                        {formatDateShort(c.court_date)}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="py-2 pr-3 text-right">{reminderCount}</td>
                      <td className="py-2 pr-3 text-right">
                        {ci?.count || 0}
                      </td>
                      <td className="py-2 pr-3 text-zinc-400 print:text-gray-600">
                        {ci?.lastCheckIn
                          ? formatDateShort(ci.lastCheckIn)
                          : "--"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-sm">
                        {formatDaysDisplay(c.check_in_days) || "\u2014"}
                        {c.check_in_source && (
                          <span className="block text-xs text-zinc-500">
                            {c.check_in_source === "client"
                              ? "set by client"
                              : c.check_in_source === "partner"
                              ? "set by bondsman"
                              : "default"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-300 font-medium">
                        {getComplianceRate(c, ci?.count ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-8 pt-4 border-t border-zinc-800 print:border-gray-300 text-center text-sm text-zinc-500 print:text-gray-500">
          <p>Report generated by ImNotAnAttorney Court Prep Platform</p>
          {partner.promo_code && (
            <p className="mt-1">Partner code: {partner.promo_code}</p>
          )}
        </footer>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────
function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-center print:bg-gray-50 print:border-gray-300">
      <p className="text-2xl font-bold text-amber-400 print:text-black">
        {value}
      </p>
      <p className="text-xs text-zinc-400 mt-1 print:text-gray-600">
        {label}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:
      "bg-green-900/50 text-green-300 print:bg-green-100 print:text-green-800",
    completed:
      "bg-zinc-700/50 text-zinc-300 print:bg-gray-100 print:text-gray-700",
    unsubscribed:
      "bg-red-900/50 text-red-300 print:bg-red-100 print:text-red-800",
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.active}`}
    >
      {status}
    </span>
  );
}
