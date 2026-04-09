/**
 * @fileoverview TypeScript interfaces for the blog content generation pipeline.
 *
 * Covers the full lifecycle: content gap selection → generation → QA (humanizer,
 * slop, A1, UPL) → publish. Used by: src/lib/blog-generation/*, /api/blog-pipeline/* routes.
 */

// ============================================================
// CORE ENUMS / UNION TYPES
// ============================================================

export type BlogDraftStatus =
  | 'draft'
  | 'qa-running'
  | 'qa-passed'
  | 'qa-failed'
  | 'published'
  | 'declined';

export type QAResult = 'PASS' | 'FAIL' | 'NEEDS_WORK';

// ============================================================
// FRONTMATTER
// ============================================================

export interface BlogFrontmatter {
  title: string;
  date: string;
  lastModified: string | undefined;
  tags: string[];
  category: string;
  excerpt: string;
  author: string;
  question_count: number;
  faqs: Array<{ q: string; a: string }>;
  howToSteps: Array<{ name: string; text: string }> | undefined;
}

// ============================================================
// QA DETAIL TYPES
// ============================================================

export interface HumanizerFlag {
  detector: string;
  severity: 'tier1' | 'tier2' | 'style' | 'filler' | 'sycophancy' | 'upl';
  count: number;
  matches: string[];
  points_added: number;
}

export interface HumanizerDetails {
  composite_score: number;
  pattern_score: number;
  uniformity_score: number;
  flagged_patterns: Array<HumanizerFlag>;
}

export interface A1CheckResult {
  check: string;
  result: QAResult;
  reason: string;
}

export interface A1Details {
  checks_passed: number;
  checks_total: number;
  hard_gate_failures: string[];
  results: Array<A1CheckResult>;
}

export interface UPLCriterionResult {
  criterion: string;
  result: 'PASS' | 'FAIL';
  evidence: string;
}

export interface UPLDetails {
  criteria_passed: number;
  criteria_total: number;
  results: Array<UPLCriterionResult>;
}

export interface AntiHallucinationCheckResult {
  check: string;
  result: QAResult;
  evidence: string;
}

export interface AntiHallucinationDetails {
  checks_passed: number;
  checks_total: number;
  results: Array<AntiHallucinationCheckResult>;
}

export interface DNACheckResult {
  check: string;
  result: QAResult;
  evidence: string;
}

export interface DNADetails {
  checks_passed: number;
  checks_total: number;
  needs_work_count: number;
  results: Array<DNACheckResult>;
}

// ============================================================
// BLOG DRAFT
// ============================================================

/** Full blog draft row — mirrors the blog_drafts DB table. */
export interface BlogDraft {
  id: string;
  content_gap_id: number;
  slug: string;
  title: string;
  mdx_content: string;
  frontmatter: BlogFrontmatter;
  generation_model: string;
  generation_prompt_hash: string | null;
  humanizer_score: number | null;
  humanizer_details: HumanizerDetails | null;
  a1_result: QAResult | null;
  a1_details: A1Details | null;
  upl_result: QAResult | null;
  upl_details: UPLDetails | null;
  anti_hallucination_result: QAResult | null;
  anti_hallucination_details: AntiHallucinationDetails | null;
  dna_result: QAResult | null;
  dna_details: DNADetails | null;
  qa_attempts: number;
  qa_passed_at: string | null;
  published_at: string | null;
  version: number;
  status: BlogDraftStatus;
  created_at: string;
  updated_at: string;
}

// ============================================================
// TOPIC RESEARCH / ENRICHMENT
// ============================================================

export interface TopicEnrichment {
  topQuestions: string[];
  emotionalPatterns: string[];
  painPoints: string[];
  trendData: { demand_score: number; trend_pct: number; window: string } | null;
  relatedPosts: Array<{ slug: string; title: string }>;
}

// ============================================================
// CONTENT GAP (generation input)
// ============================================================

/** Slimmed content-gap row passed into the generation pipeline. */
export interface ContentGapForGeneration {
  id: number;
  charge_type_slug: string;
  pain_point_slug: string | null;
  demand_quadrant: string;
  demand_score: number;
  gap_score: number;
  suggested_title: string | null;
  suggested_keywords: string[] | null;
}
