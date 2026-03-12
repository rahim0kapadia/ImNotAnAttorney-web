/**
 * @fileoverview TypeScript interfaces for the operator dashboard and customer portal.
 *
 * All types derived from the migration 009 schema (21 new tables + case modifications).
 * Used by: /api/operator/* routes, /operator/* pages, /my-case/[token] portal.
 */

// ============================================================
// CASE TYPES
// ============================================================

/** Lightweight case row for list views. */
export interface CaseListItem {
  id: string;
  email: string;
  tier: string;
  charge_type: string | null;
  status: string;
  phase: string | null;
  created_at: string;
  delivery_due_at: string | null;
  next_update_due_at: string | null;
  document_count: number;
  finding_count: number;
  witness_count: number;
  discovery_health_score: number | null;
  defense_opportunity_index: Record<string, unknown> | null;
  report_token: string | null;
}

/** Full case detail with all related data (joins). */
export interface CaseDetail extends CaseListItem {
  phase_started_at: string | null;
  report_html: string | null;
  operator_notes: string | null;
  data_retention_until: string | null;
  upgrade_order_ids: string[] | null;
  // Joined data
  order: OrderSummary | null;
  intake: IntakeSummary | null;
  documents: DocumentRow[];
  findings: FindingSummary[];
  witnesses: WitnessSummary[];
  jobs: ProcessingJobRow[];
  tasks: OperatorTaskRow[];
  timeline_count: number;
  evidence_count: number;
  evidence_custody_total: number;
  evidence_custody_verified: number;
  citations: CitationSummary[];
  motions: MotionSummary[];
}

export interface OrderSummary {
  id: string;
  stripe_payment_intent: string | null;
  amount_cents: number;
  status: string;
  paid_at: string | null;
}

export interface IntakeSummary {
  id: string;
  charge_type: string | null;
  charge_description: string | null;
  court_case_number: string | null;
  court_state: string | null;
  court_county: string | null;
  judge_name: string | null;
  attorney_name: string | null;
  next_hearing_date: string | null;
  next_hearing_type: string | null;
  total_charges: number | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  original_name: string;
  file_type: string;
  file_size_bytes: number;
  doc_type: string | null;
  doc_subtype: string | null;
  status: string;
  page_count: number | null;
  ocr_method: string | null;
  error_message: string | null;
  uploaded_at: string;
  processed_at: string | null;
}

export interface FindingSummary {
  id: string;
  finding_type: string;
  category: string;
  severity: string;
  severity_rank: number;
  title: string;
  verification_status: string;
  created_at: string;
}

export interface WitnessSummary {
  id: string;
  name: string;
  witness_type: string;
  subtype: string | null;
  agency: string | null;
  credibility_score: number | null;
  threat_level: string | null;
  dossier_status: string;
  cross_exam_ready: boolean;
}

export interface ProcessingJobRow {
  id: string;
  case_id: string;
  job_type: string;
  job_subtype: string | null;
  status: string;
  progress: number;
  priority: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  items_produced: number;
  worker_id: string | null;
  created_at: string;
}

export interface OperatorTaskRow {
  id: string;
  case_id: string;
  task_type: string;
  title: string;
  description: string | null;
  priority: string;
  priority_rank: number;
  due_at: string | null;
  sla_breach: boolean;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface CitationSummary {
  id: string;
  case_name: string;
  citation: string;
  court: string | null;
  year: number | null;
  is_binding: boolean;
  is_good_law: boolean;
}

export interface MotionSummary {
  id: string;
  motion_type: string;
  motion_name: string;
  severity: string;
  status: string;
  strategic_score: number | null;
  description: string;
}

// ============================================================
// METRICS TYPES
// ============================================================

export interface CaseMetrics {
  total_cases: number;
  cases_by_status: Record<string, number>;
  cases_by_tier: Record<string, number>;
  total_revenue_cents: number;
  active_jobs: number;
  failed_jobs: number;
  sla_breaches: number;
  avg_delivery_hours: number | null;
  open_tasks: number;
}

// ============================================================
// PORTAL TYPES (customer-facing)
// ============================================================

/** What the customer sees in their portal — tier-gated. */
export interface PortalCaseView {
  // Always visible
  status: string;
  tier: string;
  phase: string | null;
  created_at: string;
  delivery_due_at: string | null;
  // Document tracking
  documents_total: number;
  documents_processed: number;
  documents_analyzing: number;
  // Scores (X-Ray+)
  discovery_health_score: number | null;
  defense_opportunity_index: Record<string, unknown> | null;
  // Finding severity breakdown (X-Ray+)
  findings_critical: number;
  findings_major: number;
  findings_minor: number;
  findings_total: number;
  // Evidence chain (X-Ray+)
  evidence_total: number;
  evidence_chain_verified: number;
  // Timeline (X-Ray+)
  timeline_event_count: number;
  // Witnesses (War Room+)
  witness_count: number;
  // Citations (War Room+)
  citation_count: number;
  citations_verified: number;
  // Motions (War Room+)
  motion_count: number;
  // Attack intelligence (Situation Room)
  attack_finding_count: number;
  // Trial prep (Situation Room)
  trial_material_count: number;
  // Report link
  report_token: string | null;
  report_delivered: boolean;
  // Jobs progress
  jobs_total: number;
  jobs_completed: number;
}

// ============================================================
// STATUS + TRANSITION TYPES
// ============================================================

/** Valid discovery-tier case statuses. */
export type DiscoveryStatus =
  | "pending"
  | "uploaded"
  | "submitted"
  | "processing"
  | "review"
  | "delivered"
  | "refunded";

/** Allowed manual status transitions (operator can trigger). */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["uploaded"],
  uploaded: ["submitted"],
  submitted: ["processing"],
  processing: ["review", "submitted"], // back to submitted if issues found
  review: ["delivered", "processing"], // back to processing if more work needed
};
