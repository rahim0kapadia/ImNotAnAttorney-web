"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  OperatorShell,
  useOperatorPassword,
  operatorHeaders,
} from "@/components/OperatorShell";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  CaseDetail,
  DocumentRow,
  FindingSummary,
  WitnessSummary,
  ProcessingJobRow,
  OperatorTaskRow,
  CitationSummary,
  MotionSummary,
} from "@/lib/types/operator";
import { ALLOWED_TRANSITIONS } from "@/lib/types/operator";

// ============================================================
// Helpers
// ============================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================
// Badges
// ============================================================

// StatusBadge imported from @/components/StatusBadge

function SeverityBadge({ severity }: { severity: string }) {
  let cls = "bg-zinc-800 text-zinc-400 border border-zinc-700";
  if (severity === "critical")
    cls = "bg-red-500/10 text-red-400 border border-red-500/20";
  else if (severity === "major" || severity === "high")
    cls = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  else if (severity === "minor" || severity === "low")
    cls = "bg-green-500/10 text-green-400 border border-green-500/20";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {severity}
    </span>
  );
}

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
// Tab definitions
// ============================================================

const TABS = [
  "Overview",
  "Documents",
  "Findings",
  "Witnesses",
  "Jobs",
  "Tasks",
  "Timeline",
  "Legal",
] as const;

type TabName = (typeof TABS)[number];

// ============================================================
// Page entry
// ============================================================

export default function CaseDetailPage() {
  return (
    <OperatorShell>
      <CaseDetailContent />
    </OperatorShell>
  );
}

// ============================================================
// Content
// ============================================================

function CaseDetailContent() {
  const password = useOperatorPassword();
  const router = useRouter();
  const { id } = useParams();
  const caseId = typeof id === "string" ? id : id?.[0] ?? "";

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>("Overview");
  const [transitioning, setTransitioning] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadCase = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/cases/${caseId}`, {
        headers: operatorHeaders(password),
      });
      if (res.status === 401) {
        sessionStorage.removeItem("admin-password");
        window.location.reload();
        return;
      }
      if (res.status === 404) {
        setError("Case not found.");
        return;
      }
      if (!res.ok) {
        setError("Failed to load case.");
        return;
      }
      const json: CaseDetail = await res.json();
      setCaseData(json);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [password, caseId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  async function transitionStatus(newStatus: string) {
    if (!caseData) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/operator/cases/${caseData.id}/status`, {
        method: "PATCH",
        headers: operatorHeaders(password),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem("admin-password");
        window.location.reload();
        return;
      }
      if (res.ok) {
        await loadCase();
      }
    } catch {
      // silent
    } finally {
      setTransitioning(false);
    }
  }

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
      if (res.ok) await loadCase();
    } catch {
      // silent
    } finally {
      setRetrying(null);
    }
  }

  // ---- Loading / Error states ----
  if (loading && !caseData) {
    return (
      <div className="p-8">
        <p className="text-sm text-zinc-500">Loading case...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={() => router.push("/operator/cases")}
          className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
        >
          Back to Cases
        </button>
      </div>
    );
  }
  if (!caseData) return null;

  const c = caseData;
  const transitions = ALLOWED_TRANSITIONS[c.status] ?? [];

  return (
    <div className="p-8 space-y-6">
      {/* ===== Back link ===== */}
      <Link
        href="/operator/cases"
        className="text-sm text-zinc-500 hover:text-white transition-colors"
      >
        &larr; All Cases
      </Link>

      {/* ===== Header ===== */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{c.email}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 uppercase tracking-wider">
                {c.tier}
              </span>
              <StatusBadge status={c.status} />
              {c.phase && (
                <span className="text-xs text-zinc-500">
                  Phase: {c.phase}
                </span>
              )}
              <span className="text-xs text-zinc-500">
                Created {formatDate(c.created_at)}
              </span>
              {c.delivery_due_at && (
                <span className="text-xs text-zinc-500">
                  Due {formatDate(c.delivery_due_at)}
                </span>
              )}
            </div>
          </div>

          {/* Action bar: status transitions + report link */}
          <div className="flex flex-wrap items-center gap-2">
            {transitions.map((next) => (
              <button
                key={next}
                onClick={() => transitionStatus(next)}
                disabled={transitioning}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {transitioning ? "..." : `Move to ${next}`}
              </button>
            ))}
            {c.report_token && (
              <a
                href={`/report/${c.report_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
              >
                View Report
              </a>
            )}
          </div>
        </div>

        {/* Order + Intake summary row */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {c.order && (
            <>
              <div>
                <span className="text-zinc-500">Payment: </span>
                <span className="text-zinc-200">
                  {formatCurrency(c.order.amount_cents)}
                </span>
                <span className="ml-1 text-zinc-500">({c.order.status})</span>
              </div>
              {c.order.paid_at && (
                <div>
                  <span className="text-zinc-500">Paid: </span>
                  <span className="text-zinc-200">
                    {formatDate(c.order.paid_at)}
                  </span>
                </div>
              )}
            </>
          )}
          {c.intake && (
            <>
              {c.intake.charge_type && (
                <div>
                  <span className="text-zinc-500">Charge: </span>
                  <span className="text-zinc-200">{c.intake.charge_type}</span>
                </div>
              )}
              {c.intake.court_state && (
                <div>
                  <span className="text-zinc-500">Jurisdiction: </span>
                  <span className="text-zinc-200">
                    {c.intake.court_county
                      ? `${c.intake.court_county}, ${c.intake.court_state}`
                      : c.intake.court_state}
                  </span>
                </div>
              )}
              {c.intake.judge_name && (
                <div>
                  <span className="text-zinc-500">Judge: </span>
                  <span className="text-zinc-200">{c.intake.judge_name}</span>
                </div>
              )}
              {c.intake.attorney_name && (
                <div>
                  <span className="text-zinc-500">Attorney: </span>
                  <span className="text-zinc-200">
                    {c.intake.attorney_name}
                  </span>
                </div>
              )}
              {c.intake.next_hearing_date && (
                <div>
                  <span className="text-zinc-500">Next Hearing: </span>
                  <span className="text-zinc-200">
                    {formatDate(c.intake.next_hearing_date)}
                    {c.intake.next_hearing_type &&
                      ` (${c.intake.next_hearing_type})`}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {c.operator_notes && (
          <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-300">
            <span className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
              Operator Notes
            </span>
            {c.operator_notes}
          </div>
        )}
      </div>

      {/* ===== Tabs ===== */}
      <div className="border-b border-zinc-800 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              activeTab === tab
                ? "border-amber-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab}
            {tab === "Documents" && c.documents.length > 0 && (
              <span className="ml-1.5 text-xs text-zinc-500">
                ({c.documents.length})
              </span>
            )}
            {tab === "Findings" && c.findings.length > 0 && (
              <span className="ml-1.5 text-xs text-zinc-500">
                ({c.findings.length})
              </span>
            )}
            {tab === "Witnesses" && c.witnesses.length > 0 && (
              <span className="ml-1.5 text-xs text-zinc-500">
                ({c.witnesses.length})
              </span>
            )}
            {tab === "Jobs" && c.jobs.length > 0 && (
              <span className="ml-1.5 text-xs text-zinc-500">
                ({c.jobs.length})
              </span>
            )}
            {tab === "Tasks" && c.tasks.length > 0 && (
              <span className="ml-1.5 text-xs text-zinc-500">
                ({c.tasks.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ===== Tab Content ===== */}
      <div>
        {activeTab === "Overview" && <OverviewTab caseData={c} />}
        {activeTab === "Documents" && <DocumentsTab documents={c.documents} />}
        {activeTab === "Findings" && <FindingsTab findings={c.findings} />}
        {activeTab === "Witnesses" && <WitnessesTab witnesses={c.witnesses} />}
        {activeTab === "Jobs" && (
          <JobsTab jobs={c.jobs} retrying={retrying} onRetry={retryJob} />
        )}
        {activeTab === "Tasks" && <TasksTab tasks={c.tasks} />}
        {activeTab === "Timeline" && (
          <TimelineTab timelineCount={c.timeline_count} />
        )}
        {activeTab === "Legal" && (
          <LegalTab citations={c.citations} motions={c.motions} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Tab: Overview
// ============================================================

function OverviewTab({ caseData }: { caseData: CaseDetail }) {
  const c = caseData;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Discovery Health Score"
        value={c.discovery_health_score != null ? `${c.discovery_health_score}%` : "—"}
      />
      <MetricCard
        label="Documents"
        value={String(c.document_count)}
      />
      <MetricCard
        label="Findings"
        value={String(c.finding_count)}
      />
      <MetricCard
        label="Witnesses"
        value={String(c.witness_count)}
      />
      <MetricCard
        label="Evidence Items"
        value={String(c.evidence_count)}
      />
      <MetricCard
        label="Evidence Custody"
        value={
          c.evidence_custody_total > 0
            ? `${c.evidence_custody_verified}/${c.evidence_custody_total} verified`
            : "—"
        }
      />
      <MetricCard
        label="Timeline Events"
        value={String(c.timeline_count)}
      />
      <MetricCard
        label="Citations"
        value={String(c.citations.length)}
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

// ============================================================
// Tab: Documents
// ============================================================

function DocumentsTab({ documents }: { documents: DocumentRow[] }) {
  if (documents.length === 0) {
    return <p className="text-sm text-zinc-500">No documents uploaded.</p>;
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3 text-right">Size</th>
            <th className="px-4 py-3 text-right">Pages</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id} className="border-b border-zinc-800">
              <td className="px-4 py-3 text-zinc-200 max-w-[200px] truncate">
                {d.original_name}
              </td>
              <td className="px-4 py-3 text-zinc-500">{d.file_type}</td>
              <td className="px-4 py-3 text-zinc-500">
                {d.doc_type ?? "—"}
                {d.doc_subtype ? ` / ${d.doc_subtype}` : ""}
              </td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {formatBytes(d.file_size_bytes)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {d.page_count ?? "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={d.status} />
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {formatDate(d.uploaded_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Tab: Findings
// ============================================================

function FindingsTab({ findings }: { findings: FindingSummary[] }) {
  if (findings.length === 0) {
    return <p className="text-sm text-zinc-500">No findings yet.</p>;
  }

  // Group by severity
  const groups: Record<string, FindingSummary[]> = {};
  for (const f of findings) {
    if (!groups[f.severity]) groups[f.severity] = [];
    groups[f.severity].push(f);
  }
  const severityOrder = ["critical", "major", "minor", "info"];
  const orderedKeys = severityOrder.filter((s) => groups[s]);
  // Add any remaining keys not in the predefined order
  for (const key of Object.keys(groups)) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }

  return (
    <div className="space-y-6">
      {orderedKeys.map((severity) => (
        <div key={severity}>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
            {severity} ({groups[severity].length})
          </h3>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Verification</th>
                  <th className="px-4 py-3">Found</th>
                </tr>
              </thead>
              <tbody>
                {groups[severity].map((f) => (
                  <tr key={f.id} className="border-b border-zinc-800">
                    <td className="px-4 py-3 text-zinc-200">{f.title}</td>
                    <td className="px-4 py-3 text-zinc-500">
                      {f.finding_type}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{f.category}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={f.verification_status} />
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {formatDate(f.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Tab: Witnesses
// ============================================================

function WitnessesTab({ witnesses }: { witnesses: WitnessSummary[] }) {
  if (witnesses.length === 0) {
    return <p className="text-sm text-zinc-500">No witnesses profiled.</p>;
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Agency</th>
            <th className="px-4 py-3 text-right">Credibility</th>
            <th className="px-4 py-3">Threat</th>
            <th className="px-4 py-3">Dossier</th>
            <th className="px-4 py-3">Cross-Exam</th>
          </tr>
        </thead>
        <tbody>
          {witnesses.map((w) => (
            <tr key={w.id} className="border-b border-zinc-800">
              <td className="px-4 py-3 text-zinc-200 font-medium">
                {w.name}
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {w.witness_type}
                {w.subtype ? ` (${w.subtype})` : ""}
              </td>
              <td className="px-4 py-3 text-zinc-500">{w.agency ?? "—"}</td>
              <td className="px-4 py-3 text-right">
                {w.credibility_score != null ? (
                  <span
                    className={
                      w.credibility_score >= 7
                        ? "text-green-400"
                        : w.credibility_score >= 4
                          ? "text-amber-400"
                          : "text-red-400"
                    }
                  >
                    {w.credibility_score}/10
                  </span>
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {w.threat_level ? (
                  <SeverityBadge severity={w.threat_level} />
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={w.dossier_status} />
              </td>
              <td className="px-4 py-3">
                {w.cross_exam_ready ? (
                  <span className="text-green-400 text-xs font-medium">
                    Ready
                  </span>
                ) : (
                  <span className="text-zinc-500 text-xs">Not ready</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Tab: Jobs
// ============================================================

function JobsTab({
  jobs,
  retrying,
  onRetry,
}: {
  jobs: ProcessingJobRow[];
  retrying: string | null;
  onRetry: (id: string) => void;
}) {
  if (jobs.length === 0) {
    return <p className="text-sm text-zinc-500">No processing jobs.</p>;
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Progress</th>
            <th className="px-4 py-3 text-right">Items</th>
            <th className="px-4 py-3">Retries</th>
            <th className="px-4 py-3">Started</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-zinc-800">
              <td className="px-4 py-3 text-zinc-200">
                {j.job_type}
                {j.job_subtype ? ` / ${j.job_subtype}` : ""}
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
                  <span className="text-xs text-zinc-500">{j.progress}%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {j.items_produced}
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {j.retry_count}/{j.max_retries}
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {j.started_at ? formatDate(j.started_at) : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {j.status === "failed" && (
                  <button
                    onClick={() => onRetry(j.id)}
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
    </div>
  );
}

// ============================================================
// Tab: Tasks
// ============================================================

function TasksTab({ tasks }: { tasks: OperatorTaskRow[] }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-zinc-500">No operator tasks.</p>;
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Due</th>
            <th className="px-4 py-3">SLA</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b border-zinc-800">
              <td className="px-4 py-3">
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="px-4 py-3 text-zinc-200">{t.title}</td>
              <td className="px-4 py-3 text-zinc-500">{t.task_type}</td>
              <td className="px-4 py-3">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {t.due_at ? formatDate(t.due_at) : "—"}
              </td>
              <td className="px-4 py-3">
                {t.sla_breach ? (
                  <span className="text-xs font-medium text-red-400">
                    BREACH
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Tab: Timeline
// ============================================================

function TimelineTab({ timelineCount }: { timelineCount: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <p className="text-lg font-semibold text-white">
        {timelineCount} event{timelineCount !== 1 ? "s" : ""} reconstructed
      </p>
      <p className="text-sm text-zinc-500 mt-1">
        Timeline details are available in the full case report.
      </p>
    </div>
  );
}

// ============================================================
// Tab: Legal
// ============================================================

function LegalTab({
  citations,
  motions,
}: {
  citations: CitationSummary[];
  motions: MotionSummary[];
}) {
  return (
    <div className="space-y-8">
      {/* Citations */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          Citations ({citations.length})
        </h3>
        {citations.length === 0 ? (
          <p className="text-sm text-zinc-500">No citations.</p>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Citation</th>
                  <th className="px-4 py-3">Court</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Binding</th>
                  <th className="px-4 py-3">Good Law</th>
                </tr>
              </thead>
              <tbody>
                {citations.map((ct) => (
                  <tr key={ct.id} className="border-b border-zinc-800">
                    <td className="px-4 py-3 text-zinc-200">
                      {ct.case_name}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{ct.citation}</td>
                    <td className="px-4 py-3 text-zinc-500">
                      {ct.court ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {ct.year ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {ct.is_binding ? (
                        <span className="text-green-400 text-xs">Yes</span>
                      ) : (
                        <span className="text-zinc-500 text-xs">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ct.is_good_law ? (
                        <span className="text-green-400 text-xs">Yes</span>
                      ) : (
                        <span className="text-red-400 text-xs">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Motions */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          Motions ({motions.length})
        </h3>
        {motions.length === 0 ? (
          <p className="text-sm text-zinc-500">No motions.</p>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Motion</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {motions.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-800">
                    <td className="px-4 py-3 text-zinc-200 font-medium">
                      {m.motion_name}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {m.motion_type}
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={m.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">
                      {m.strategic_score ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 max-w-xs truncate">
                      {m.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
