"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  OperatorShell,
  useOperatorPassword,
  operatorHeaders,
} from "@/components/OperatorShell";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, formatCurrency } from "@/lib/format";
import type {
  CaseMetrics,
  CaseListItem,
  ProcessingJobRow,
  OperatorTaskRow,
} from "@/lib/types/operator";

// ============================================================
// Helpers
// ============================================================

// formatDate, formatCurrency imported from @/lib/format

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "< 1 hour ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================
// Status badge
// ============================================================

// StatusBadge imported from @/components/StatusBadge

function PriorityBadge({ priority }: { priority: string }) {
  let cls = "bg-zinc-800 text-zinc-400 border border-zinc-700";
  if (priority === "critical" || priority === "urgent")
    cls = "bg-red-500/10 text-red-400 border border-red-500/20";
  else if (priority === "high")
    cls = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {priority}
    </span>
  );
}

// ============================================================
// Page entry
// ============================================================

export default function OperatorHomePage() {
  return (
    <OperatorShell>
      <HomeContent />
    </OperatorShell>
  );
}

// ============================================================
// Data shape
// ============================================================

interface DashboardData {
  metrics: CaseMetrics | null;
  reviewCases: CaseListItem[];
  failedJobs: ProcessingJobRow[];
  tasks: OperatorTaskRow[];
}

// ============================================================
// Content
// ============================================================

function HomeContent() {
  const password = useOperatorPassword();
  const [data, setData] = useState<DashboardData>({
    metrics: null,
    reviewCases: [],
    failedJobs: [],
    tasks: [],
  });
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = operatorHeaders(password);
      const [metricsRes, casesRes, jobsRes, tasksRes] = await Promise.all([
        fetch("/api/operator/metrics", { headers }),
        fetch("/api/operator/cases?status=review&limit=20", { headers }),
        fetch("/api/operator/jobs?status=failed&limit=20", { headers }),
        fetch("/api/operator/tasks?status=open&limit=20", { headers }),
      ]);

      // Handle 401
      for (const res of [metricsRes, casesRes, jobsRes, tasksRes]) {
        if (res.status === 401) {
          sessionStorage.removeItem("admin-password");
          window.location.reload();
          return;
        }
      }

      const [metrics, casesJson, jobsJson, tasksJson] = await Promise.all([
        metricsRes.ok ? metricsRes.json() : null,
        casesRes.ok ? casesRes.json() : { cases: [] },
        jobsRes.ok ? jobsRes.json() : { jobs: [] },
        tasksRes.ok ? tasksRes.json() : { tasks: [] },
      ]);

      setData({
        metrics,
        reviewCases: casesJson.cases ?? [],
        failedJobs: jobsJson.jobs ?? [],
        tasks: tasksJson.tasks ?? [],
      });
    } catch {
      // network error — keep stale data
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function retryJob(jobId: string) {
    setRetrying(jobId);
    try {
      const res = await fetch(`/api/operator/jobs/${jobId}/retry`, {
        method: "POST",
        headers: operatorHeaders(password),
      });
      if (res.status === 401) {
        sessionStorage.removeItem("admin-password");
        window.location.reload();
        return;
      }
      await loadData();
    } catch {
      // silent
    } finally {
      setRetrying(null);
    }
  }

  const m = data.metrics;

  // ----- Loading state -----
  if (loading && !m) {
    return (
      <div className="p-8">
        <p className="text-zinc-400 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Action Queue</h1>
        <button
          onClick={loadData}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* ===== Section 1: SLA Breaches ===== */}
      {m && m.sla_breaches > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">!</span>
            <div>
              <h2 className="text-lg font-semibold text-red-400">
                {m.sla_breaches} SLA Breach{m.sla_breaches !== 1 ? "es" : ""}
              </h2>
              <p className="text-sm text-red-400/80">
                Cases have exceeded their delivery deadline. Immediate action
                required.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== Section 2: Cases Awaiting Review ===== */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Cases Awaiting Review
          {data.reviewCases.length > 0 && (
            <span className="ml-2 text-sm font-normal text-amber-400">
              ({data.reviewCases.length})
            </span>
          )}
        </h2>
        {data.reviewCases.length === 0 ? (
          <p className="text-sm text-zinc-400">No cases awaiting review.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.reviewCases.map((c) => (
              <Link
                key={c.id}
                href={`/operator/cases/${c.id}`}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-amber-500/40 transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-white truncate max-w-[60%]">
                    {c.email}
                  </span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-400 uppercase tracking-wider">
                    {c.tier}
                  </span>
                  <span>{timeAgo(c.created_at)}</span>
                </div>
                {c.finding_count > 0 && (
                  <p className="mt-2 text-xs text-zinc-400">
                    {c.finding_count} finding{c.finding_count !== 1 ? "s" : ""}
                    {c.witness_count > 0 &&
                      ` / ${c.witness_count} witness${c.witness_count !== 1 ? "es" : ""}`}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ===== Section 3: Failed Jobs ===== */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Failed Jobs
          {data.failedJobs.length > 0 && (
            <span className="ml-2 text-sm font-normal text-red-400">
              ({data.failedJobs.length})
            </span>
          )}
        </h2>
        {data.failedJobs.length === 0 ? (
          <p className="text-sm text-zinc-400">No failed jobs.</p>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400 uppercase tracking-wider">
                  <th className="px-4 py-3">Job Type</th>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3">Retries</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.failedJobs.map((j) => (
                  <tr key={j.id} className="border-b border-zinc-800">
                    <td className="px-4 py-3 text-zinc-200">{j.job_type}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/operator/cases/${j.case_id}`}
                        className="text-amber-500 hover:text-amber-400"
                      >
                        {j.case_id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-red-400 max-w-xs truncate">
                      {j.error_message ?? "Unknown error"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {j.retry_count}/{j.max_retries}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => retryJob(j.id)}
                        disabled={retrying === j.id}
                        className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
                      >
                        {retrying === j.id ? "Retrying..." : "Retry"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== Section 4: Open Tasks ===== */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Open Tasks
          {data.tasks.length > 0 && (
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({data.tasks.length})
            </span>
          )}
        </h2>
        {data.tasks.length === 0 ? (
          <p className="text-sm text-zinc-400">No open tasks.</p>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400 uppercase tracking-wider">
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.tasks.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-800">
                    <td className="px-4 py-3">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-3 text-zinc-200">{t.title}</td>
                    <td className="px-4 py-3 text-zinc-400">{t.task_type}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/operator/cases/${t.case_id}`}
                        className="text-amber-500 hover:text-amber-400"
                      >
                        {t.case_id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {t.due_at ? formatDate(t.due_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== Section 5: Quick Stats ===== */}
      {m && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            Quick Stats
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
                Total Cases
              </p>
              <p className="text-3xl font-bold text-white">{m.total_cases}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
                Active Jobs
              </p>
              <p className="text-3xl font-bold text-white">{m.active_jobs}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
                Revenue
              </p>
              <p className="text-3xl font-bold text-white">
                {formatCurrency(m.total_revenue_cents)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
                Open Tasks
              </p>
              <p className="text-3xl font-bold text-white">{m.open_tasks}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
