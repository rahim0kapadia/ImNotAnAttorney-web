"use client";
/**
 * /my-cases — Customer portal dashboard.
 *
 * Displays the customer's orders and associated cases.
 * Redirects to login if not authenticated.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

/** Tier slug → human-readable name for display. */
const TIER_DISPLAY: Record<string, string> = {
  "dui-first-offense": "DUI Defense Playbook",
  "drug-possession": "Drug Possession Defense Playbook",
  "case-decoder": "Case Decoder",
  "war-room": "War Room",
  "full-defense-blueprint": "Full Defense Blueprint",
};

interface Order {
  id: string;
  tier: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  priority_delivery: boolean;
}

interface Case {
  id: string;
  order_id: string;
  tier: string;
  status: string;
  report_token: string | null;
  delivered_at: string | null;
  created_at: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-green-900/50 text-green-300 border-green-700",
    refunded: "bg-red-900/50 text-red-300 border-red-700",
    delivered: "bg-green-900/50 text-green-300 border-green-700",
    processing: "bg-amber-900/50 text-amber-300 border-amber-700",
    pending: "bg-zinc-800 text-zinc-300 border-zinc-600",
    intake: "bg-blue-900/50 text-blue-300 border-blue-700",
    generating: "bg-amber-900/50 text-amber-300 border-amber-700",
    review: "bg-purple-900/50 text-purple-300 border-purple-700",
  };
  const cls = colors[status] || "bg-zinc-800 text-zinc-300 border-zinc-600";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full border ${cls}`}>
      {status}
    </span>
  );
}

export default function MyCasesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/customer/cases");
        if (res.status === 401) {
          window.location.href = "/my-cases/login";
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load your cases");
        }
        const data = await res.json();
        setOrders(data.orders || []);
        setCases(data.cases || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  async function handleLogout() {
    await fetch("/api/customer/logout", { method: "POST" });
    window.location.href = "/my-cases/login";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400">Loading your cases...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-center max-w-sm">
          <p className="text-red-300 font-bold mb-2">Error</p>
          <p className="text-zinc-400 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Build a lookup: order_id → cases[]
  const casesByOrder = new Map<string, Case[]>();
  for (const c of cases) {
    const existing = casesByOrder.get(c.order_id) || [];
    existing.push(c);
    casesByOrder.set(c.order_id, existing);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-amber-400 font-bold text-lg">
            ImNotAnAttorney
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-zinc-500 text-sm hidden sm:inline">My Cases</span>
            <button
              onClick={handleLogout}
              className="text-zinc-400 text-sm hover:text-white transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">My Orders & Cases</h1>

        {orders.length === 0 ? (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
            <p className="text-zinc-400">No orders found.</p>
            <Link
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400"
            >
              Explore Our Services
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const orderCases = casesByOrder.get(order.id) || [];
              return (
                <div
                  key={order.id}
                  className="bg-zinc-900 rounded-xl border border-zinc-800 p-5"
                >
                  {/* Order header */}
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {TIER_DISPLAY[order.tier] || order.tier}
                      </h2>
                      <p className="text-zinc-500 text-sm mt-0.5">
                        {formatDate(order.paid_at || order.created_at)}
                        {order.priority_delivery && (
                          <span className="ml-2 text-amber-400 text-xs font-medium">Priority</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-bold">
                        {formatAmount(order.amount)}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>

                  {/* Associated cases */}
                  {orderCases.length > 0 && (
                    <div className="border-t border-zinc-800 pt-3 mt-3 space-y-2">
                      {orderCases.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <StatusBadge status={c.status} />
                            <span className="text-zinc-400">
                              {c.delivered_at
                                ? `Delivered ${formatDate(c.delivered_at)}`
                                : `Started ${formatDate(c.created_at)}`}
                            </span>
                          </div>
                          {c.report_token && c.status === "delivered" && (
                            <Link
                              href={`/report/${c.report_token}`}
                              className="text-amber-400 hover:text-amber-300 font-medium"
                            >
                              View Report
                            </Link>
                          )}
                          {c.report_token && c.status !== "delivered" && (
                            <Link
                              href={`/my-case/${c.report_token}`}
                              className="text-amber-400 hover:text-amber-300 font-medium"
                            >
                              Track Progress
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
