"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  OperatorShell,
  useOperatorPassword,
  operatorHeaders,
} from "@/components/OperatorShell";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime as formatDate } from "@/lib/format";
import type { ProcessingJobRow } from "@/lib/types/operator";

// ============================================================
// Status badge
// ============================================================

// StatusBadge imported from @/components/StatusBadge

// ============================================================
// Constants
// ============================================================

const JOB_STATUSES = ["all", "queued", "running", "completed", "failed"] as const;
const JOB_TYPES = [
  "all",
  "ocr",
  "classify",
  "extract",
  "analyze",
  "timeline",
  "witness",
  "citation",
  "motion",
  "report",
] as const;

const PAGE_SIZE = 25;
const AUTO_REFRESH_MS = 30_000;

// ============================================================
// Page entry
// ============================================================

export default function JobsPage() {
  return (
    <OperatorShell>
      <JobsContent />
    </OperatorShell>
  );
}

// ============================================================
// Content
// ============================================================

function JobsContent() {
  const password = useOperatorPassword();

  const [jobs, setJobs] = useState<ProcessingJobRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [caseIdInput, setCaseIdInput] = useState("");
  const [caseIdFilter, setCaseIdFilter] = useState("");

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("job_type", typeFilter);
      if (caseIdFilter.trim()) params.set("case_id", caseIdFilter.trim());

      const res = await fetch(`/api/operator/jobs?${params}`, {
        headers: operatorHeaders(password),
      });

      if (res.status === 401) {
        sessionStorage.removeItem("admin-password");
        window.location.reload();
        return;
      }

      if (res.ok) {
        const json = await res.json();
        setJobs(json.jobs ?? []);
        setTotal(json.total ?? 0);
      }
    } catch {
      // network error
    } finally {
      setLoading(false);
    }
  }, [password, page, statusFilter, typeFilter, caseIdFilter]);

  // Load on mount and filter change
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        loadJobs();
      }, AUTO_REFRESH_MS);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, loadJobs]);

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
      if (res.ok) await loadJobs();
    } catch {
      // silent
    } finally {
      setRetrying(null);
    }
  }

  function handleCaseSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setCaseIdFilter(caseIdInput);
  }

  function handleFilterChange(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Job Queue</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={loadJobs}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
          aria-label="Filter by job status"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
        >
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Statuses" : s}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => handleFilterChange(setTypeFilter, e.target.value)}
          aria-label="Filter by job type"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
        >
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All Types" : t}
            </option>
          ))}
        </select>

        <form onSubmit={handleCaseSearch} className="flex gap-2">
          <input
            type="text"
            value={caseIdInput}
            onChange={(e) => setCaseIdInput(e.target.value)}
            placeholder="Filter by Case ID..."
            aria-label="Filter by case ID"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none w-64"
          />
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Filter
          </button>
        </form>

        <span className="text-sm text-zinc-400">{total} total</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 overflow-hidden">
        {loading && jobs.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">
            Loading jobs...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">
            No jobs found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Processing job queue with status and progress</caption>
            <thead>
              <tr className="border-b border-zinc-500 text-left text-xs text-zinc-400 uppercase tracking-wider">
                <th scope="col" className="px-4 py-3">Type</th>
                <th scope="col" className="px-4 py-3">Case</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Progress</th>
                <th scope="col" className="px-4 py-3 text-right">Items</th>
                <th scope="col" className="px-4 py-3">Retries</th>
                <th scope="col" className="px-4 py-3">Worker</th>
                <th scope="col" className="px-4 py-3">Started</th>
                <th scope="col" className="px-4 py-3">Error</th>
                <th scope="col" className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-zinc-500">
                  <td className="px-4 py-3 text-zinc-200">
                    {j.job_type}
                    {j.job_subtype ? (
                      <span className="text-zinc-400"> / {j.job_subtype}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/operator/cases/${j.case_id}`}
                      className="text-amber-500 hover:text-amber-400"
                    >
                      {j.case_id.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all"
                          style={{ width: `${Math.min(100, j.progress)}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400">
                        {j.progress}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400">
                    {j.items_produced}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {j.retry_count}/{j.max_retries}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {j.worker_id ?? ", "}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {j.started_at ? formatDate(j.started_at) : ", "}
                  </td>
                  <td className="px-4 py-3 text-red-400 max-w-[200px] truncate">
                    {j.error_message ?? ", "}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {j.status === "failed" && (
                      <button
                        onClick={() => retryJob(j.id)}
                        disabled={retrying === j.id}
                        className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
                      >
                        {retrying === j.id ? "..." : "Retry"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
