"use client";

import { useState, useEffect, useCallback } from "react";
import {
  OperatorShell,
  useOperatorPassword,
  operatorHeaders,
} from "@/components/OperatorShell";
import { formatCurrency } from "@/lib/format";
import type { CaseMetrics } from "@/lib/types/operator";

// ============================================================
// Page entry
// ============================================================

export default function MetricsPage() {
  return (
    <OperatorShell>
      <MetricsContent />
    </OperatorShell>
  );
}

// ============================================================
// Content
// ============================================================

function MetricsContent() {
  const password = useOperatorPassword();
  const [metrics, setMetrics] = useState<CaseMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operator/metrics", {
        headers: operatorHeaders(password),
      });
      if (res.status === 401) {
        sessionStorage.removeItem("admin-password");
        window.location.reload();
        return;
      }
      if (res.ok) {
        setMetrics(await res.json());
      }
    } catch {
      // network error
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  if (loading && !metrics) {
    return (
      <div className="p-8">
        <p className="text-sm text-zinc-400">Loading metrics...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-400">Failed to load metrics.</p>
      </div>
    );
  }

  const m = metrics;

  // Compute max values for bar charts
  const statusEntries = Object.entries(m.cases_by_status);
  const maxStatusCount = Math.max(1, ...statusEntries.map(([, v]) => v));

  const tierEntries = Object.entries(m.cases_by_tier);
  const maxTierCount = Math.max(1, ...tierEntries.map(([, v]) => v));

  // SLA compliance: total - breaches / total
  const slaCompliance =
    m.total_cases > 0
      ? Math.round(((m.total_cases - m.sla_breaches) / m.total_cases) * 100)
      : 100;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Metrics</h1>
        <button
          onClick={loadMetrics}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* ===== Top-level cards ===== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6">
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
            Total Revenue
          </p>
          <p className="text-3xl font-bold text-white">
            {formatCurrency(m.total_revenue_cents)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6">
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
            Total Cases
          </p>
          <p className="text-3xl font-bold text-white">{m.total_cases}</p>
        </div>
        <div className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6">
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
            Avg Delivery Time
          </p>
          <p className="text-3xl font-bold text-white">
            {m.avg_delivery_hours != null
              ? `${m.avg_delivery_hours.toFixed(1)}h`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6">
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
            SLA Compliance
          </p>
          <p
            className={`text-3xl font-bold ${
              slaCompliance >= 95
                ? "text-green-400"
                : slaCompliance >= 80
                  ? "text-amber-400"
                  : "text-red-400"
            }`}
          >
            {slaCompliance}%
          </p>
        </div>
      </div>

      {/* ===== Pipeline Health ===== */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6">
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
            Active Jobs
          </p>
          <p className="text-3xl font-bold text-white">{m.active_jobs}</p>
        </div>
        <div className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6">
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
            Failed Jobs
          </p>
          <p
            className={`text-3xl font-bold ${
              m.failed_jobs > 0 ? "text-red-400" : "text-white"
            }`}
          >
            {m.failed_jobs}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6">
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
            Open Tasks
          </p>
          <p className="text-3xl font-bold text-white">{m.open_tasks}</p>
        </div>
      </div>

      {/* ===== SLA Breaches ===== */}
      {m.sla_breaches > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <p className="text-lg font-semibold text-red-400">
            {m.sla_breaches} SLA Breach{m.sla_breaches !== 1 ? "es" : ""}
          </p>
          <p className="text-sm text-red-400/80 mt-1">
            Cases have exceeded their delivery deadline.
          </p>
        </div>
      )}

      {/* ===== Cases by Status ===== */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Cases by Status
        </h2>
        <div className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6 space-y-3">
          {statusEntries.length === 0 ? (
            <p className="text-sm text-zinc-400">No cases yet.</p>
          ) : (
            statusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center gap-4">
                <span className="w-28 text-sm text-zinc-400 shrink-0">
                  {status}
                </span>
                <div className="flex-1 h-6 rounded bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${statusBarColor(status)}`}
                    style={{
                      width: `${(count / maxStatusCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm text-zinc-300 w-10 text-right tabular-nums">
                  {count}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ===== Cases by Tier ===== */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Cases by Tier
        </h2>
        <div className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6 space-y-3">
          {tierEntries.length === 0 ? (
            <p className="text-sm text-zinc-400">No cases yet.</p>
          ) : (
            tierEntries.map(([tier, count]) => (
              <div key={tier} className="flex items-center gap-4">
                <span className="w-36 text-sm text-zinc-400 shrink-0 truncate">
                  {tier}
                </span>
                <div className="flex-1 h-6 rounded bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded bg-amber-500 transition-all"
                    style={{
                      width: `${(count / maxTierCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm text-zinc-300 w-10 text-right tabular-nums">
                  {count}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

// ============================================================
// Bar color by status
// ============================================================

function statusBarColor(status: string): string {
  switch (status) {
    case "delivered":
      return "bg-green-500";
    case "review":
    case "processing":
      return "bg-amber-500";
    case "failed":
    case "generation-failed":
    case "refunded":
      return "bg-red-500";
    default:
      return "bg-zinc-600";
  }
}
