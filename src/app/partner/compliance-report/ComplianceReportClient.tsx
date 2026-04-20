"use client";

/**
 * ComplianceReportClient, date-filterable, print-optimized compliance
 * report table for surety audits. Receives all data from the server
 * component; filtering and print happen client-side.
 *
 * Task 27 (bondsman modes v2): the report is rendered in two modes.
 *   - checkInMode="enabled": full bondsman dashboard with check-in cards,
 *     check-in columns, schedule and compliance columns.
 *   - checkInMode="disabled": referral-mode partner has check-ins turned
 *     off — the report is narrowed to court-date reminder activity only.
 *     Every check-in-specific UI element is omitted (cards, columns,
 *     schedule, compliance, headings) and the intro copy branches.
 */

import { useState, useMemo } from "react";
import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";
import { formatDaysDisplay, countScheduledDays } from "@/lib/check-in-schedule";
import {
  FORFEITURE_RANGE_LOW_USD,
  FORFEITURE_RANGE_HIGH_USD,
  FORFEITURE_RANGE_DISPLAY,
} from "@/lib/partner-data";

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
    company: string | null;
    promo_code: string | null;
  };
  /**
   * Task 27 (bondsman modes v2): when "disabled", every check-in-specific
   * element (summary cards, columns, schedule/compliance, section headings)
   * is omitted and the intro copy switches to the referral-mode branch.
   */
  checkInMode: "enabled" | "disabled";
  clients: ComplianceClient[];
  checkIns: Array<{ court_reminder_id: string; checked_in_at: string }>;
}

type DateRange =
  | "all"
  | "30"
  | "90"
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "q1-prev"
  | "q2-prev"
  | "q3-prev"
  | "q4-prev"
  | "custom";

// ── Helpers ────────────────────────────────────────────────────
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getQuarterBounds(q: number, year: number): { start: Date; end: Date } {
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

// Status label mapping — database values stay the same, only display changes.
function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "On track";
    case "completed":
      return "Court closed";
    case "unsubscribed":
      return "Opted out of reminders";
    default:
      return status;
  }
}

// ── Component ──────────────────────────────────────────────────
export function ComplianceReportClient({
  partner,
  checkInMode,
  clients,
  checkIns,
}: ComplianceReportClientProps) {
  const [dateRange, setDateRange] = useState<DateRange>("all");
  // Custom range (court_date inclusive, both sides). Only consulted when
  // dateRange === "custom". Empty strings = unbounded on that side.
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const checkInEnabled = checkInMode === "enabled";
  const operator = partner.company || partner.name;
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

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

  // Filter clients by selected date range.
  // - "all" / "30" / "90" filter by created_at (signup timing).
  // - "qN" / "qN-prev" filter by court_date (the surety-audit use case:
  //   "show me defendants whose cases closed in period X").
  // - "custom" filters by court_date inclusive on both sides; empty from/to
  //   = unbounded on that side.
  const filteredClients = useMemo(() => {
    if (dateRange === "all") return clients;

    if (dateRange === "30" || dateRange === "90") {
      const cutoff = daysAgo(Number(dateRange));
      return clients.filter((c) => new Date(c.created_at) >= cutoff);
    }

    if (dateRange === "custom") {
      // Guard: devtools-injected invalid strings produce Invalid Date (NaN).
      // NaN comparisons are always false, so without this guard an invalid
      // lower bound silently disables the filter and lets every row through.
      const rawFrom = customFrom ? new Date(customFrom + "T00:00:00") : null;
      const rawTo = customTo ? new Date(customTo + "T23:59:59.999") : null;
      const fromDate = rawFrom && !isNaN(rawFrom.getTime()) ? rawFrom : null;
      const toDate = rawTo && !isNaN(rawTo.getTime()) ? rawTo : null;
      if (!fromDate && !toDate) return clients;
      return clients.filter((c) => {
        const d = new Date(c.court_date + "T00:00:00");
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      });
    }

    // Quarter filter, by court_date. Regex matches "q1".."q4" optionally
    // followed by "-prev"; anything else falls through to a no-op return.
    const match = dateRange.match(/^q([1-4])(-prev)?$/);
    if (!match) return clients;
    const q = Number(match[1]);
    const year = match[2] ? prevYear : currentYear;
    const { start, end } = getQuarterBounds(q, year);
    return clients.filter((c) => {
      const d = new Date(c.court_date);
      return d >= start && d <= end;
    });
  }, [clients, dateRange, customFrom, customTo, currentYear, prevYear]);

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

  // Custom-range display formats ISO yyyy-mm-dd as "Mon D, YYYY". Empty side
  // renders as "earliest"/"today" so the header reads naturally.
  const customLabel = (() => {
    const fmt = (iso: string) =>
      new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    const from = customFrom ? fmt(customFrom) : "earliest";
    const to = customTo ? fmt(customTo) : "today";
    return `${from} — ${to}`;
  })();

  const dateRangeLabel: Record<DateRange, string> = {
    all: "All Time",
    "30": "Last 30 Days",
    "90": "Last 90 Days",
    q1: `Q1 ${currentYear}`,
    q2: `Q2 ${currentYear}`,
    q3: `Q3 ${currentYear}`,
    q4: `Q4 ${currentYear}`,
    "q1-prev": `Q1 ${prevYear}`,
    "q2-prev": `Q2 ${prevYear}`,
    "q3-prev": `Q3 ${prevYear}`,
    "q4-prev": `Q4 ${prevYear}`,
    custom: `Custom: ${customLabel}`,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white print:bg-white print:text-black">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Controls, hidden in print */}
        <div className="flex items-center justify-between mb-8 print:hidden">
          <a
            href="/partner/dashboard"
            className="text-amber-400 hover:text-amber-300 text-sm"
          >
            &larr; Back to Dashboard
          </a>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              aria-label="Date range filter"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="all">All Time</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <optgroup label={`${currentYear} (current year)`}>
                <option value="q1">Q1 {currentYear}</option>
                <option value="q2">Q2 {currentYear}</option>
                <option value="q3">Q3 {currentYear}</option>
                <option value="q4">Q4 {currentYear}</option>
              </optgroup>
              <optgroup label={`${prevYear} (previous year)`}>
                <option value="q1-prev">Q1 {prevYear}</option>
                <option value="q2-prev">Q2 {prevYear}</option>
                <option value="q3-prev">Q3 {prevYear}</option>
                <option value="q4-prev">Q4 {prevYear}</option>
              </optgroup>
              <option value="custom">Custom range…</option>
            </select>
            {dateRange === "custom" && (
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <label className="flex items-center gap-1">
                  <span className="text-zinc-400">From</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    aria-label="Custom range start date"
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-zinc-400">To</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    aria-label="Custom range end date"
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white"
                  />
                </label>
              </div>
            )}
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 cursor-pointer"
            >
              Print for surety
            </button>
          </div>
        </div>

        {/* Report Header — operator-first framing (bondsman is the operator; INAA is the tooling provider) */}
        <header className="text-center mb-8 print:mb-4">
          <h1 className="text-2xl font-bold print:text-black">
            {operator} &middot; Defendant Compliance &amp; Court-Appearance Program
          </h1>
          <p className="text-sm text-zinc-400 print:text-gray-700 mt-1">
            Surety audit report &middot; automated reminder{checkInEnabled ? " and check-in" : ""} system operated by {operator}
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

        {/* Mode-aware intro copy (Task 27, bondsman modes v2) — bondsman-as-operator voice, no SaaS filler */}
        <p className="text-zinc-400 mb-6 print:text-gray-600">
          {checkInEnabled
            ? `${operator} runs an active compliance program for every defendant bonded out of this office. Every client gets court-date reminders by text and email. Check-in mode is on for all active clients, producing the per-defendant log below.`
            : `${operator} runs an automated court-date reminder program for every defendant bonded out of this office. Every active client receives 48-hour, 24-hour, and morning-of reminders by text and email, logged below.`}
        </p>

        {/* Forfeiture-exposure-retired card — quantifies the #1 bondsman pain (P1 in audit plan).
            Math is visible + conservative. Denominator: completed cases (api/cron/court-reminders
            route.ts:228 sets status='completed' when court date has passed, i.e. the court cycle
            closed without forfeiture action on this program's watch). Range constants live in
            @/lib/partner-data (FORFEITURE_RANGE_LOW_USD / FORFEITURE_RANGE_HIGH_USD) for
            cross-surface consistency with /partners/bondsman. Surety auditors can redo the math
            if they prefer — full disclosure block renders below. Zero-state renders an
            alternative card when no cases have closed yet. */}
        {completedCount > 0 ? (
          <section className="mb-8 bg-zinc-900 border border-amber-500/40 rounded-lg p-5 print:bg-amber-50 print:border-amber-300">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
              <h2 className="text-lg font-bold text-amber-400 print:text-amber-800">
                Forfeiture exposure avoided (closed cases)
              </h2>
              <p className="text-xs text-zinc-400 print:text-gray-600">
                Range based on {FORFEITURE_RANGE_DISPLAY} typical per-no-show forfeiture
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
              <div>
                <p className="text-2xl font-bold text-white print:text-black">
                  {completedCount}
                </p>
                <p className="text-xs text-zinc-400 mt-1 print:text-gray-600">
                  Defendants closed without forfeiture
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white print:text-black">
                  {totalReminders}
                </p>
                <p className="text-xs text-zinc-400 mt-1 print:text-gray-600">
                  Compliance touchpoints delivered
                </p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <p className="text-2xl font-bold text-amber-400 print:text-amber-800">
                  ${(completedCount * FORFEITURE_RANGE_LOW_USD).toLocaleString()}&ndash;${(completedCount * FORFEITURE_RANGE_HIGH_USD).toLocaleString()}
                </p>
                <p className="text-xs text-zinc-400 mt-1 print:text-gray-600">
                  Estimated forfeiture exposure retired
                </p>
              </div>
            </div>
            <p className="text-xs text-zinc-400 print:text-gray-600 mb-2">
              Math: {completedCount} {completedCount === 1 ? "defendant" : "defendants"} reached court-closed status while enrolled in this program &times; {FORFEITURE_RANGE_DISPLAY} typical per-no-show forfeiture. Estimate, not a guarantee. Prevention is probabilistic. The program reduces no-shows, it does not eliminate them.
            </p>
            <p className="text-xs text-zinc-400 italic print:text-gray-600">
              Bond face values vary by jurisdiction and charge severity; this range reflects common misdemeanor and low-felony bond amounts. Surety auditors can substitute the actual bond face value for this office. Figures reflect gross exposure on closed cases; actual forfeitures depend on underwriting and individual surety terms.
            </p>
          </section>
        ) : (
          <section className="mb-8 bg-zinc-900 border border-zinc-700 rounded-lg p-5 print:bg-gray-50 print:border-gray-300">
            <h2 className="text-lg font-bold text-zinc-300 print:text-gray-800 mb-2">
              Program active — no court-closed defendants yet this period
            </h2>
            <p className="text-xs text-zinc-400 print:text-gray-600">
              Exposure retired will display once cases close. Reminder and (if enabled) check-in activity for every enrolled defendant is logged below.
            </p>
          </section>
        )}

        {/* Summary Stats — 4 cards (referral): 2-col mobile → 4-col md; 6 cards (check-in): 2-col mobile → 3-col md */}
        <div className={`grid gap-4 mb-8 ${checkInEnabled ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-4"}`}>
          <StatCard label="Total defendants" value={totalDefendants} />
          <StatCard label="Active" value={activeCount} />
          <StatCard label="Court-closed" value={completedCount} />
          <StatCard label="Reminders delivered" value={totalReminders} />
          {checkInEnabled && (
            <>
              <StatCard label="Check-ins logged" value={totalCheckIns} />
              <StatCard label="Compliance rate" value={`${complianceRate}%`} />
            </>
          )}
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
            {clients.length === 0
              ? "No clients enrolled yet. Every client you bond out starting today will appear here."
              : "No clients in the selected date range. Select a different date range or pick \"All Time\" for the full history."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-zinc-700 print:border-gray-300">
                  <th scope="col" className="pb-2 pr-3 font-semibold">Name</th>
                  <th scope="col" className="pb-2 pr-3 font-semibold">Charge</th>
                  <th scope="col" className="pb-2 pr-3 font-semibold">Court Date</th>
                  <th scope="col" className="pb-2 pr-3 font-semibold">Status</th>
                  <th scope="col" className="pb-2 pr-3 font-semibold text-right">
                    Reminders
                  </th>
                  {checkInEnabled && (
                    <>
                      <th scope="col" className="pb-2 pr-3 font-semibold text-right">
                        Check-Ins
                      </th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">
                        Last Check-In
                      </th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">
                        Schedule
                      </th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">
                        Compliance
                      </th>
                    </>
                  )}
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
                      {checkInEnabled && (
                        <>
                          <td className="py-2 pr-3 text-right">
                            {ci?.count || 0}
                          </td>
                          <td className="py-2 pr-3 text-zinc-400 print:text-gray-600">
                            {ci?.lastCheckIn
                              ? formatDateShort(ci.lastCheckIn)
                              : "--"}
                          </td>
                          <td className="py-2 pr-3 text-zinc-400 print:text-gray-600">
                            {formatDaysDisplay(c.check_in_days) || "\u2014"}
                            {c.check_in_source && (
                              <span className="block text-xs text-zinc-400 print:text-gray-500">
                                {c.check_in_source === "client"
                                  ? "set by client"
                                  : c.check_in_source === "partner"
                                  ? "set by bondsman"
                                  : "default"}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-zinc-300 font-medium">
                            {getComplianceRate(c, ci?.count ?? 0)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Signature block for surety auditors */}
        <div className="mt-8 pt-6 border-t border-zinc-700 print:border-gray-400">
          <p className="text-sm text-zinc-400 print:text-gray-700 mb-6">
            I certify this report accurately reflects {operator}&apos;s compliance activity for the period shown.
          </p>
          <div className="grid grid-cols-2 gap-8 text-sm">
            <div>
              <div className="border-b border-zinc-600 print:border-gray-500 h-8"></div>
              <p className="text-zinc-400 print:text-gray-600 mt-1">Signature</p>
            </div>
            <div>
              <div className="border-b border-zinc-600 print:border-gray-500 h-8"></div>
              <p className="text-zinc-400 print:text-gray-600 mt-1">Date</p>
            </div>
          </div>
        </div>

        {/* Footer — bondsman is the operator; INAA is the tooling provider */}
        <footer className="mt-8 pt-4 border-t border-zinc-800 print:border-gray-300 text-center text-sm text-zinc-400 print:text-gray-500">
          <p>
            Program operated by {operator}. Tooling by ImNotAnAttorney.
          </p>
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
      {statusLabel(status)}
    </span>
  );
}
