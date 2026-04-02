/**
 * @file /my-case/[token] — Customer Case Progress Portal
 *
 * Token-based, server-rendered portal showing real-time case progress for
 * discovery tier customers ($2,497-$9,997). Customers waiting 10-28 days
 * for their reports can check status, scores, document processing, and
 * finding summaries without contacting the operator.
 *
 * User journey position:
 *   Post-purchase email (portal link) -> THIS PAGE
 *   Also linked from checkout success page for discovery tiers.
 *
 * Auth model: Same as /report/[token] — URL token validated server-side,
 *   no login required. Token is an unguessable UUID stored on the case record.
 *
 * Tier gating:
 *   - Non-discovery tiers (case-decoder, intelligence-brief, playbooks):
 *     Simple status page with link to report when delivered.
 *   - X-Ray ($2,497): Full progress dashboard with scores, documents, findings,
 *     evidence chain, and timeline.
 *   - War Room ($4,997): X-Ray data + witnesses, citations, motion recommendations.
 *   - Situation Room ($9,997): War Room data + attack intelligence, trial prep.
 *
 * Security:
 *   - Token expiration check (12-month report_token_expires_at)
 *   - Refunded case blocking (same as /report/[token])
 *   - No sensitive data exposed (descriptions, excerpts, strategy details hidden)
 *   - Only aggregate counts and scores shown to customers
 *
 * Data sources (migration 009 tables):
 *   cases, discovery_documents, case_findings, evidence_items, evidence_custody,
 *   timeline_events, case_witnesses, case_law_references, motion_recommendations,
 *   trial_materials, processing_jobs
 *
 * SEO: robots noindex/nofollow — case progress should not appear in search engines.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";
import type { Metadata } from "next";

// ============================================================
// TIER DISPLAY NAMES
// ============================================================

/** Maps tier slugs to display names for page titles and headings. */
const TIER_NAMES: Record<string, string> = {
  "dui-first-offense": "DUI Defense Playbook",
  "drug-possession": "Drug Possession Defense Playbook",
  "probation-violation": "Probation Violation Defense Playbook",
  "case-decoder": "Case Decoder",
  "intelligence-brief": "Intelligence Brief",
  "x-ray": "X-Ray",
  "war-room": "War Room",
  "situation-room": "Situation Room",
};

/** Status labels shown to customers (friendly, non-technical). */
const STATUS_LABELS: Record<string, string> = {
  "awaiting-intake": "Waiting for Your Case Details",
  intake: "Case Details Received",
  "intake-stalled": "Case Details Received",
  generating: "Generating Your Report",
  "generation-failed": "Report Generation Issue",
  review: "Under Review",
  delivered: "Delivered",
  pending: "Awaiting Discovery Upload",
  uploaded: "Documents Received",
  submitted: "Documents Submitted",
  processing: "Analysis in Progress",
  refunded: "Refunded",
};

// ============================================================
// DYNAMIC METADATA
// ============================================================

/** Generates tier-specific page title and noindex directive. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("cases")
    .select("tier")
    .eq("report_token", token)
    .single();

  const tierNames: Record<string, string> = {
    "x-ray": "X-Ray",
    "war-room": "War Room",
    "situation-room": "Situation Room",
  };
  const name = data?.tier ? tierNames[data.tier] || "Case" : "Case";
  return {
    title: `Your ${name} Progress — ImNotAnAttorney`,
    robots: { index: false, follow: false },
  };
}

// ============================================================
// HELPER COMPONENTS (server — no hooks)
// ============================================================

/**
 * Score bar — renders a numeric score with a colored progress bar.
 * Color coding: green (70+), amber (40-69), red (<40).
 * Shows "Calculating..." when score is null (analysis in progress).
 */
function ScoreBar({
  score,
  max = 100,
  label,
}: {
  score: number | null;
  max?: number;
  label: string;
}) {
  if (score === null) {
    return <p className="text-zinc-400 text-sm italic">Calculating...</p>;
  }
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  const color =
    pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-bold text-white">{score}</span>
        <span className="text-sm text-zinc-400">/ {max}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-zinc-400 mt-1">{label}</p>
    </div>
  );
}

/**
 * Progress stepper — horizontal step indicator showing case status.
 * Discovery tiers use: Submitted -> Processing -> Under Review -> Delivered
 * Non-discovery tiers use: Purchased -> Generating -> Under Review -> Delivered
 */
function ProgressStepper({
  status,
  isDiscovery,
}: {
  status: string;
  isDiscovery: boolean;
}) {
  const steps = isDiscovery
    ? [
        { key: "submitted", label: "Submitted" },
        { key: "processing", label: "Processing" },
        { key: "review", label: "Under Review" },
        { key: "delivered", label: "Delivered" },
      ]
    : [
        { key: "purchased", label: "Purchased" },
        { key: "generating", label: "Generating" },
        { key: "review", label: "Under Review" },
        { key: "delivered", label: "Delivered" },
      ];

  // Map case status to step index
  const statusToStep: Record<string, number> = isDiscovery
    ? {
        pending: -1,
        uploaded: 0,
        submitted: 0,
        processing: 1,
        review: 2,
        delivered: 3,
      }
    : {
        "awaiting-intake": -1,
        intake: 0,
        "intake-stalled": 0,
        generating: 1,
        "generation-failed": 1,
        review: 2,
        delivered: 3,
      };

  const currentIdx = statusToStep[status] ?? -1;

  return (
    <div className="flex items-center justify-between w-full">
      {steps.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        const circleColor = isCompleted
          ? "bg-green-500"
          : isCurrent
            ? "bg-amber-500"
            : "bg-zinc-700";
        const textColor = isCompleted
          ? "text-green-400"
          : isCurrent
            ? "text-amber-400"
            : "text-zinc-400";
        const lineColor = isCompleted ? "bg-green-500" : "bg-zinc-700";

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full ${circleColor} flex items-center justify-center text-xs font-bold text-white`}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs mt-1 ${textColor} whitespace-nowrap`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 ${lineColor} mt-[-16px]`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Stat card — reusable card showing a label and value.
 * Used for document counts, finding breakdowns, timeline events, etc.
 */
function StatCard({
  label,
  value,
  subtitle,
  color = "text-white",
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subtitle && (
        <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

/**
 * Section header — consistent section headings throughout the portal.
 */
function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
  );
}

/**
 * Empty state — shown when data is not yet available for a section.
 */
function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-zinc-400 text-sm italic">{message}</p>
  );
}

// ============================================================
// CENTERED MESSAGE PAGES (access control, errors)
// ============================================================

/** Reusable centered message layout matching /report/[token] style. */
function CenteredMessage({
  title,
  body,
  showContact = true,
  action,
}: {
  title: string;
  body: string;
  showContact?: boolean;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="mt-3 text-zinc-400">{body}</p>
        {action && (
          <a
            href={action.href}
            className="mt-6 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            {action.label}
          </a>
        )}
        {showContact && (
          <p className="mt-4 text-sm text-zinc-400">
            Email us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-amber-400 underline decoration-amber-400/50"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default async function MyCasePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  // ── Step 1: Fetch case by report_token ──────────────────────
  const { data: caseData } = await supabase
    .from("cases")
    .select(
      "id, email, tier, status, phase, created_at, delivery_due_at, document_count, finding_count, witness_count, discovery_health_score, defense_opportunity_index, report_token, report_token_expires_at, delivered_at"
    )
    .eq("report_token", token)
    .single();

  // ── Step 2: Access controls ─────────────────────────────────

  // Token not found
  if (!caseData) {
    return (
      <CenteredMessage
        title="Case Not Found"
        body="This link is invalid or the case does not exist. Please check your email for the correct link."
      />
    );
  }

  // Token expired
  if (
    caseData.report_token_expires_at &&
    new Date(caseData.report_token_expires_at) < new Date()
  ) {
    return (
      <CenteredMessage
        title="Link Expired"
        body="This case progress link has expired. Contact us to request a new link."
      />
    );
  }

  // Refunded
  if (caseData.status === "refunded") {
    return (
      <CenteredMessage
        title="Report No Longer Available"
        body="Your refund was processed and report access has been revoked per our refund policy. If you have questions, contact us."
      />
    );
  }

  // ── Step 3: Non-discovery tiers — simple status page ────────
  // ── Step 4b: Referral attribution lookup ───────────────────
  // Check if this purchase came through a partner referral
  let referralCode: string | null = null;
  const { data: orderData } = await supabase
    .from("orders")
    .select("id")
    .eq("email", caseData.email)
    .eq("tier", caseData.tier)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderData) {
    const { data: refWithPartner } = await supabase
      .from("referrals")
      .select("partner_id, partners(promo_code)")
      .eq("order_id", orderData.id)
      .limit(1)
      .maybeSingle();

    if (refWithPartner) {
      const partnerRaw = refWithPartner.partners as unknown;
      const partnerInfo = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw;
      if (partnerInfo && typeof partnerInfo === "object" && "promo_code" in partnerInfo) {
        const code = (partnerInfo as { promo_code: string | null }).promo_code;
        if (code) {
          referralCode = code;
        }
      }
    }
  }

  const isDiscovery = ["x-ray", "war-room", "situation-room"].includes(
    caseData.tier
  );

  if (!isDiscovery) {
    const tierName = TIER_NAMES[caseData.tier] || "Report";
    const statusLabel =
      STATUS_LABELS[caseData.status] || "In Progress";
    const isDelivered = caseData.status === "delivered";

    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold text-white mb-2">
            Your {tierName}
          </h1>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mt-6">
            <ProgressStepper status={caseData.status} isDiscovery={false} />
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mt-4">
            <p className="text-sm text-zinc-400 uppercase tracking-wider mb-1">
              Status
            </p>
            <p className="text-xl font-semibold text-white">{statusLabel}</p>
            {caseData.status === "awaiting-intake" && (
              <a
                href="/intake"
                className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                Complete Your Case Details
              </a>
            )}
            {caseData.status === "generation-failed" && (
              <p className="mt-3 text-sm text-zinc-400">
                Our team has been notified and will reach out within 24 hours.
              </p>
            )}
            {isDelivered && caseData.report_token && (
              <a
                href={`/report/${caseData.report_token}`}
                className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                View Your Report
              </a>
            )}
          </div>

          {/* What to Do Next */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mt-4">
            <h2 className="text-lg font-semibold text-white mb-3">What to Do Next</h2>
            {isDelivered ? (
              <ul className="space-y-2 text-sm text-zinc-300">
                <li>1. Review your report — read every question carefully.</li>
                <li>2. Schedule a meeting with your attorney and bring these questions.</li>
                <li>3. Take notes on their answers — write down what they say.</li>
                <li>4. If anything is unclear, email us and we will help you understand it.</li>
              </ul>
            ) : (
              <ul className="space-y-2 text-sm text-zinc-300">
                <li>1. We are researching your case right now.</li>
                <li>2. You will receive an email when your report is ready.</li>
                <li>3. While you wait, write down any questions you already have for your attorney.</li>
              </ul>
            )}
          </div>

          {/* Referral Attribution */}
          {referralCode && (
            <div className="rounded-xl border border-green-800/30 bg-green-900/10 p-4 mt-4 text-center">
              <p className="text-sm text-green-300">
                Code <span className="font-mono font-bold">{referralCode}</span> saved you 10% on your purchase.
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-zinc-400">
            Questions?{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-amber-400 underline decoration-amber-400/50"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ── Step 4: Discovery tiers — parallel data queries ─────────
  const caseId = caseData.id;

  const [
    docsResult,
    findingsResult,
    evidenceResult,
    custodyResult,
    timelineResult,
    witnessResult,
    citationResult,
    motionResult,
    trialResult,
    jobsResult,
  ] = await Promise.all([
    // Documents: total and processed
    supabase
      .from("discovery_documents")
      .select("id, status", { count: "exact" })
      .eq("case_id", caseId),
    // Findings: all with severity for breakdown
    supabase
      .from("case_findings")
      .select("id, severity, category")
      .eq("case_id", caseId),
    // Evidence items: total
    supabase
      .from("evidence_items")
      .select("id, custody_intact", { count: "exact" })
      .eq("case_id", caseId),
    // Evidence custody: verified transfers
    supabase
      .from("evidence_custody")
      .select("id, is_gap", { count: "exact" })
      .eq("case_id", caseId),
    // Timeline events: count
    supabase
      .from("timeline_events")
      .select("id", { count: "exact" })
      .eq("case_id", caseId),
    // Witnesses: count
    supabase
      .from("case_witnesses")
      .select("id", { count: "exact" })
      .eq("case_id", caseId),
    // Case law citations: total and verified
    supabase
      .from("case_law_references")
      .select("id, is_good_law", { count: "exact" })
      .eq("case_id", caseId),
    // Motion recommendations: count
    supabase
      .from("motion_recommendations")
      .select("id", { count: "exact" })
      .eq("case_id", caseId),
    // Trial materials: count (Situation Room)
    supabase
      .from("trial_materials")
      .select("id", { count: "exact" })
      .eq("case_id", caseId),
    // Processing jobs: total and completed
    supabase
      .from("processing_jobs")
      .select("id, status", { count: "exact" })
      .eq("case_id", caseId),
  ]);

  // ── Compute aggregates ──────────────────────────────────────

  const docsTotal = docsResult.count ?? 0;
  const docsProcessed =
    docsResult.data?.filter(
      (d) => d.status === "processed" || d.status === "indexed"
    ).length ?? 0;
  const docsAnalyzing =
    docsResult.data?.filter((d) => d.status === "processing").length ?? 0;

  // Finding severity breakdown
  let findingsCritical = 0;
  let findingsHigh = 0;
  let findingsMajor = 0;
  let findingsMinor = 0;
  if (findingsResult.data) {
    for (const f of findingsResult.data) {
      const sev = f.severity?.toUpperCase();
      if (sev === "CRITICAL") findingsCritical++;
      else if (sev === "HIGH") findingsHigh++;
      else if (sev === "MAJOR" || sev === "MEDIUM") findingsMajor++;
      else findingsMinor++;
    }
  }
  const findingsTotal = findingsResult.count ?? 0;

  // Evidence chain
  const evidenceTotal = evidenceResult.count ?? 0;
  const custodyTotal = custodyResult.count ?? 0;
  const custodyGaps =
    custodyResult.data?.filter((c) => c.is_gap).length ?? 0;
  const custodyVerified = custodyTotal - custodyGaps;

  // Timeline
  const timelineCount = timelineResult.count ?? 0;

  // Witnesses (War Room+)
  const witnessCount = witnessResult.count ?? 0;

  // Citations (War Room+)
  const citationCount = citationResult.count ?? 0;
  const citationsVerified =
    citationResult.data?.filter((c) => c.is_good_law).length ?? 0;

  // Motions (War Room+)
  const motionCount = motionResult.count ?? 0;

  // Attack intelligence (Situation Room) — count findings with attack-related categories
  const attackFindingCount =
    findingsResult.data?.filter((f) => {
      const cat = f.category?.toLowerCase();
      return (
        cat === "attack" ||
        cat === "attack_vector" ||
        cat === "cross_exam" ||
        cat === "impeachment"
      );
    }).length ?? 0;

  // Trial prep (Situation Room)
  const trialMaterialCount = trialResult.count ?? 0;

  // Jobs progress
  const jobsTotal = jobsResult.count ?? 0;
  const jobsCompleted =
    jobsResult.data?.filter((j) => j.status === "completed").length ?? 0;

  // ── Step 5: Tier gating ─────────────────────────────────────
  const isWarRoom = ["war-room", "situation-room"].includes(caseData.tier);
  const isSitRoom = caseData.tier === "situation-room";
  const tierName = TIER_NAMES[caseData.tier] || "Case";
  const statusLabel = STATUS_LABELS[caseData.status] || "In Progress";
  const isDelivered = caseData.status === "delivered";

  // Compute estimated completion from delivery_due_at
  const dueDate = caseData.delivery_due_at
    ? new Date(caseData.delivery_due_at)
    : null;
  const submittedDate = new Date(caseData.created_at);

  // Defense Opportunity Index — stored as JSONB, extract the overall score
  const doiValue =
    caseData.defense_opportunity_index &&
    typeof caseData.defense_opportunity_index === "object" &&
    "overall" in caseData.defense_opportunity_index
      ? (caseData.defense_opportunity_index as { overall: number }).overall
      : null;

  // ── Step 6: Render portal ───────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">
            Your {tierName} Analysis
          </h1>
          <p className="text-zinc-400 mt-1">
            Case progress updated in real time
          </p>
        </div>

        {/* Progress Stepper */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
          <ProgressStepper status={caseData.status} isDiscovery={true} />
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-zinc-400">
              Current status:{" "}
              <span className="text-white font-medium">{statusLabel}</span>
            </span>
            {caseData.phase && (
              <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded">
                Phase: {caseData.phase.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>

        {/* Key Dates */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
          <SectionHeader title="Key Dates" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider">
                Submitted
              </p>
              <p className="text-white font-medium">
                {submittedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider">
                Estimated Completion
              </p>
              <p className="text-white font-medium">
                {dueDate
                  ? dueDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Calculating..."}
              </p>
            </div>
            {isDelivered && caseData.delivered_at && (
              <div>
                <p className="text-xs text-zinc-400 uppercase tracking-wider">
                  Delivered
                </p>
                <p className="text-green-400 font-medium">
                  {new Date(caseData.delivered_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Processing Progress */}
        {jobsTotal > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
            <SectionHeader title="Processing Progress" />
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-white">
                {jobsCompleted}
              </span>
              <span className="text-sm text-zinc-400">/ {jobsTotal} tasks complete</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500"
                style={{
                  width: `${jobsTotal > 0 ? Math.round((jobsCompleted / jobsTotal) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Scores Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <SectionHeader title="Discovery Strength Rating" />
            <ScoreBar
              score={caseData.discovery_health_score}
              label="Overall health of the prosecution's discovery package"
            />
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <SectionHeader title="Prosecution Case Weakness Analysis" />
            <ScoreBar
              score={doiValue}
              label="Opportunities identified for your defense"
            />
          </div>
        </div>

        {/* Document Tracker */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
          <SectionHeader title="Document Tracker" />
          {docsTotal === 0 ? (
            <EmptyState message="No documents uploaded yet" />
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="Uploaded"
                value={docsTotal}
                color="text-white"
              />
              <StatCard
                label="Processed"
                value={docsProcessed}
                color="text-green-400"
              />
              <StatCard
                label="Analyzing"
                value={docsAnalyzing}
                color="text-amber-400"
              />
            </div>
          )}
        </div>

        {/* Finding Severity Breakdown */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
          <SectionHeader title="Findings" />
          {findingsTotal === 0 ? (
            <EmptyState message="Analysis in progress..." />
          ) : (
            <>
              <p className="text-sm text-zinc-400 mb-3">
                {findingsTotal} finding{findingsTotal !== 1 ? "s" : ""}{" "}
                identified across your discovery documents
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Critical"
                  value={findingsCritical}
                  color="text-red-500"
                />
                <StatCard
                  label="High"
                  value={findingsHigh}
                  color="text-orange-400"
                />
                <StatCard
                  label="Major"
                  value={findingsMajor}
                  color="text-amber-400"
                />
                <StatCard
                  label="Minor"
                  value={findingsMinor}
                  color="text-zinc-400"
                />
              </div>
            </>
          )}
        </div>

        {/* Evidence Chain Status */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
          <SectionHeader title="Evidence Chain Status" />
          {evidenceTotal === 0 ? (
            <EmptyState message="Evidence inventory in progress..." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Evidence Items"
                value={evidenceTotal}
                color="text-white"
              />
              <StatCard
                label="Chain Transfers Verified"
                value={custodyVerified}
                subtitle={
                  custodyGaps > 0
                    ? `${custodyGaps} gap${custodyGaps !== 1 ? "s" : ""} found`
                    : "No gaps found"
                }
                color={custodyGaps > 0 ? "text-amber-400" : "text-green-400"}
              />
              <StatCard
                label="Timeline Events"
                value={timelineCount}
                subtitle="Events reconstructed from documents"
                color="text-white"
              />
            </div>
          )}
        </div>

        {/* War Room+ sections */}
        {isWarRoom && (
          <>
            {/* Witnesses */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
              <SectionHeader title="Witnesses" />
              {witnessCount === 0 ? (
                <EmptyState message="Witness identification in progress..." />
              ) : (
                <StatCard
                  label="Witnesses Identified"
                  value={witnessCount}
                  subtitle="Dossier research underway"
                  color="text-white"
                />
              )}
            </div>

            {/* Case Law Citations */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
              <SectionHeader title="Case Law Citations" />
              {citationCount === 0 ? (
                <EmptyState message="Case law research in progress..." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatCard
                    label="Citations Found"
                    value={citationCount}
                    color="text-white"
                  />
                  <StatCard
                    label="Verified Good Law"
                    value={citationsVerified}
                    subtitle={`${citationCount - citationsVerified} pending verification`}
                    color="text-green-400"
                  />
                </div>
              )}
            </div>

            {/* Motion Recommendations */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
              <SectionHeader title="Motion Recommendations" />
              {motionCount === 0 ? (
                <EmptyState message="Motion analysis in progress..." />
              ) : (
                <StatCard
                  label="Motions Recommended"
                  value={motionCount}
                  subtitle="Strategic motions identified for your defense"
                  color="text-white"
                />
              )}
            </div>
          </>
        )}

        {/* Situation Room sections */}
        {isSitRoom && (
          <>
            {/* Attack Intelligence */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
              <SectionHeader title="Attack Intelligence" />
              {attackFindingCount === 0 ? (
                <EmptyState message="Attack analysis in progress..." />
              ) : (
                <StatCard
                  label="Attack Vectors Identified"
                  value={attackFindingCount}
                  subtitle="Cross-examination and impeachment opportunities"
                  color="text-red-400"
                />
              )}
            </div>

            {/* Trial Prep Documents */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
              <SectionHeader title="Trial Preparation" />
              {trialMaterialCount === 0 ? (
                <EmptyState message="Trial materials being prepared..." />
              ) : (
                <StatCard
                  label="Trial Materials"
                  value={trialMaterialCount}
                  subtitle="Scripts, outlines, and strategic documents"
                  color="text-white"
                />
              )}
            </div>
          </>
        )}

        {/* Report Link (all tiers, shown when delivered) */}
        {isDelivered && caseData.report_token && (
          <div className="rounded-xl border border-green-800/50 bg-green-900/10 p-6 mb-6 text-center">
            <h2 className="text-lg font-semibold text-green-400 mb-2">
              Your Report is Ready
            </h2>
            <p className="text-zinc-400 text-sm mb-4">
              Your {tierName} has been delivered.
            </p>
            <a
              href={`${SITE_URL}/report/${caseData.report_token}`}
              className="inline-block rounded-lg bg-amber-500 px-8 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              View Your Report
            </a>
          </div>
        )}

        {/* What to Do Next */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">What to Do Next</h2>
          {isDelivered ? (
            <ul className="space-y-2 text-sm text-zinc-300">
              <li>1. Review your full report — read every question and finding.</li>
              <li>2. Schedule a meeting with your attorney and bring these questions.</li>
              <li>3. Take notes on their answers — write down what they say.</li>
              <li>4. If anything is unclear, email us and we will help you understand it.</li>
            </ul>
          ) : (
            <ul className="space-y-2 text-sm text-zinc-300">
              <li>1. We are analyzing your case and documents right now.</li>
              <li>2. Check back here for real-time progress updates.</li>
              <li>3. You will receive an email when your full report is ready.</li>
              <li>4. While you wait, write down any questions you already have for your attorney.</li>
            </ul>
          )}
        </div>

        {/* Referral Attribution */}
        {referralCode && (
          <div className="rounded-xl border border-green-800/30 bg-green-900/10 p-4 mb-6 text-center">
            <p className="text-sm text-green-300">
              Code <span className="font-mono font-bold">{referralCode}</span> saved you 10% on your purchase.
            </p>
          </div>
        )}

        {/* Contact footer */}
        <p className="mt-8 text-center text-sm text-zinc-400">
          Questions about your case?{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-amber-400 underline decoration-amber-400/50"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
