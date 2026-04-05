"use client";
/**
 * /admin/demand — Legal Demand Intelligence Dashboard
 *
 * Sections: Quadrant Map, Demand Leaderboard, Content Gaps,
 * Emerging Topics, Content Performance, Discovered Subreddits.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header.
 */

import { useEffect, useState, useCallback } from "react";
import { AdminNav } from "@/components/AdminNav";

// ── Types ──────────────────────────────────────────────────
interface DemandScore {
  id: number;
  dimension_type: string;
  dimension_slug: string;
  dimension_label: string;
  window_label: string;
  post_count: number;
  question_count: number;
  avg_score: number;
  avg_comments: number;
  avg_urgency: number;
  high_urgency_count: number;
  trend_direction: string | null;
  trend_pct: number | null;
  demand_score: number;
  competition_score: number;
  opportunity_score: number;
  quadrant: string;
  has_blog_coverage: boolean;
  blog_post_count: number;
  content_gap_score: number;
}

interface ContentGap {
  id: number;
  charge_type_slug: string;
  pain_point_slug: string | null;
  demand_quadrant: string;
  demand_score: number;
  has_blog_post: boolean;
  gap_score: number;
  suggested_title: string | null;
  status: string;
}

interface EmergingTopic {
  id: number;
  topic_phrases: string[];
  representative_title: string | null;
  post_count: number;
  first_seen_at: string;
  last_seen_at: string;
  avg_urgency: number;
  avg_engagement: number;
  status: string;
}

interface ContentPerf {
  id: number;
  blog_slug: string;
  subscriber_signups: number;
  orders_attributed: number;
  revenue_attributed: number;
  current_demand_score: number | null;
  window_label: string;
}

interface DiscoveredSub {
  id: number;
  subreddit: string;
  display_name: string | null;
  subscribers: number;
  description: string | null;
  discovered_via_charge_type: string | null;
  relevance_score: number;
  status: string;
}

// ── Helpers ────────────────────────────────────────────────
const QUADRANT_COLORS: Record<string, string> = {
  GOLD_MINE: "bg-amber-100 text-amber-800 border-amber-300",
  RED_OCEAN: "bg-red-100 text-red-800 border-red-300",
  RISKY_BET: "bg-blue-100 text-blue-800 border-blue-300",
  DEAD_ZONE: "bg-zinc-100 text-zinc-400 border-zinc-300",
  UNKNOWN: "bg-zinc-50 text-zinc-400 border-zinc-200",
};

const QUADRANT_LABELS: Record<string, string> = {
  GOLD_MINE: "Gold Mine",
  RED_OCEAN: "Red Ocean",
  RISKY_BET: "Risky Bet",
  DEAD_ZONE: "Dead Zone",
};

function trendIcon(dir: string | null) {
  if (dir === "rising") return "\u2191";
  if (dir === "falling") return "\u2193";
  return "\u2192";
}

function trendColor(dir: string | null) {
  if (dir === "rising") return "text-green-600";
  if (dir === "falling") return "text-red-500";
  return "text-zinc-400";
}

// ── Component ──────────────────────────────────────────────
export default function DemandDashboard() {
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [scores, setScores] = useState<DemandScore[]>([]);
  const [gaps, setGaps] = useState<ContentGap[]>([]);
  const [emerging, setEmerging] = useState<EmergingTopic[]>([]);
  const [performance, setPerformance] = useState<ContentPerf[]>([]);
  const [subreddits, setSubreddits] = useState<DiscoveredSub[]>([]);

  // Filters
  const [window, setWindow] = useState("7d");
  const [dimension, setDimension] = useState("charge_type");

  // Restore session
  useEffect(() => {
    const stored = sessionStorage.getItem("admin-password");
    if (stored) {
      setPassword(stored);
      setAuthed(true);
    }
  }, []);

  const headers = useCallback(() => ({
    "x-admin-password": password,
  }), [password]);

  // ── Fetchers ─────────────────────────────────────────────
  const fetchScores = useCallback(async () => {
    const res = await fetch(`/api/admin/demand/scores?window=${window}&dimension=${dimension}`, { headers: headers() });
    if (!res.ok) throw new Error("Failed to load scores");
    const json = await res.json();
    setScores(json.scores || []);
  }, [window, dimension, headers]);

  const fetchGaps = useCallback(async () => {
    const res = await fetch("/api/admin/demand/gaps?status=identified", { headers: headers() });
    if (!res.ok) throw new Error("Failed to load gaps");
    const json = await res.json();
    setGaps(json.gaps || []);
  }, [headers]);

  const fetchEmerging = useCallback(async () => {
    const res = await fetch("/api/admin/demand/emerging?status=detected", { headers: headers() });
    if (!res.ok) throw new Error("Failed to load emerging topics");
    const json = await res.json();
    setEmerging(json.topics || []);
  }, [headers]);

  const fetchPerformance = useCallback(async () => {
    const res = await fetch("/api/admin/demand/performance?window=all-time", { headers: headers() });
    if (!res.ok) throw new Error("Failed to load performance");
    const json = await res.json();
    setPerformance(json.performance || []);
  }, [headers]);

  const fetchSubreddits = useCallback(async () => {
    const res = await fetch("/api/admin/demand/subreddits?status=candidate", { headers: headers() });
    if (!res.ok) throw new Error("Failed to load subreddits");
    const json = await res.json();
    setSubreddits(json.subreddits || []);
  }, [headers]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchScores(), fetchGaps(), fetchEmerging(), fetchPerformance(), fetchSubreddits()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [fetchScores, fetchGaps, fetchEmerging, fetchPerformance, fetchSubreddits]);

  // Refetch scores when window/dimension changes
  useEffect(() => {
    if (authed) fetchScores().catch(() => {});
  }, [authed, fetchScores]);

  // Initial load
  useEffect(() => {
    if (authed) fetchAll();
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────────
  async function approveSubreddit(id: number) {
    await fetch("/api/admin/demand/subreddits", {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id, action: "approve" }),
    });
    setSubreddits(prev => prev.filter(s => s.id !== id));
  }

  async function rejectSubreddit(id: number) {
    await fetch("/api/admin/demand/subreddits", {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id, action: "reject" }),
    });
    setSubreddits(prev => prev.filter(s => s.id !== id));
  }

  async function dismissTopic(id: number) {
    await fetch("/api/admin/demand/emerging", {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id, action: "dismiss" }),
    });
    setEmerging(prev => prev.filter(t => t.id !== id));
  }

  async function queueGap(id: number) {
    await fetch("/api/admin/demand/gaps", {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id, status: "queued" }),
    });
    setGaps(prev => prev.map(g => g.id === id ? { ...g, status: "queued" } : g));
  }

  // ── Login screen ─────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <form
          className="bg-zinc-900 p-8 rounded-lg border border-zinc-500 w-full max-w-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            // Test auth
            const res = await fetch("/api/admin/demand/scores?window=7d&dimension=charge_type", {
              headers: { "x-admin-password": passwordInput },
            });
            if (res.ok) {
              setPassword(passwordInput);
              setAuthed(true);
              sessionStorage.setItem("admin-password", passwordInput);
            } else {
              setError("Invalid password");
            }
          }}
        >
          <h1 className="text-xl font-bold text-white mb-4">Demand Intelligence</h1>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Admin password"
            className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white mb-4"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button
            type="submit"
            className="w-full p-3 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────
  // Group scores by quadrant for the map
  const quadrantGroups: Record<string, DemandScore[]> = {
    GOLD_MINE: [], RED_OCEAN: [], RISKY_BET: [], DEAD_ZONE: [],
  };
  for (const s of scores) {
    if (quadrantGroups[s.quadrant]) quadrantGroups[s.quadrant].push(s);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <AdminNav />
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Legal Demand Intelligence</h1>
          <div className="flex gap-3">
            <button
              onClick={() => fetchAll()}
              disabled={loading}
              className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm border border-zinc-700 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Quadrant Map */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Demand Quadrant Map</h2>
          <div className="grid grid-cols-2 gap-3">
            {(["GOLD_MINE", "RED_OCEAN", "RISKY_BET", "DEAD_ZONE"] as const).map(q => (
              <div key={q} className={`border rounded-lg p-4 ${QUADRANT_COLORS[q]}`}>
                <h3 className="font-bold text-sm mb-2">
                  {QUADRANT_LABELS[q]} ({quadrantGroups[q]?.length || 0})
                </h3>
                <div className="space-y-1">
                  {(quadrantGroups[q] || []).slice(0, 8).map(s => (
                    <div key={s.id} className="flex justify-between text-xs">
                      <span className="truncate mr-2">{s.dimension_label}</span>
                      <span className="font-mono whitespace-nowrap">
                        {s.demand_score.toFixed(1)} / {s.post_count}p
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Filters */}
        <div className="flex gap-3 items-center">
          <select
            value={window}
            onChange={(e) => setWindow(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
          >
            <option value="charge_type">Charge Types</option>
            <option value="pain_point">Pain Points</option>
          </select>
        </div>

        {/* Demand Leaderboard */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Demand Leaderboard</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-500 text-left text-zinc-400">
                  <th className="pb-2 pr-4">{dimension === "charge_type" ? "Charge Type" : "Pain Point"}</th>
                  <th className="pb-2 pr-4 text-right">Posts</th>
                  <th className="pb-2 pr-4 text-right">Questions</th>
                  <th className="pb-2 pr-4 text-center">Trend</th>
                  <th className="pb-2 pr-4 text-right">Demand</th>
                  <th className="pb-2 pr-4 text-right">Competition</th>
                  <th className="pb-2 pr-4">Quadrant</th>
                  <th className="pb-2 text-right">Gap</th>
                </tr>
              </thead>
              <tbody>
                {scores.map(s => (
                  <tr key={s.id} className="border-b border-zinc-500/50 hover:bg-zinc-900/50">
                    <td className="py-2 pr-4 font-medium text-white">{s.dimension_label}</td>
                    <td className="py-2 pr-4 text-right font-mono">{s.post_count}</td>
                    <td className="py-2 pr-4 text-right font-mono">{s.question_count}</td>
                    <td className={`py-2 pr-4 text-center ${trendColor(s.trend_direction)}`}>
                      {trendIcon(s.trend_direction)} {s.trend_pct != null ? `${s.trend_pct > 0 ? "+" : ""}${s.trend_pct.toFixed(0)}%` : ""}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono font-bold">{s.demand_score.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{s.competition_score.toFixed(1)}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${QUADRANT_COLORS[s.quadrant] || QUADRANT_COLORS.UNKNOWN}`}>
                        {QUADRANT_LABELS[s.quadrant] || s.quadrant}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">{s.content_gap_score.toFixed(0)}</td>
                  </tr>
                ))}
                {scores.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-zinc-400">No scores yet. Run the demand pipeline first.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Content Gaps */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Content Gaps ({gaps.length})</h2>
          <div className="space-y-2">
            {gaps.map(g => (
              <div key={g.id} className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 border border-zinc-500">
                <div>
                  <div className="font-medium text-white">{g.charge_type_slug}{g.pain_point_slug ? ` / ${g.pain_point_slug}` : ""}</div>
                  {g.suggested_title && <div className="text-sm text-zinc-400 mt-0.5">{g.suggested_title}</div>}
                  <div className="flex gap-3 mt-1 text-xs text-zinc-400">
                    <span>Demand: {g.demand_score.toFixed(1)}</span>
                    <span>Gap: {g.gap_score.toFixed(0)}</span>
                    <span className={`px-1.5 rounded ${QUADRANT_COLORS[g.demand_quadrant] || ""}`}>
                      {QUADRANT_LABELS[g.demand_quadrant] || g.demand_quadrant}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => queueGap(g.id)}
                  disabled={g.status === "queued"}
                  className="px-3 py-1.5 rounded text-sm bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40"
                >
                  {g.status === "queued" ? "Queued" : "Queue"}
                </button>
              </div>
            ))}
            {gaps.length === 0 && <p className="text-zinc-400 text-sm">No content gaps identified yet.</p>}
          </div>
        </section>

        {/* Emerging Topics */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Emerging Topics ({emerging.length})</h2>
          <div className="space-y-2">
            {emerging.map(t => (
              <div key={t.id} className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 border border-zinc-500">
                <div>
                  <div className="font-medium text-white">{t.topic_phrases.join(" + ")}</div>
                  {t.representative_title && <div className="text-sm text-zinc-400 mt-0.5 truncate max-w-lg">{t.representative_title}</div>}
                  <div className="flex gap-3 mt-1 text-xs text-zinc-400">
                    <span>{t.post_count} posts</span>
                    <span>Urgency: {t.avg_urgency.toFixed(1)}</span>
                    <span>Engagement: {t.avg_engagement.toFixed(0)}</span>
                    <span>Since: {new Date(t.first_seen_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => dismissTopic(t.id)}
                  className="px-3 py-1.5 rounded text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                >
                  Dismiss
                </button>
              </div>
            ))}
            {emerging.length === 0 && <p className="text-zinc-400 text-sm">No emerging topics detected yet.</p>}
          </div>
        </section>

        {/* Content Performance */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Content Performance (All-Time)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-500 text-left text-zinc-400">
                  <th className="pb-2 pr-4">Blog Post</th>
                  <th className="pb-2 pr-4 text-right">Subscribers</th>
                  <th className="pb-2 pr-4 text-right">Orders</th>
                  <th className="pb-2 pr-4 text-right">Revenue</th>
                  <th className="pb-2 text-right">Demand</th>
                </tr>
              </thead>
              <tbody>
                {performance.slice(0, 15).map(p => (
                  <tr key={p.id} className="border-b border-zinc-500/50 hover:bg-zinc-900/50">
                    <td className="py-2 pr-4 font-medium text-white truncate max-w-xs">{p.blog_slug}</td>
                    <td className="py-2 pr-4 text-right font-mono">{p.subscriber_signups}</td>
                    <td className="py-2 pr-4 text-right font-mono">{p.orders_attributed}</td>
                    <td className="py-2 pr-4 text-right font-mono">${p.revenue_attributed.toFixed(0)}</td>
                    <td className="py-2 text-right font-mono">{p.current_demand_score?.toFixed(1) || "-"}</td>
                  </tr>
                ))}
                {performance.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-zinc-400">No performance data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Discovered Subreddits */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Discovered Subreddits ({subreddits.length})</h2>
          <div className="space-y-2">
            {subreddits.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 border border-zinc-500">
                <div>
                  <div className="font-medium text-white">r/{s.display_name || s.subreddit}</div>
                  <div className="flex gap-3 mt-1 text-xs text-zinc-400">
                    <span>{s.subscribers.toLocaleString()} members</span>
                    <span>Via: {s.discovered_via_charge_type}</span>
                    <span>Relevance: {s.relevance_score.toFixed(0)}</span>
                  </div>
                  {s.description && <div className="text-xs text-zinc-400 mt-1 truncate max-w-lg">{s.description}</div>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveSubreddit(s.id)}
                    className="px-3 py-1.5 rounded text-sm bg-green-700 hover:bg-green-600 text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => rejectSubreddit(s.id)}
                    className="px-3 py-1.5 rounded text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {subreddits.length === 0 && <p className="text-zinc-400 text-sm">No subreddit candidates yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
