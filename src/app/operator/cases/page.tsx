"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  OperatorShell,
  useOperatorPassword,
  operatorHeaders,
} from "@/components/OperatorShell";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/format";
import type { CaseListItem } from "@/lib/types/operator";

// ============================================================
// Status badge
// ============================================================

// StatusBadge imported from @/components/StatusBadge

// ============================================================
// Constants
// ============================================================

const STATUSES = [
  "all",
  "pending",
  "uploaded",
  "submitted",
  "processing",
  "review",
  "delivered",
  "refunded",
] as const;

const TIERS = [
  "all",
  "case-decoder",
  "intelligence-brief",
  "x-ray",
  "war-room",
  "situation-room",
] as const;

const PAGE_SIZE = 25;

// ============================================================
// Page entry
// ============================================================

export default function CaseListPage() {
  return (
    <OperatorShell>
      <CaseListContent />
    </OperatorShell>
  );
}

// ============================================================
// Content
// ============================================================

function CaseListContent() {
  const password = useOperatorPassword();
  const router = useRouter();

  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (tierFilter !== "all") params.set("tier", tierFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/operator/cases?${params}`, {
        headers: operatorHeaders(password),
      });

      if (res.status === 401) {
        sessionStorage.removeItem("admin-password");
        window.location.reload();
        return;
      }

      if (res.ok) {
        const json = await res.json();
        setCases(json.cases ?? []);
        setTotal(json.total ?? 0);
      }
    } catch {
      // network error
    } finally {
      setLoading(false);
    }
  }, [password, page, statusFilter, tierFilter, search]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function handleFilterChange(
    setter: (v: string) => void,
    value: string,
  ) {
    setter(value);
    setPage(1);
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Cases</h1>
        <span className="text-sm text-zinc-400">
          {total} total
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Status dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
          aria-label="Filter by status"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Statuses" : s}
            </option>
          ))}
        </select>

        {/* Tier dropdown */}
        <select
          value={tierFilter}
          onChange={(e) => handleFilterChange(setTierFilter, e.target.value)}
          aria-label="Filter by tier"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All Tiers" : t}
            </option>
          ))}
        </select>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by email..."
            aria-label="Search cases by email"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none w-64"
          />
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-400" role="status">
            Loading cases...
          </div>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">
            No cases found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Customer cases with status, tier, and delivery details</caption>
            <thead>
              <tr className="border-b border-zinc-500 text-left text-xs text-zinc-400 uppercase tracking-wider">
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Tier</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Phase</th>
                <th scope="col" className="px-4 py-3 text-right">Docs</th>
                <th scope="col" className="px-4 py-3 text-right">Findings</th>
                <th scope="col" className="px-4 py-3 text-right">Score</th>
                <th scope="col" className="px-4 py-3">Due</th>
                <th scope="col" className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr
                  key={c.id}
                  tabIndex={0}
                  onClick={() => router.push(`/operator/cases/${c.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/operator/cases/${c.id}`); } }}
                  className="border-b border-zinc-500 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-zinc-200 font-medium max-w-[200px] truncate">
                    {c.email}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 uppercase tracking-wider">
                      {c.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {c.phase ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400">
                    {c.document_count}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400">
                    {c.finding_count}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400">
                    {c.discovery_health_score != null
                      ? `${c.discovery_health_score}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {c.delivery_due_at ? formatDate(c.delivery_due_at) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {formatDate(c.created_at)}
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
