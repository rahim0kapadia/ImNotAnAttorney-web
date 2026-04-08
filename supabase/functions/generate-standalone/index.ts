/**
 * @fileoverview Supabase Edge Function: Standalone research report generator.
 *
 * Generates standalone research reports (e.g., Employment Impact Assessment)
 * for criminal defendants. These are simpler, faster reports than the full
 * Case Decoder — they answer ONE specific question deeply instead of covering
 * the whole case.
 *
 * INVOCATION:
 *   Called by Next.js intake API route or operator retry route via HTTP POST
 *   (fire-and-forget). The caller returns 202 immediately; this function
 *   runs async.
 *
 * FLOW (synchronous — no batch API):
 *   1. Fetch order from Supabase (with idempotency check)
 *   2. Read standalone_intake from order record
 *   3. Build prompts based on standalone_product_slug
 *   4. Call Claude API synchronously (30-60s — Sonnet for speed)
 *   5. Generate cryptographic report token + hash it (SHA-256)
 *   6. Upload report HTML to Supabase Storage
 *   7. Update order record with token hash, storage path, expiry
 *   8. Send delivery email to customer via Resend
 *   9. On failure: update order status, email operator with retry command
 *
 * ZERO EXTERNAL IMPORTS:
 *   This function has NO npm/esm.sh imports. Why: importing
 *   @supabase/supabase-js via esm.sh adds 60-90 seconds of cold start
 *   latency, which would consume most of the 150s budget before Claude
 *   even starts generating. Instead, all Supabase operations use raw
 *   PostgREST fetch calls, email uses raw Resend API fetch, and Claude
 *   uses raw Anthropic API fetch.
 *
 * CODE DUPLICATION (intentional):
 *   The following are duplicated from Next.js modules because Deno
 *   cannot import from the Next.js codebase:
 *     - escapeHtml() — duplicated from src/lib/email.ts
 *     - sendEmail() — duplicated from src/lib/email.ts (simplified)
 *     - PHYSICAL_ADDRESS — duplicated from src/lib/site.ts
 *   This edge function is fully self-contained — no cross-runtime imports.
 *
 * MODEL CHOICE — claude-sonnet-4-6 (default):
 *   Standalone reports are narrower in scope than Case Decoders. Sonnet
 *   provides sufficient quality for single-topic research at faster speed
 *   (30-60s vs 60-294s for Opus). Configurable via CLAUDE_MODEL env var.
 *
 * ERROR STRATEGY:
 *   On Claude API failure, the function:
 *     1. Sets order status to "generation-failed" in Supabase
 *     2. Emails the operator with error details and a curl retry command
 *   This ensures failures are visible and recoverable without dashboard login.
 */

// ============================================================
// SUPABASE REST HELPERS
// Raw PostgREST fetch calls — no SDK import needed.
// These replace @supabase/supabase-js to avoid esm.sh cold start.
// ============================================================

/**
 * Builds standard Supabase PostgREST headers with the service role key.
 *
 * @param serviceKey - The SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
 * @returns Headers object for PostgREST requests.
 */
function supabaseHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Performs a SELECT query against a Supabase table via PostgREST.
 *
 * @param url - Supabase project URL (SUPABASE_URL env var).
 * @param key - Service role key for authentication.
 * @param table - Table name to query.
 * @param query - PostgREST query string (e.g., "id=eq.123&select=*").
 * @returns Array of matching rows.
 * @throws If the HTTP request fails.
 */
async function supabaseSelect(
  url: string,
  key: string,
  table: string,
  query: string
): Promise<unknown[]> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { ...supabaseHeaders(key), Prefer: "return=representation" },
  });
  if (!res.ok) throw new Error(`Supabase SELECT ${table} failed: ${res.status}`);
  return res.json();
}

/**
 * Performs a PATCH (update) against a Supabase table via PostgREST.
 * Logs errors but does not throw — update failures are non-fatal
 * (the report may already be saved; we don't want to lose it).
 *
 * @param url - Supabase project URL.
 * @param key - Service role key.
 * @param table - Table name.
 * @param query - PostgREST filter (e.g., "id=eq.123").
 * @param body - Fields to update.
 */
async function supabaseUpdate(
  url: string,
  key: string,
  table: string,
  query: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { ...supabaseHeaders(key), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Supabase UPDATE ${table} failed: ${res.status}`, err);
  }
}

// ============================================================
// HELPERS (duplicated from Next.js modules — see file header for why)
// ============================================================

/**
 * Escapes HTML special characters to prevent XSS.
 * Duplicated from src/lib/email.ts because Deno cannot import Next.js modules.
 *
 * @param str - Raw string to escape.
 * @returns HTML-safe string.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Hashes a plaintext token using SHA-256 via Web Crypto API.
 * Returns the hex-encoded hash string for storage in the DB.
 *
 * @param token - Plaintext token to hash.
 * @returns Hex-encoded SHA-256 hash.
 */
async function hashTokenDeno(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * CAN-SPAM physical address. Duplicated from src/lib/site.ts.
 * If this changes, update src/lib/site.ts and src/lib/email.ts as well.
 */
const PHYSICAL_ADDRESS = "195 Dr MLK Jr St N, St Petersburg, FL 33701";

/**
 * Sends an email via the Resend API.
 *
 * Simplified version of the sendEmail in src/lib/email.ts — no unsubscribe
 * headers because this sends transactional emails (report delivery + operator
 * notifications). Includes the branded dark-theme wrapper and CAN-SPAM footer.
 *
 * @param params - Email parameters including Resend credentials.
 * @returns Success/failure result. Never throws.
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  resendKey: string;
  fromEmail: string;
  operatorEmail: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.fromEmail,
        to: [params.to],
        subject: params.subject,
        reply_to: params.operatorEmail,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0C0A09; color: #D4D4D8; padding: 32px;">
            ${params.html}
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #27272A; font-size: 12px; color: #71717A; text-align: center;">
              <p style="margin: 0 0 8px;">ImNotAnAttorney</p>
              <p style="margin: 0;">Legal information and research services — not legal advice.</p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #52525B;">${PHYSICAL_ADDRESS}</p>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Failed to send email");
    }

    const data = await response.json();
    return { success: true, id: data.id };
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

// ============================================================
// PRODUCT METADATA
// Maps standalone_product_slug to display names and prompt builders.
// ============================================================

/** Product metadata keyed by slug — name + price for system prompt. */
const PRODUCT_META: Record<string, { name: string; price: string }> = {
  "employment-impact": { name: "Employment Impact Assessment", price: "$197" },
  "collateral-consequences": { name: "Collateral Consequences Research", price: "$147" },
  "license-risk": { name: "Professional License Risk Research", price: "$297" },
  "immigration-impact": { name: "Immigration Impact Research", price: "$297" },
  "security-clearance": { name: "Security Clearance Impact Analysis", price: "$147" },
  "custody-impact": { name: "Custody Impact During Prosecution", price: "$197" },
  "judge-profile": { name: "Judge Profile", price: "$497" },
  "motion-opportunity-scan": { name: "Motion Opportunity Scan", price: "$497" },
  // ─── Wave 1 — DUI/pre-trial $97 research ───────────────────
  "breathalyzer-challenge": { name: "Breathalyzer Calibration Challenges", price: "$97" },
  "fst-review": { name: "Field Sobriety Test Accuracy Review", price: "$97" },
  "plea-consequences": { name: "Plea Deal Hidden Consequences", price: "$97" },
  "drug-test-reliability": { name: "Drug Test Reliability Research", price: "$97" },
  "bail-hearing-prep": { name: "Bail Hearing Preparation", price: "$97" },
  "sentencing-prep": { name: "Sentencing Hearing Preparation", price: "$97" },
  "family-case-research": { name: "Family Member Case Research", price: "$97" },
  "arrest-report-review": { name: "Arrest Report Review", price: "$97" },
  // ─── Wave 3 — Post-conviction research (HIGH UPL) ──────────
  "expungement-research": { name: "Expungement Eligibility Research", price: "$97" },
  "sentence-reduction": { name: "Sentence Reduction Petition Research", price: "$147" },
  "appeal-viability": { name: "Appeal Viability Assessment", price: "$297" },
  "ineffective-counsel": { name: "Ineffective Counsel Documentation", price: "$297" },
  // ─── Wave 4 — Net-new from Reddit research ─────────────────
  "attorney-performance-review": { name: "Attorney Performance Review", price: "$97" },
  "probation-violation-response": { name: "Probation Violation Response", price: "$97" },
  "discovery-decoder": { name: "Discovery Decoder", price: "$147" },
  "constructive-possession": { name: "Constructive Possession Analysis", price: "$97" },
  "self-surrender-prep": { name: "Self-Surrender Preparation", price: "$97" },
  "probation-rights": { name: "Probation Rights Research", price: "$97" },
  // ─── Court Case Port — Wave 2+3 (ship dark via products.ts isActive=false) ─
  "trial-prep-package": { name: "Trial Prep Package", price: "$1,997" },
  "case-law-intelligence": { name: "Case Law Intelligence Pack", price: "$297" },
  "expert-witness-challenge": { name: "Expert Witness Challenge Report", price: "$297" },
  "discovery-demand-letter": { name: "Discovery Demand Letter", price: "$97" },
};

// ============================================================
// CLAUDE API — PROMPTS
// ============================================================

/**
 * System prompt for standalone report generation.
 * UPL-safe, anti-hallucination rules, HTML output format.
 */
function buildSystemPrompt(productName: string, priceDisplay: string): string {
  return `You are generating a ${productName} for a criminal defendant. This is a PAID PRODUCT (${priceDisplay}) that must deliver standalone value.

CRITICAL UPL RULES:
- You provide legal INFORMATION, not legal ADVICE
- Never say "you should", "we recommend", "we advise", "your best option"
- Use: "one consideration is", "questions worth exploring", "factors that may apply"
- Frame everything as information to discuss WITH their attorney

ANTI-HALLUCINATION RULES:
- Only cite laws, statutes, and regulations that exist
- If unsure about a specific state statute, say "state law varies — verify current provisions with your attorney"
- Do not fabricate employer policies, licensing board rules, or agency regulations
- Every factual claim must be traceable to a statute, regulation, or documented pattern
- Never invent case names or case citations

OUTPUT FORMAT: Return clean HTML. Use semantic tags (h2, h3, p, ul, li, strong, table, tr, td, th). No markdown. No code fences. No preamble text before the HTML.

Include this disclaimer at the top of the report:
"This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions."`;
}

/**
 * Intake data shape for the employment-impact product.
 * Stored in orders.standalone_intake as JSONB.
 */
interface EmploymentImpactIntake {
  state: string;
  chargeType: string;
  occupation: string;
  employerType: string;
  industryRegulated: boolean;
  hasClearance: boolean;
}

interface CollateralConsequencesIntake {
  state: string;
  chargeType: string;
  offenseClass: string;
  occupation: string;
  hasLicense: boolean;
  hasSecurityClearance: boolean;
  immigrationStatus: string;
  hasChildren: boolean;
}

interface LicenseRiskIntake {
  state: string;
  chargeType: string;
  licenseType: string;
  licensingBoard: string;
  priorDiscipline: boolean;
  boardNotified: boolean;
  chargeInvolves: string;
}

interface ImmigrationImpactIntake {
  state: string;
  chargeType: string;
  immigrationStatus: string;
  yearsInUS: string;
  priorImmigrationViolations: boolean;
  pendingPetition: boolean;
}

interface SecurityClearanceIntake {
  state: string;
  chargeType: string;
  clearanceLevel: string;
  agency: string;
  lastInvestigation: string;
  selfReported: string;
  chargeInvolves: string;
}

interface CustodyImpactIntake {
  state: string;
  chargeType: string;
  custodyStatus: string;
  pendingFamilyCase: boolean;
  childrenAges: string;
  otherParentAwareness: string;
  chargeInvolves: string;
}

/**
 * Intake data shape for the judge-profile product ($497).
 *
 * NOTE on data limitations: structured judge intelligence (magic words,
 * forbidden words, ruling patterns, grant rates) lives in the
 * `judge_profiles` table populated by the `judge-research` +
 * `judge-intelligence` workers in ImNotAnAttorney-engine. Those workers
 * are NOT yet ported to INAA at the time of Step 6 (Wave 1, court case
 * port). Until they ship, this Edge Function generates the report from
 * Claude's training-data knowledge of the judge plus general criminal
 * defense research patterns. The prompt explicitly tells Claude to mark
 * any field it cannot verify as "limited public information available"
 * — never fabricate data. The product ships with isActive=false in
 * products.ts. Operator review gates flipping to true.
 */
interface JudgeProfileIntake {
  judgeName: string;
  state: string;
  county: string;
  caseNumber: string;
  chargeType: string;
}

/**
 * Intake data shape for the motion-opportunity-scan product ($497).
 *
 * NOTE on data limitations: the `strategic_motion_library`,
 * `prosecution_arguments`, and `trap_escapes` tables that the Tier 1
 * port will eventually populate are NOT yet ported. Until they ship,
 * this Edge Function relies on Claude's training-data knowledge of
 * motion practice patterns by charge type and jurisdiction. The prompt
 * scopes output to common, well-established motion types and tells
 * Claude to be honest about jurisdictional limitations. The product
 * ships with isActive=false in products.ts. Operator review gates
 * flipping to true.
 */
interface MotionOpportunityScanIntake {
  chargeType: string;
  state: string;
  county: string;
  caseStage: string;
  judgeName: string;
  knownFacts: string;
}

// ─── Wave 1 — DUI/pre-trial $97 research ───────────────────

interface BreathalyzerChallengeIntake {
  state: string;
  chargeType: string;
  bacReading: string;
  breathalyzerType: string;
  timeBetweenStopAndTest: string;
  choiceOfTest: string;
  medicalConditions: string;
}

interface FstReviewIntake {
  state: string;
  chargeType: string;
  testsAdministered: string;
  surfaceConditions: string;
  weather: string;
  footwear: string;
  physicalConditions: string;
  officerDemonstrated: string;
}

interface PleaConsequencesIntake {
  state: string;
  chargeType: string;
  pleaOfferCharge: string;
  pleaOfferTerms: string;
  occupation: string;
  immigrationStatus: string;
  hasLicense: string;
}

interface DrugTestReliabilityIntake {
  state: string;
  chargeType: string;
  testType: string;
  substanceIdentified: string;
  confirmatoryTest: string;
  resultsDocs: string;
}

interface BailHearingPrepIntake {
  state: string;
  chargeType: string;
  priorConvictions: string;
  communityTies: string;
  flightRiskFactors: string;
  currentBailAmount: string;
}

interface SentencingPrepIntake {
  state: string;
  chargeType: string;
  convictionMethod: string;
  sentencingRange: string;
  priorConvictions: string;
  mitigatingFactors: string;
}

interface FamilyCaseResearchIntake {
  state: string;
  chargeType: string;
  relationshipToDefendant: string;
  defendantInCustody: string;
  defendantHasAttorney: string;
  caseStage: string;
}

interface ArrestReportReviewIntake {
  state: string;
  chargeType: string;
  reportDetails: string;
}

// ─── Wave 3 — Post-conviction research (HIGH UPL) ──────────

interface ExpungementResearchIntake {
  state: string;
  chargeType: string;
  convictionOrDismissal: string;
  convictionDate: string;
  sentenceCompleted: string;
  priorConvictions: string;
  probationCompleted: string;
}

interface SentenceReductionIntake {
  state: string;
  chargeType: string;
  sentenceImposed: string;
  sentencingDate: string;
  basisForReduction: string;
}

interface AppealViabilityIntake {
  state: string;
  chargeType: string;
  convictionMethod: string;
  appealGrounds: string;
  appealDeadlineStatus: string;
  trialIssues: string;
}

interface IneffectiveCounselIntake {
  state: string;
  chargeType: string;
  issuesIdentified: string;
  caseOutcome: string;
}

// ─── Wave 4 — Net-new from Reddit research ─────────────────

interface AttorneyPerformanceReviewIntake {
  state: string;
  chargeType: string;
  caseStage: string;
  issuesIdentified: string;
  communicationFrequency: string;
}

interface ProbationViolationResponseIntake {
  state: string;
  chargeType: string;
  violationType: string;
  priorViolations: string;
  probationConditions: string;
}

interface DiscoveryDecoderIntake {
  state: string;
  chargeType: string;
  discoveryReceived: string;
  discoveryContents: string;
}

interface ConstructivePossessionIntake {
  state: string;
  chargeType: string;
  locationDescription: string;
  proximityToContraband: string;
  ownershipOfLocation: string;
}

interface SelfSurrenderPrepIntake {
  state: string;
  chargeType: string;
  surrenderDate: string;
  surrenderLocation: string;
  hasAttorney: string;
}

interface ProbationRightsIntake {
  state: string;
  chargeType: string;
  probationConditions: string;
  probationOfficerIssue: string;
}

// ─── Court Case Port — Wave 2+3 (ship dark) ────────────────

/**
 * Intake data shape for the trial-prep-package product ($1,997).
 *
 * NOTE on data limitations: the Tier 2 cross-exam library port (attack
 * patterns, voir dire library, legal weapons, trial themes, trial
 * narrative skeleton) lives in tables that have NOT yet been fully
 * ported to INAA. Until the Wave 2 Tier 2 plan executes, this Edge
 * Function generates the trial prep package from Claude's training-data
 * knowledge of trial practice patterns plus general criminal defense
 * methodology. The prompt explicitly tells Claude to ground every
 * recommendation in well-established trial practice — no fabricated
 * voir dire questions, no fabricated case-specific theme content. The
 * product ships with isActive=false in products.ts. Operator review
 * gates flipping to true.
 */
interface TrialPrepPackageIntake {
  chargeType: string;
  state: string;
  county: string;
  trialDate: string;
  caseTheme: string;
  knownFacts: string;
}

/**
 * Intake data shape for the case-law-intelligence product ($297).
 *
 * NOTE on data limitations: the Tier 6 case law enrichment port
 * (case_law_urls multi-source ranking, case_law_applicability per-motion
 * scoring, defense_favorable classification, fetched_holding similarity)
 * lives in workers + tables that have NOT yet been ported to INAA.
 * Until those workers ship, this Edge Function relies on Claude's
 * training-data knowledge of case law plus general criminal defense
 * research patterns. The prompt is explicit: never fabricate case
 * names or citations, frame every cited case as "your attorney can
 * verify on CourtListener." The product ships with isActive=false in
 * products.ts. Operator review + UPL audit gates flipping to true.
 */
interface CaseLawIntelligenceIntake {
  chargeType: string;
  state: string;
  county: string;
  caseStage: string;
  motionFocus: string;
  knownFacts: string;
}

/**
 * Intake data shape for the expert-witness-challenge product ($297).
 *
 * NOTE on data limitations: the Tier 7 witness research pipeline port
 * (Gemini deep research with grounding, witness_source_urls ledger,
 * witness_research_results extractions) is NOT yet ported to INAA's
 * standalone product flow. Until it ships, this Edge Function relies on
 * Claude's training-data knowledge of Daubert factors and the named
 * expert's discipline. The prompt is explicit: do not fabricate the
 * expert's prior testimony, prior cases, or specific qualifications.
 * If training data is thin on the expert, say so explicitly. The
 * product ships with isActive=false in products.ts. Operator review
 * gates flipping to true.
 */
interface ExpertWitnessChallengeIntake {
  expertName: string;
  state: string;
  chargeType: string;
  expertField: string;
  knownFacts: string;
}

/**
 * Intake data shape for the discovery-demand-letter product ($97).
 *
 * NOTE on data limitations: the Tier 8B discovery demands library
 * (414 charge-type-specific demand items from the Court Case port) is
 * NOT yet ported to INAA. Until that library ships, this Edge Function
 * generates the demand letter from Claude's training-data knowledge of
 * standard discovery practice plus the well-established items
 * prosecutors regularly hold back. The prompt is explicit: ground every
 * demanded item in standard criminal procedure (Brady, Giglio, Rule 16,
 * state discovery rules), never invent rule numbers, and frame the
 * letter as "your attorney can review and file" — never as legal advice.
 * The product ships with isActive=false in products.ts. Operator
 * review + UPL audit gate flipping to true.
 */
interface DiscoveryDemandLetterIntake {
  chargeType: string;
  state: string;
  county: string;
  arrestDate: string;
  discoveryReceivedSoFar: string;
}

/**
 * Builds the user prompt for a given standalone product slug.
 * Returns null for unknown slugs — the caller handles the error.
 *
 * @param slug - The standalone_product_slug from the order.
 * @param intake - The standalone_intake JSONB data.
 * @returns User prompt string, or null if slug is unsupported.
 */
function buildUserPrompt(slug: string, intake: Record<string, unknown>): string | null {
  switch (slug) {
    case "employment-impact": {
      const data = intake as unknown as EmploymentImpactIntake;
      return `Generate an Employment Impact Assessment for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Occupation: """${data.occupation}"""
- Employer Type: ${data.employerType}
- Industry Regulated: ${data.industryRegulated ? "Yes" : "No"}
- Security Clearance: ${data.hasClearance ? "Yes" : "No"}

Produce a comprehensive HTML report covering:
1. Executive Summary with risk level (CRITICAL / SIGNIFICANT / MODERATE / LOW) — under 200 words
2. Background Check Impact (FCRA, state-specific, timing, Ban-the-Box laws)
3. Employer Type Analysis (specific to the defendant's employer type)
4. Industry-Specific Consequences (for the defendant's occupation)
5. Financial Impact Estimate (income loss scenarios)
6. Protective Strategies (framed as questions to explore with attorney — NOT advice)
7. 10 Questions for Your Defense Attorney (charge-type and occupation-specific)`;
    }

    case "collateral-consequences": {
      const data = intake as unknown as CollateralConsequencesIntake;
      return `Generate a Collateral Consequences Research report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Occupation: """${data.occupation}"""
- Licensed Professional: ${data.hasLicense ? "Yes" : "No"}
- Security Clearance: ${data.hasSecurityClearance ? "Yes" : "No"}
- Immigration Status: ${data.immigrationStatus}
- Has Children: ${data.hasChildren ? "Yes" : "No"}

Produce a comprehensive HTML report covering:
1. Consequences Summary — total number of identified consequences for this charge type in this state, categorized by severity (CRITICAL / SIGNIFICANT / MODERATE)
2. Employment Impact — background check impact, industry restrictions, licensing implications (summary level — note that deeper analysis is available)
3. Housing — public housing disqualification rules, private landlord screening, Section 8 eligibility for this charge type
4. Civil Rights — voting rights (state-specific restoration rules), jury service, gun rights (state + federal), running for office
5. Government Benefits — SNAP/TANF restrictions (drug conviction specific), Social Security, VA benefits, Medicaid implications
6. Education — FAFSA eligibility impacts, campus housing, professional school admissions
7. Immigration — if non-citizen, CIMT classification and deportation risk summary (note deeper analysis available)
8. Custody & Family — if has children, how this charge type affects custody proceedings (note deeper analysis available)

Each section must include state-specific information and "questions to explore with your attorney." Frame everything as INFORMATION, not advice.`;
    }

    case "license-risk": {
      const data = intake as unknown as LicenseRiskIntake;
      return `Generate a Professional License Risk Research report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- License Type: ${data.licenseType}
- Licensing Board: """${data.licensingBoard || "Not specified"}"""
- Prior Disciplinary Action: ${data.priorDiscipline ? "Yes" : "No"}

Produce a comprehensive HTML report covering:
1. Risk Level — CRITICAL / HIGH / MODERATE / LOW for this specific license type + charge combination in this state
2. Board Reporting Requirements — does this state require self-reporting of arrests/charges/convictions for this license type? Reporting deadline. Consequences of NOT reporting. Include statute/regulation citation if known.
3. Board Action Triggers — which charges trigger automatic review, hearing, suspension, or revocation for this license type. Distinction between arrest, charge, conviction, and plea.
4. Historical Board Outcomes — typical outcomes for similar charge types: reprimand, probation, suspension, revocation. Mitigating factors boards consider.
5. Dual-Track Timeline — criminal case timeline vs. licensing board timeline running in PARALLEL. Board may act before criminal case resolves. Evidence standard differences.
6. License-Preserving Defense Strategies — framed as QUESTIONS to explore: plea options that avoid mandatory board action, coordinating criminal and licensing defense, mitigating evidence for the board
7. Profession-Specific Considerations — continuing education during suspension, reinstatement procedures, practice restrictions during investigation, malpractice insurance implications
8. 10 Questions for Your Attorneys — split between criminal defense attorney (5) and licensing board attorney (5)

If prior disciplinary action exists, emphasize how it compounds the risk. Frame everything as INFORMATION, not advice.`;
    }

    case "custody-impact": {
      const data = intake as unknown as CustodyImpactIntake;
      return `Generate a Custody Impact During Prosecution report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Current Custody Arrangement: ${data.custodyStatus}
- Pending Family Court Case: ${data.pendingFamilyCase ? "Yes" : "No"}
- Children Ages: """${data.childrenAges}"""
- Other Parent Aware of Charges: ${data.otherParentAwareness}

Produce a comprehensive HTML report covering:
1. Impact Assessment — CRITICAL / HIGH / MODERATE / LOW for custody implications based on this charge type and custody arrangement
2. How Criminal Courts and Family Courts Interact — these are SEPARATE courts with different standards and timelines. Criminal charges do not automatically affect custody. "Best interest of the child" standard explained. Burden of proof differences.
3. Charge-Specific Custody Impact — how this specific charge type affects custody: DV charges trigger mandatory considerations in most states, substance charges may trigger drug testing and supervised visitation, child-related charges may trigger emergency custody modifications
4. Protective Order Implications — if applicable to the charge type: how protective orders affect custody/visitation, modification procedures, violation consequences
5. What the Other Parent Can Do — emergency custody motions, temporary restraining orders, modification petitions, and what courts consider when evaluating these
6. Dual-Track Strategy Questions — questions for the criminal defense attorney about custody implications AND questions for a family law attorney about protecting custody during criminal proceedings
7. Immediate Considerations — framed as "factors to discuss with your attorney": documentation of parental involvement, character references, compliance with all court orders, treatment enrollment if applicable

This is a HIGH UPL-risk product. Be EXTREMELY careful: use "family courts typically consider" not "you will lose custody." No recommendations about what to do in family court. Frame everything as INFORMATION for discussion with their attorneys (both criminal defense and family law).`;
    }

    case "judge-profile": {
      const data = intake as unknown as JudgeProfileIntake;
      return `Generate a Judge Profile report for:
- Judge Name: """${data.judgeName}"""
- State: ${data.state}
- County: """${data.county}"""
- Case Number: """${data.caseNumber || "Not provided"}"""
- Charge Type: ${data.chargeType}

DATA AVAILABILITY RULES (NON-NEGOTIABLE):
- This judge may or may not have substantial public records. Most state-level judges have LIMITED documented history.
- If you have NO reliable training-data information about this specific judge, say so explicitly in the Executive Summary: "Public information about this judge is limited. The general patterns below describe how judges with similar profiles typically rule in this jurisdiction — not this specific judge's documented history."
- NEVER fabricate magic words, forbidden words, ruling rates, or persuasion preferences for a judge you do not have documented information about.
- If you DO have documented information about the judge (federal judges, judges with notable published opinions, judges named in major news coverage), you may cite specific patterns — but ground every claim in what you actually know, not what would be plausible.
- Grant rates are ESTIMATES, not statistics. Frame as "based on available published opinions, this judge appears to rule X way in Y type of case" never "X% grant rate."
- Use phrases like "patterns observed in this judge's published opinions" or "general tendencies for judges in this jurisdiction" — never "this judge always" or "this judge will."

Produce a comprehensive HTML report covering:
1. Executive Summary — what we found vs. what's limited. Be honest about data depth. Under 200 words.
2. Background — appointment history, education, prior career (only if documented). State "limited public information" if unknown.
3. Judicial Philosophy — observed approach to criminal cases. Conservative/liberal lean if discernible from rulings. Textualist vs. purposivist tendencies. State "limited information available" if undocumented.
4. Ruling Style — bench rulings vs. written orders. Speed of decisions. Thoroughness. Patience with arguments. Only if documented.
5. Patterns in Suppression Motions — what kinds of arguments have historically moved this judge or judges with similar profiles. Frame as "factors the defense bar in this jurisdiction has reported as effective" — not "magic words this judge responds to."
6. Things to Avoid — procedural irritants and behaviors that have provoked unfavorable responses, IF documented. Otherwise: "Limited public information about specific irritants."
7. Persuasion Considerations — what type of legal reasoning tends to land with this judge or jurisdictional peers (precedent-heavy vs. policy-heavy, brief vs. extended argument). Frame as patterns to discuss with attorney, not commands.
8. Your Charge Type in This Court — typical sentencing ranges and dispositions for the charge type in this county/state. State "ranges vary" — never give exact numbers.
9. 10 Questions to Bring to Your Attorney — judge-specific and charge-specific. Things only your attorney can answer about local practice.
10. What This Profile Cannot Tell You — explicit limitations section. What your attorney knows that public records don't. Why personal observation by counsel still matters most.

Frame everything as INFORMATION to bring to your attorney's attention — never as advice about what to file or argue. Use "you might explore", "factors to consider", "questions worth asking" — never "we recommend" or "you should".`;
    }

    case "motion-opportunity-scan": {
      const data = intake as unknown as MotionOpportunityScanIntake;
      return `Generate a Motion Opportunity Scan report for:
- Charge Type: ${data.chargeType}
- State: ${data.state}
- County: """${data.county}"""
- Case Stage: ${data.caseStage}
- Judge Name: """${data.judgeName || "Not provided"}"""
- Known Facts: """${data.knownFacts}"""

DATA AVAILABILITY RULES (NON-NEGOTIABLE):
- Output 10-20 motion opportunities ONLY from the universe of well-established criminal defense motions for this charge type and case stage. No fabricated motion types.
- Filter by case stage: pre-arraignment motions are different from post-discovery motions. Do not list a motion that does not apply to the customer's current stage.
- The customer's "known facts" may be incomplete. Treat them as one input — never the only input. If facts suggest a motion type, note it. If facts are too thin to support a recommendation, omit the motion rather than guess.
- For each motion, the grant/deny/partial reasoning is general (how this motion type typically plays out) not specific to this case. Frame as "in cases like this, courts often" — never "your judge will."
- Never fabricate case citations. If you reference a doctrine (Fourth Amendment, Brady, Daubert, etc.), describe the doctrine, not specific cases.

Produce a comprehensive HTML report covering:
1. Executive Summary — how many motion opportunities were identified, the most promising 3 by relevance to the known facts, and the case-stage filter applied. Under 200 words.
2. Motion Opportunity Inventory — table or structured list of 10-20 motions. For each motion, include:
   - Motion name (the standard name used by criminal defense attorneys)
   - One-line explanation of what the motion does
   - Why it may apply (tied to charge type, case stage, or known facts)
   - "If granted" — what changes for the case
   - "If denied" — how denial can still be useful (preserved record, locked-in state position, cross-exam ammunition)
   - "If partially granted" — common partial outcomes
   - Procedural considerations (filing deadline, supporting evidence typically needed)
3. Motions Specific to Your Case Stage — explicit subsection breaking out which of the listed motions are timely for the customer's current stage.
4. Motions That Are NOT Yet Ripe — motions the customer should be aware of but cannot file yet (post-discovery suppression motions when discovery hasn't been received, etc.). This shows the customer the trajectory of the case.
5. The "Why Denial Still Matters" Concept — one short section explaining how denied motions preserve issues for appeal and lock the prosecution into positions they have to defend. This is the single most valuable concept for a layperson to understand.
6. Questions to Bring to Your Attorney — 10 motion-specific questions tied to the inventory above. Things like "Is a motion to challenge the [evidence type] viable in our county based on what we know about the [aspect]?" — not "should we file motion X."
7. What This Scan Cannot Tell You — explicit limitations: this scan does not analyze your discovery, does not interview witnesses, and cannot replace an attorney's case-specific judgment. The scan identifies opportunities; your attorney evaluates which to pursue.

Frame everything as INFORMATION to bring to your attorney's attention. Use "you might explore", "factors worth discussing", "motions that may apply" — never "we recommend", "you should file", or "your best option is".`;
    }

    // ─── Wave 1 — DUI/pre-trial $97 research ─────────────────

    case "breathalyzer-challenge": {
      const data = intake as unknown as BreathalyzerChallengeIntake;
      return `Generate a Breathalyzer Calibration Challenges report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- BAC Reading: """${data.bacReading}"""
- Breathalyzer Type: ${data.breathalyzerType}
- Time Between Stop and Test: """${data.timeBetweenStopAndTest}"""
- Offered Choice of Test: ${data.choiceOfTest}
- Medical Conditions: """${data.medicalConditions || "None reported"}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Challenge Viability — rate overall viability as STRONG / MODERATE / WEAK based on the combination of BAC reading, machine type, time gap, and medical factors. Explain the rating in plain English.
2. Calibration Requirements — state-mandated calibration schedule for this breathalyzer type, operator certification requirements, and the governing statute or regulation (cite only if you are confident it exists; otherwise note "verify current statute with your attorney").
3. Common Challenge Grounds — analyze each that may apply: mouth alcohol contamination, rising BAC defense (time between stop and test), operator error patterns for this machine type, known machine error rates and recall history.
4. Medical Factor Analysis — if medical conditions were reported, explain how each condition can affect breathalyzer readings (GERD, diabetes, dental work, etc.). If none reported, note common conditions defendants may not realize are relevant.
5. Discovery Requests — specific documents the defendant's attorney may want to request: calibration logs, maintenance records, operator certification, solution lot numbers, device error logs.
6. Questions for Your Attorney — 10 charge-type and machine-specific questions to bring to the defense attorney.

Frame everything as INFORMATION for discussion with their attorney. Use "factors to consider", "questions worth exploring" — never "you should", "we recommend".`;
    }

    case "fst-review": {
      const data = intake as unknown as FstReviewIntake;
      return `Generate a Field Sobriety Test Accuracy Review for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Tests Administered: """${data.testsAdministered}"""
- Surface Conditions: """${data.surfaceConditions}"""
- Weather Conditions: """${data.weather}"""
- Footwear: """${data.footwear}"""
- Physical Conditions: """${data.physicalConditions || "None reported"}"""
- Officer Demonstrated Tests: ${data.officerDemonstrated}

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. NHTSA Compliance Check — for EACH test administered (HGN, Walk-and-Turn, One-Leg Stand), list the NHTSA-standardized administration requirements and note which environmental or procedural factors from the intake may represent deviations. If the officer did not demonstrate, note NHTSA's demonstration requirement.
2. Physical Factor Analysis — how each reported physical condition (age, weight, injuries, disabilities, medications) affects performance on each specific test. Published NHTSA accuracy rates already account for IDEAL conditions — real-world conditions reduce reliability further.
3. Officer Administration Issues — common administration errors by test type: wrong instruction sequence, incorrect demonstration, improper scoring, stopping test early. Whether officer demonstrated is a key factor for Walk-and-Turn and One-Leg Stand.
4. Published Accuracy Rates — NHTSA's own published accuracy rates for each standardized test (HGN: 77%, Walk-and-Turn: 68%, One-Leg Stand: 65% — under IDEAL conditions). Combined battery accuracy. What these percentages mean for false positives.
5. Questions for Your Attorney — 10 test-specific questions tied to the factors identified above.

Frame everything as INFORMATION for discussion with their attorney. Use "patterns typically observed", "factors to consider" — never "you should", "we recommend".`;
    }

    case "plea-consequences": {
      const data = intake as unknown as PleaConsequencesIntake;
      return `Generate a Plea Deal Hidden Consequences report for:
- State: ${data.state}
- Original Charge Type: ${data.chargeType}
- Plea Offer Charge: """${data.pleaOfferCharge}"""
- Plea Offer Terms: """${data.pleaOfferTerms}"""
- Occupation: """${data.occupation || "Not specified"}"""
- Immigration Status: ${data.immigrationStatus || "Not specified"}
- Has Professional License: ${data.hasLicense || "Not specified"}

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Plea Offer Decoded — translate the plea offer into plain English. What the charge means, what the terms mean, what "adjudication withheld" or "deferred adjudication" means if applicable.
2. Criminal Consequences — direct sentencing consequences of accepting: jail/prison time, probation terms, fines, community service, classes, restitution. Compare to the original charge's potential consequences.
3. Top 10 Collateral Consequences — the 10 most impactful hidden consequences for THIS specific plea charge in THIS state, prioritized by the defendant's situation (occupation, immigration status, licensing). Cover: employment, housing, gun rights, voting, immigration, custody, education, public benefits, travel, and professional licensing as applicable.
4. Original Charge vs. Plea Offer — side-by-side comparison table: max sentence, collateral consequences, record impact, expungement eligibility for each.
5. Timing Considerations — withdrawal deadlines, when consequences attach (at plea vs. adjudication vs. sentencing), and how timing affects leverage.
6. Questions for Your Attorney — 10 questions specific to the plea offer and the defendant's personal circumstances.

Frame everything as INFORMATION for discussion with their attorney. Use "factors to consider", "questions worth exploring" — never "you should", "we recommend", "we advise".`;
    }

    case "drug-test-reliability": {
      const data = intake as unknown as DrugTestReliabilityIntake;
      return `Generate a Drug Test Reliability Research report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Test Type: ${data.testType}
- Substance Identified: """${data.substanceIdentified}"""
- Confirmatory Test Performed: ${data.confirmatoryTest}
- Results Documentation Available: ${data.resultsDocs}

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Test Reliability — published false positive rates for this test type and substance. Known cross-reactants (medications, foods, supplements) that can trigger false positives for the identified substance. Distinction between presumptive and confirmatory testing.
2. Chain of Custody — what proper chain of custody looks like for this test type. Common gaps. What documentation should exist at each step. Questions about handling, storage temperature, and time between collection and testing.
3. Lab Certification — required certifications for the testing lab (CLIA, state-specific). How to verify certification. What expired or missing certification means for admissibility.
4. Challenge Grounds — specific grounds for challenging this test type: methodology limitations, operator qualifications, equipment calibration, sample handling, confirmation testing requirements. Whether a confirmatory test was performed is a critical factor.
5. Questions for Your Attorney — 10 test-specific questions, including discovery requests for lab records, analyst qualifications, and equipment maintenance logs.

Frame everything as INFORMATION for discussion with their attorney. Use "factors to consider", "questions worth exploring" — never "you should", "we recommend".`;
    }

    case "bail-hearing-prep": {
      const data = intake as unknown as BailHearingPrepIntake;
      return `Generate a Bail Hearing Preparation report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Prior Convictions: ${data.priorConvictions}
- Community Ties: """${data.communityTies}"""
- Flight Risk Factors: """${data.flightRiskFactors || "None identified"}"""
- Current Bail Amount: """${data.currentBailAmount || "Not yet set"}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. How Bail Hearings Work — plain-English explanation of the bail hearing process in this state. What the judge considers, who speaks, and how decisions are typically made. Pretrial services role if applicable.
2. Factors in Your Favor — based on the reported community ties, analyze which factors support release or bail reduction: employment, family ties, length of residency, community involvement, prior court appearance history.
3. Factors Against You — honest assessment of factors that may weigh against the defendant: charge severity, prior convictions, flight risk factors reported. Understanding these allows the attorney to prepare responses.
4. Bail Reduction Strategies — framed as QUESTIONS to explore with the attorney: alternative conditions (GPS monitoring, check-ins, travel restrictions), bail bond options, surety vs. cash bail, OR (own recognizance) eligibility factors in this state.
5. Questions for Your Attorney — 10 hearing-specific questions including timing, what to bring, how to present, and what conditions to expect.

Frame everything as INFORMATION for discussion with their attorney. Use "factors to consider", "questions worth exploring" — never "you should", "we recommend".`;
    }

    case "sentencing-prep": {
      const data = intake as unknown as SentencingPrepIntake;
      return `Generate a Sentencing Hearing Preparation report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Conviction Method: ${data.convictionMethod}
- Sentencing Range: """${data.sentencingRange}"""
- Prior Convictions: ${data.priorConvictions}
- Mitigating Factors: """${data.mitigatingFactors}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. What to Expect — plain-English walkthrough of the sentencing hearing process in this state. Who speaks, in what order, what the judge considers, how long it typically takes. Pre-sentence investigation report (PSI) role and timeline.
2. Sentencing Range — published sentencing guidelines or ranges for this charge type in this state. How prior convictions affect the range. Mandatory minimums if applicable (cite only if confident; otherwise note "verify with your attorney"). Distinction between guidelines and judicial discretion.
3. Mitigation Factors — analysis of each reported mitigating factor and how courts in this state typically weigh it. Additional mitigating factors the defendant may not have considered: employment history, family responsibilities, mental health treatment, substance abuse treatment, community service, restitution, remorse.
4. Character References — who makes effective character witnesses, what they should address, how to prepare them. Letter format vs. live testimony considerations.
5. Allocution Considerations — framed as questions for the attorney: whether to make a personal statement, what courts respond to, what to avoid, how allocution differs from testimony.
6. Questions for Your Attorney — 10 sentencing-specific questions including preparation timeline, PSI interview strategy, and what conditions to request as alternatives.

Frame everything as INFORMATION for discussion with their attorney. Use "factors to consider", "questions worth exploring" — never "you should", "we recommend".`;
    }

    case "family-case-research": {
      const data = intake as unknown as FamilyCaseResearchIntake;
      return `Generate a Family Member Case Research report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Relationship to Defendant: """${data.relationshipToDefendant}"""
- Defendant Currently in Custody: ${data.defendantInCustody}
- Defendant Has Attorney: ${data.defendantHasAttorney}
- Case Stage: ${data.caseStage}

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. What They're Facing — plain-English explanation of the charge type, what it means, typical case timeline in this state, and potential outcomes. Written for a family member, not the defendant — explain the system from the outside.
2. What's Happening Now — based on the case stage, explain what is currently happening in the case, what comes next, and approximate timelines. If in custody, explain the custody/bond process.
3. How to Help — specific, actionable ways the family member can support the defendant based on their relationship and the case stage. Include: attending court, documenting character, helping find/communicate with attorneys, managing finances, maintaining normalcy for children if applicable.
4. What NOT to Do — critical warnings: jail phone calls are recorded and monitored, do not discuss case details on the phone or in jail visits, social media posts can become evidence, do not contact witnesses or alleged victims, do not post bail without understanding conditions.
5. Questions to Ask the Attorney — 10 specific questions the family member can ask the defendant's attorney (or help the defendant ask), tailored to this charge type and case stage.

This report is for a FAMILY MEMBER, not the defendant. Write with empathy — this person is scared for someone they love. Frame everything as INFORMATION. Use "factors to consider", "questions worth exploring" — never "you should", "we recommend".`;
    }

    case "arrest-report-review": {
      const data = intake as unknown as ArrestReportReviewIntake;
      return `Generate an Arrest Report Review for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Report Details: """${data.reportDetails}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Report Summary — translate the arrest report into plain English. What happened according to the report, in chronological order. Define any legal terms or police jargon used.
2. Potential Issues — identify inconsistencies, vague language, missing information, and potential procedural issues in the report. Common patterns: time gaps, passive voice hiding who did what, conclusory statements without supporting observations, missing witness information.
3. Miranda/Rights Analysis — based on the report details, identify when (if) Miranda warnings were given relative to questioning. Whether the timeline suggests any statements were obtained before rights were read. Note: this analysis is based on what the report states, which may differ from what actually occurred.
4. Probable Cause Assessment — analyze the stated basis for the stop, detention, and arrest. Whether the report articulates specific, articulable facts (Terry standard) or relies on vague suspicion. Whether the escalation from stop to arrest is supported by the facts described.
5. Questions for Your Attorney — 10 report-specific questions highlighting the gaps and issues identified, plus discovery requests (body cam footage, dash cam, dispatch records, CAD logs).

Frame everything as INFORMATION for discussion with their attorney. Use "patterns typically observed", "factors to consider" — never "you should", "we recommend".`;
    }

    // ─── Wave 3 — Post-conviction research (HIGH UPL) ──────────

    case "expungement-research": {
      const data = intake as unknown as ExpungementResearchIntake;
      return `Generate an Expungement Eligibility Research report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Outcome: ${data.convictionOrDismissal}
- Conviction/Disposition Date: """${data.convictionDate}"""
- Sentence Completed: ${data.sentenceCompleted}
- Prior Convictions: ${data.priorConvictions}
- Probation Completed: ${data.probationCompleted}

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

HIGH UPL SENSITIVITY — use "based on published state criteria, you MAY be eligible" — NEVER "you are eligible" or "you qualify."

Produce a comprehensive HTML report covering:
1. Eligibility Determination — based on published state criteria, categorize as: ELIGIBLE NOW / ELIGIBLE AFTER [estimated date] / NOT ELIGIBLE / UNCERTAIN. Explain the basis for the determination. If UNCERTAIN, explain which factors need attorney verification.
2. Waiting Period — the state's published waiting period for this charge type and disposition (conviction vs. dismissal). When the waiting period starts (from disposition date, sentence completion, or probation completion). Calculate approximate eligibility date based on the dates provided.
3. Process in Your State — step-by-step overview of the expungement/sealing process in this state: petition filing, hearing requirements, required documentation, typical timeline from filing to order, filing fees.
4. What Expungement Does — what records are sealed or destroyed, who can still see them, what the defendant can legally say on applications after expungement in this state.
5. Limitations — what expungement does NOT do: federal records, immigration records, news articles, private background check databases that may retain old data. Restoration of rights limitations.
6. Questions for Your Attorney — 10 state-specific questions about the expungement process, eligibility edge cases, and what to expect.

Frame everything as INFORMATION for discussion with their attorney. Use "factors that may apply", "questions worth exploring" — never "you should file", "we recommend".`;
    }

    case "sentence-reduction": {
      const data = intake as unknown as SentenceReductionIntake;
      return `Generate a Sentence Reduction Petition Research report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Sentence Imposed: """${data.sentenceImposed}"""
- Sentencing Date: """${data.sentencingDate}"""
- Basis for Reduction: """${data.basisForReduction}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

HIGH UPL SENSITIVITY — use "mechanisms that may be available" — NEVER "you should file" or "we recommend filing."

Produce a comprehensive HTML report covering:
1. Available Mechanisms — overview of sentence reduction mechanisms that may exist in this state: Rule 35 motions (or state equivalent), compassionate release, retroactive sentencing guideline amendments, executive clemency/commutation, earned time credits, medical release. Note which mechanisms are statutory vs. discretionary.
2. Applicable Mechanism Analysis — for each mechanism that may apply based on the defendant's situation and stated basis, analyze: eligibility criteria, typical grounds for success, filing deadlines (some are time-limited — e.g., Rule 35 often has a 120-day or 1-year window from sentencing), standard of review, success rates if published.
3. Required Documentation — what supporting documentation is typically needed: institutional records, programming certificates, medical records, employment history, character letters, victim impact considerations.
4. Timeline — realistic timeline expectations from filing through resolution for each applicable mechanism. Whether the sentence continues during the petition process.
5. Questions for Your Attorney — 10 mechanism-specific questions about eligibility, strategy, and expectations.

Frame everything as INFORMATION for discussion with their attorney. Use "mechanisms that may be available", "factors that may apply" — never "you should file", "we recommend".`;
    }

    case "appeal-viability": {
      const data = intake as unknown as AppealViabilityIntake;
      return `Generate an Appeal Viability Assessment for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Conviction Method: ${data.convictionMethod}
- Appeal Grounds: """${data.appealGrounds}"""
- Appeal Deadline Status: ${data.appealDeadlineStatus}
- Trial Issues: """${data.trialIssues}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

HIGH UPL SENSITIVITY — use "based on published appellate standards" — NEVER "you have a strong appeal" or "your appeal will succeed."

Produce a comprehensive HTML report covering:
1. Viability Assessment — based on published appellate standards, rate overall viability as STRONG / MODERATE / WEAK / NOT VIABLE. Explain the rating in plain English. Be honest — most appeals face an uphill battle, and defendants deserve to know that before investing time and money.
2. Deadline Status — based on the reported deadline status, explain the applicable filing deadlines in this state (notice of appeal, brief deadlines). If the deadline may have passed, explain post-conviction alternatives (state habeas, Rule 32, etc.). Deadlines are jurisdictional — missing them is typically fatal.
3. Grounds Analysis — for each ground identified, analyze: whether it is a recognized appellate ground, what standard of review applies (de novo, abuse of discretion, plain error), whether it was preserved at trial (objected to on the record), and how appellate courts in this state have typically treated similar arguments.
4. Preservation Issues — critical analysis of whether the trial issues were properly preserved. Unpreserved issues face plain error review, which is much harder to win. If issues were not preserved, explain what that means for the appeal.
5. Process and Cost — realistic overview of the appellate process: timeline (typically 1-3 years), costs (transcript, attorney fees, filing fees), what happens during the appeal (sentence continues unless stayed), and success rate context.
6. Questions for an Appellate Attorney — 10 specific questions for a consultation with an appellate specialist (who may be different from the trial attorney).

Frame everything as INFORMATION for discussion with an appellate attorney. Use "factors that may apply", "questions worth exploring" — never "you should appeal", "we recommend".`;
    }

    case "ineffective-counsel": {
      const data = intake as unknown as IneffectiveCounselIntake;
      return `Generate an Ineffective Counsel Documentation report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Issues Identified: """${data.issuesIdentified}"""
- Case Outcome: ${data.caseOutcome}

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

HIGHEST UPL SENSITIVITY — use "factors that MAY be relevant to an IAC analysis" — NEVER "your attorney was ineffective" or "you have an IAC claim." Frame the entire report as "information for the attorney evaluating the claim" — not as a determination that ineffective assistance occurred.

Produce a comprehensive HTML report covering:
1. Strickland Standard Explained — plain-English explanation of the two-prong test: (1) performance fell below objective standard of reasonableness, and (2) but for the deficient performance, there is a reasonable probability the outcome would have been different. Explain how high this bar is — courts give strong deference to attorney strategy decisions.
2. Issue Analysis — for EACH issue identified by the defendant, analyze: whether it relates to the performance prong or the prejudice prong, whether it could be explained as a strategic decision (which courts will defer to), and what documentation would be needed to support a claim based on this issue.
3. Documentation Recommendations — what records and evidence would be relevant for an attorney evaluating a potential IAC claim: trial transcripts, motion practice history, communication logs, discovery records, case timeline, and what to document NOW before memories fade.
4. Timeline for IAC Claims — state-specific deadlines for post-conviction IAC claims (state habeas, Rule 3.850 in FL, PCRA in PA, etc.). These deadlines are often strict. Note the applicable deadline framework for this state without fabricating specific time limits if unsure.
5. Questions for a New Attorney — 10 questions to ask during a consultation with an attorney who handles post-conviction claims. Frame as: "bring these questions and the documentation above to a consultation."

Frame everything as INFORMATION for the attorney who will evaluate the claim. Use "factors that may be relevant", "considerations for the evaluating attorney" — never "your attorney was ineffective", "you have a claim", "we recommend filing".`;
    }

    // ─── Wave 4 — Net-new from Reddit research ─────────────────

    case "attorney-performance-review": {
      const data = intake as unknown as AttorneyPerformanceReviewIntake;
      return `Generate an Attorney Performance Review for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Case Stage: ${data.caseStage}
- Issues Identified: """${data.issuesIdentified}"""
- Communication Frequency: ${data.communicationFrequency}

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Communication Benchmark — what communication frequency is typical for this charge type and case stage. Industry standards from bar associations. How this defendant's reported experience compares. Note: low communication does not necessarily mean poor representation — some stages are "waiting" stages.
2. Motion Filing Timeline Assessment — what motions a defense attorney would typically have filed by this case stage for this charge type. This is not prescriptive — different strategies call for different approaches — but provides a baseline for the defendant to have an informed conversation.
3. Discovery Status Assessment — where discovery should be in the process at this case stage. What the defendant should have received. What to ask about if they have not received discovery yet.
4. Case Progress vs. Typical Timelines — how the case timeline compares to typical timelines for this charge type in this state. Continuances, delays, and what they mean (delays can be strategic, not negligent).
5. Questions to Ask Your Attorney — 10 constructive, non-confrontational questions designed to get information, not to accuse. Frame as: "these questions help you understand your case status and your attorney's strategy."
6. When to Consider a Second Opinion — general factors that may warrant seeking a second opinion from another attorney. Frame carefully: this is about the defendant being informed, not about attacking their current attorney.

Frame everything as INFORMATION. This is about empowering the defendant with context, not building a complaint against their attorney. Use "patterns typically observed", "factors to consider" — never "your attorney is failing", "you should fire your attorney".`;
    }

    case "probation-violation-response": {
      const data = intake as unknown as ProbationViolationResponseIntake;
      return `Generate a Probation Violation Response report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Violation Type: ${data.violationType}
- Prior Violations: ${data.priorViolations}
- Probation Conditions: """${data.probationConditions}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Violation Classification — explain the difference between technical violations (missed appointment, failed drug test, curfew violation) and substantive violations (new arrest). Classify this violation and explain what that classification means for potential consequences.
2. Potential Consequences — range of outcomes for this violation type in this state: warning, modified conditions, extended probation, short jail sanction, revocation and imposition of original sentence. How prior violations affect the range. Judicial discretion factors.
3. Hearing Preparation — what happens at a violation hearing: burden of proof (preponderance, not beyond reasonable doubt), who testifies, what evidence is presented, the defendant's right to speak. Timeline from violation to hearing.
4. Mitigating Factors to Document — factors that courts consider in mitigation: compliance history, employment, treatment participation, family responsibilities, circumstances of the violation. What documentation to gather before the hearing.
5. Questions for Your Attorney — 10 violation-specific questions about the hearing process, potential outcomes, and preparation strategy.

Frame everything as INFORMATION for discussion with their attorney. Use "factors to consider", "questions worth exploring" — never "you should", "we recommend".`;
    }

    case "discovery-decoder": {
      const data = intake as unknown as DiscoveryDecoderIntake;
      return `Generate a Discovery Decoder report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Discovery Received: ${data.discoveryReceived}
- Discovery Contents Description: """${data.discoveryContents}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Discovery Contents Inventory — based on the description provided, categorize what the defendant appears to have received: police reports, witness statements, lab reports, photos/videos, expert reports, electronic evidence, surveillance, financial records, etc.
2. What's Present vs. What Should Be There — for this charge type, list the standard discovery categories and mark each as PRESENT / MISSING / UNCLEAR based on the defendant's description. Standard discovery for this charge type includes [list charge-specific items].
3. Gap Analysis — for each MISSING item, explain what it is, why it matters for the defense, and whether the prosecution is obligated to disclose it. Prioritize gaps by importance to the defense.
4. Significance of Each Document Type — for each category of discovery the defendant received, explain what to look for and what questions it should raise. Written for a layperson who has never read legal documents before.
5. Brady/Giglio Obligations Overview — plain-English explanation of the prosecution's obligation to disclose exculpatory evidence (Brady) and witness impeachment information (Giglio). What the defendant can do if they believe required disclosures are missing.
6. Questions for Your Attorney About Missing Items — 10 specific questions about the gaps identified, including discovery motions and deadlines.

Frame everything as INFORMATION for discussion with their attorney. Use "factors to consider", "questions worth exploring" — never "you should file", "we recommend".`;
    }

    case "constructive-possession": {
      const data = intake as unknown as ConstructivePossessionIntake;
      return `Generate a Constructive Possession Analysis for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Location Description: """${data.locationDescription}"""
- Proximity to Contraband: """${data.proximityToContraband}"""
- Ownership of Location: """${data.ownershipOfLocation}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Constructive Possession Elements — what the prosecution must prove for constructive possession in this state: knowledge of the contraband's presence AND dominion/control over it. Explain each element in plain English. Note: mere proximity is generally insufficient.
2. Proximity Analysis — based on the described proximity, analyze how courts in this state have treated similar proximity scenarios. Distance, accessibility, plain view vs. concealment, and whether the location arrangement suggests knowledge and control.
3. Knowledge and Control Factors — what evidence typically establishes (or fails to establish) knowledge and control: fingerprints, DNA, statements, ownership of container, exclusive vs. shared access, other personal items in the same location.
4. Shared Space Defense Angles — if the location is shared (vehicle with passengers, shared residence, common area), analyze how shared access affects the prosecution's burden. The "equal access" defense pattern. What the prosecution needs beyond mere presence in a shared space.
5. Questions for Your Attorney — 10 case-specific questions about the constructive possession defense, evidence challenges, and discovery requests.

Frame everything as INFORMATION for discussion with their attorney. Use "factors to consider", "questions worth exploring" — never "you should argue", "we recommend".`;
    }

    case "self-surrender-prep": {
      const data = intake as unknown as SelfSurrenderPrepIntake;
      return `Generate a Self-Surrender Preparation report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Surrender Date: """${data.surrenderDate}"""
- Surrender Location: """${data.surrenderLocation}"""
- Has Attorney: ${data.hasAttorney}

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Pre-Surrender Checklist — comprehensive checklist organized by category: personal affairs (bills, mail, dependents, pets, employer notification), financial (bank access, bill autopay, power of attorney if needed), legal (documents to bring, attorney contact info, case number), and practical (what to wear, personal items to leave at home).
2. What to Bring / What to Leave — specific list of items to bring (government ID, prescription verification letter, case paperwork, attorney's card, limited cash for commissary) and items to leave behind (jewelry, electronics, wallet contents, anything valuable). Facility-specific rules may vary — note the defendant's attorney or the facility can confirm specifics.
3. What to Expect at Intake — step-by-step walkthrough of the intake process: booking, fingerprinting, medical screening, property storage, phone call availability, housing assignment. Timeline (intake typically takes 4-8 hours). What to expect emotionally — this is normal to be anxious about.
4. First 24-48 Hours — what happens after intake: orientation, commissary access timeline, phone/email setup, visitation scheduling, daily routine overview. Practical survival information written with empathy.
5. Questions for Your Attorney — 10 surrender-specific questions including: voluntary surrender benefits at sentencing, reporting instructions, what happens if circumstances change before the surrender date, and post-surrender communication plan.

This person is about to lose their freedom. Write with dignity and practical clarity. Frame everything as INFORMATION. Use "factors to consider", "questions worth exploring" — never "you should", "we recommend".`;
    }

    case "probation-rights": {
      const data = intake as unknown as ProbationRightsIntake;
      return `Generate a Probation Rights Research report for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Probation Conditions: """${data.probationConditions}"""
- Probation Officer Issue: """${data.probationOfficerIssue}"""

Do not fabricate statute citations, case names, or case numbers. If you are uncertain about a specific state's statute, say "state law varies — verify current provisions with your attorney" rather than inventing a citation.

Produce a comprehensive HTML report covering:
1. Standard vs. Special Conditions — explain the difference between standard conditions (that apply to all probationers in this state) and special conditions (court-ordered for this specific case). Identify which of the reported conditions are standard and which may be special. Courts have limits on what special conditions can be imposed — they must be reasonably related to the offense or rehabilitation.
2. Probation Officer Authority Limits — what a PO can and cannot require beyond the court-ordered conditions. POs cannot unilaterally add conditions — only the court can modify conditions. If the PO is requiring something not in the court order, explain the defendant's options.
3. Search and Seizure Rules on Probation — how Fourth Amendment rights are modified (not eliminated) on probation in this state. When a PO can search without a warrant, when they need one, and what "reasonable suspicion" means in the probation context. Home visits vs. searches.
4. Condition Modification Process — how to request modification of probation conditions through the court. What grounds support modification. The process (motion, hearing, burden of proof). Early termination eligibility in this state.
5. Questions for Your Attorney — 10 questions specific to the reported PO issue and probation conditions, including documentation strategies and when to escalate.

Frame everything as INFORMATION for discussion with their attorney. Use "factors to consider", "questions worth exploring" — never "you should", "we recommend".`;
    }

    // ─── Court Case Port — Wave 2+3 (ship dark) ──────────────

    case "trial-prep-package": {
      const data = intake as unknown as TrialPrepPackageIntake;
      return `Generate a Trial Prep Package for a War Room client heading to trial:
- Charge Type: ${data.chargeType}
- State: ${data.state}
- County: """${data.county}"""
- Trial Date: """${data.trialDate || "Not provided"}"""
- Case Theme (if any): """${data.caseTheme || "Not provided"}"""
- Known Facts: """${data.knownFacts}"""

DATA AVAILABILITY RULES (NON-NEGOTIABLE):
- Ground every recommendation in well-established criminal trial practice and elite defense methodology. No fabricated voir dire questions, no fabricated case-specific themes pretending to be standard, no invented jury research statistics.
- If the customer did not provide a case theme, propose 2-3 candidate themes drawn from the known facts — clearly labeled as "candidate themes for discussion with your attorney."
- Voir dire questions must be content-neutral and tied to the charge type. Never include questions that probe protected categories or that violate Batson considerations.
- The Judgment of Acquittal package is a framework, not a filed motion. Frame as "what your attorney would assemble at the close of the State's case."

Produce a comprehensive HTML report covering:
1. Case Theme Architecture — 1 anchor theme (or 2-3 candidates if none provided), one phrase the jury can hold onto, plus how the theme threads from opening through closing.
2. Voir Dire Intelligence — juror screening considerations specific to this charge type, what attitudes correlate with conviction-prone vs. acquittal-prone jurors, and 8-12 voir dire question scaffolds the attorney can adapt.
3. Opening Statement Framework — structure (promise → preview → invitation), the opening's role in establishing the theme, and what NOT to say in opening to avoid promising what the evidence cannot deliver.
4. Cross-Examination Question Scaffolds — 5-8 cross categories tied to the prosecution witness types likely in this charge (officer, lay witness, expert, custodian) — with question scaffolds your attorney can adapt to specific witnesses.
5. Closing Argument Framework — structure (theme callback → evidence map → reasonable doubt anchors), how the closing ties back to the opening promise, and the final ask.
6. Judgment of Acquittal Package — what a JOA motion is, when it is filed (close of the State's case), what elements it must address for this charge, and a checklist your attorney can run through.
7. Motion in Limine Considerations — 3-5 categories of evidence the defense may want excluded before trial, framed as questions to bring to your attorney.
8. 10 Trial-Specific Questions to Bring to Your Attorney — covering theme alignment, witness preparation, exhibits, and jury communication.

Frame everything as INFORMATION your attorney can use as raw material — never as advice about what to do at trial. Use "patterns elite trial attorneys rely on", "frameworks to discuss with your attorney", "questions worth exploring" — never "we recommend" or "you should".`;
    }

    case "case-law-intelligence": {
      const data = intake as unknown as CaseLawIntelligenceIntake;
      return `Generate a Case Law Intelligence Pack for:
- Charge Type: ${data.chargeType}
- State: ${data.state}
- County: """${data.county}"""
- Case Stage: ${data.caseStage}
- Motion Focus (if any): """${data.motionFocus || "Not specified — produce a balanced classification across motion types"}"""
- Known Facts: """${data.knownFacts}"""

DATA AVAILABILITY RULES (NON-NEGOTIABLE):
- NEVER fabricate case names, citations, court names, or case years. Every cited case must be one you actually have reliable training-data knowledge of for this jurisdiction.
- For every cited case, include a "verify on CourtListener" framing — never present a case as already verified. If you are uncertain whether a case is still good law, say so.
- Holdings are paraphrased — frame as "the holding is generally understood to mean" rather than direct quotation.
- If you do not have reliable training-data knowledge of strong cases for a particular motion type in this jurisdiction, say so explicitly: "Reliable training-data coverage is limited for this jurisdiction's recent rulings on this motion type — your attorney should run a fresh CourtListener search."
- For state-specific holdings, name the state and year if known. Never invent docket numbers.
- Per-motion applicability scores (STRONG / MODERATE / WEAK / REVIEW) are estimates of fit, not statistical claims.

Produce a comprehensive HTML report covering:
1. Strategic Classification — for the cases you cite, classify each as Defense-Favorable, Judgment of Acquittal Opportunity, Danger (likely prosecution citation), or Neutral.
2. Per-Motion Applicability Matrix — for each motion type relevant to this case stage and charge (suppression, dismiss, in limine, JOA, sentencing), score the strongest known cases as STRONG / MODERATE / WEAK / REVIEW with one-line rationale.
3. Prosecution Citation Anticipation — the 3-5 cases the State is most likely to lead with for this charge type, with a distinguishing argument for each ("our case differs because...").
4. Verification URLs — for every cited case, provide a CourtListener search URL the attorney can use to confirm the holding and check current Shepard treatment. Frame as "verify before citing."
5. Tactical Timing Guide — for each cited case, when in the case timeline the citation is most useful (pretrial motion, trial, sentencing, appeal).
6. Plain-English Summary — one-paragraph plain-language explanation of each cited case so the defendant can follow the conversation with their attorney.
7. 10 Case-Law-Specific Questions to Bring to Your Attorney — including "have you searched CourtListener for cases on point in our circuit since [year]?"

Frame everything as INFORMATION your attorney can verify and use — never as legal advice. Use "factors to consider", "questions worth exploring", "case law your attorney may want to verify" — never "we recommend" or "you should cite."`;
    }

    case "expert-witness-challenge": {
      const data = intake as unknown as ExpertWitnessChallengeIntake;
      return `Generate an Expert Witness Challenge Report for:
- Expert Witness Name: """${data.expertName}"""
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Expert's Field: """${data.expertField || "Not specified"}"""
- Expected Testimony Subject: """${data.knownFacts}"""

DATA AVAILABILITY RULES (NON-NEGOTIABLE):
- This expert may or may not have substantial public records. Most state-level forensic experts have LIMITED documented history.
- If you have NO reliable training-data information about this specific expert, say so explicitly in the Executive Summary: "Public information about this specific expert is limited. The challenge framework below applies to the expert's stated discipline — not this expert's documented history."
- NEVER fabricate the expert's prior testimony, prior cases, prior sanctions, or specific qualifications. If you do not know it, say so.
- The Daubert factor analysis applies to the DISCIPLINE the expert practices, not to the individual expert. You can analyze the discipline (testability, peer review, error rate, general acceptance) without making claims about the individual's record.
- Never invent case names where the expert testified. If you reference a case by name, you must have reliable training-data knowledge of it.

Produce a comprehensive HTML report covering:
1. Executive Summary — what is known about the expert's discipline and what is limited about the individual. Be honest about data depth. Under 200 words.
2. Daubert Factor Analysis — for the expert's discipline:
   (a) Testability — can the technique be tested?
   (b) Peer Review — has the technique been published in peer-reviewed literature?
   (c) Error Rate — what is the known or published error rate for the technique?
   (d) General Acceptance — is the technique generally accepted outside law enforcement laboratories?
3. Methodology Challenge Angles — the technique-specific weaknesses your attorney can probe (chain of custody, sample preparation, instrument calibration, contamination control, analyst training).
4. Qualification Gap Research — credentials the expert may claim and the gaps that may exist (board certification vs. self-attestation, peer-reviewed publications vs. conference presentations, courtroom testimony experience vs. casework experience). Frame as questions to verify.
5. Prior Testimony Considerations — IF you have reliable training-data knowledge of prior testimony patterns in this discipline (NOT specific to this expert), describe them. Otherwise: "Prior testimony research requires Westlaw/Lexis or specialized databases your attorney can access."
6. Defense Brief Outline — the skeleton of a Daubert motion your attorney can build on, with section headers for each factor and the technique-specific challenge points.
7. Cross-Examination Question Scaffolds — 8-12 questions adapted to the discipline that probe the Daubert factors, qualification gaps, and methodology weaknesses.
8. 10 Expert-Specific Questions to Bring to Your Attorney — including "have you filed a Daubert motion?" and "have you obtained the expert's CV and prior testimony?"

Frame everything as INFORMATION your attorney can use to build a Daubert motion — never as legal advice. Use "factors a Daubert challenge typically addresses", "questions worth exploring", "areas your attorney may want to probe" — never "we recommend" or "you should challenge."`;
    }

    case "discovery-demand-letter": {
      const data = intake as unknown as DiscoveryDemandLetterIntake;
      return `Generate a Discovery Demand Letter for:
- Charge Type: ${data.chargeType}
- State: ${data.state}
- County: """${data.county}"""
- Arrest Date: """${data.arrestDate || "Not provided"}"""
- Discovery Already Received: """${data.discoveryReceivedSoFar || "None reported"}"""

DATA AVAILABILITY RULES (NON-NEGOTIABLE):
- Ground every demanded item in well-established criminal procedure (Brady v. Maryland, Giglio v. United States, federal Rule 16, state discovery rules). Do NOT invent rule numbers or statute citations. If you reference a rule, name the rule by its standard short form ("Rule 16", "Brady", "Giglio") rather than fabricating section numbers.
- Charge-specific demands must align to evidence types that genuinely exist for this charge type (e.g., for DUI: breathalyzer calibration logs and operator certification — not invented items).
- The letter must be addressed to "[Prosecutor Name]" as a placeholder, framed for the defendant's attorney to review, customize, and file. Never frame the letter as if the defendant is filing it directly.
- Include the standard methodology disclaimer at the end.
- Charge-specific items should number 12-25. Do not pad with generic items that have no relevance to this charge type.

Produce a comprehensive HTML report containing TWO sections:

SECTION 1 — THE DEMAND LETTER (HTML <pre> block with letter formatting)
Format as a real legal demand letter with:
- Letter header (To: [Prosecutor Name], From: [Defense Attorney], Re: [Case Reference])
- Standard introduction citing the relevant discovery rules (Brady, Giglio, Rule 16, state equivalents)
- Numbered demand items, grouped by category:
  (a) Standard items every criminal case includes
  (b) Charge-specific items for this offense type
  (c) Items relevant to the items already received (gap-fill demands based on what was disclosed so far)
  (d) Brady/Giglio impeachment material specific to the prosecution witnesses likely in this case
  (e) Lab/forensic chain of custody if applicable
  (f) Officer history demands if applicable
- Closing paragraph requesting written response within a reasonable time
- Signature block placeholder

SECTION 2 — EXPLANATORY NOTES FOR THE DEFENDANT
Plain-English explanation covering:
1. What the demand letter is and why it matters
2. Why each category of items is being demanded — what it can reveal
3. What happens if the prosecution refuses or partially complies (motion to compel)
4. How this letter sets up the next phase of defense
5. 10 discovery-specific questions to bring to your attorney about the items in the letter

The letter is a TEMPLATE for the defendant's attorney to review, edit for the specific case, sign, and file. It is NOT legal advice to the defendant. The Section 2 notes must explicitly state: "This letter is a template your attorney can review and adapt. Your attorney remains the final authority on what to file and when." Use "factors to consider", "items typically demanded for this charge type" — never "you should file this" or "we recommend you send this."`;
    }

    default:
      return null;
  }
}

/**
 * Calls the Anthropic Messages API synchronously.
 * Returns the text content from the first text block.
 *
 * @param systemPrompt - System prompt string.
 * @param userPrompt - User prompt string.
 * @param apiKey - ANTHROPIC_API_KEY.
 * @param model - Claude model ID.
 * @returns Generated text content.
 * @throws On API error or unexpected response shape.
 */
async function callClaudeAPI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API ${response.status}: ${errBody}`);
  }

  const data = await response.json();

  // Extract text from the first text content block
  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === "text"
  );
  if (!textBlock?.text) {
    throw new Error("Claude API returned no text content");
  }

  return textBlock.text;
}

// ============================================================
// ENTRY POINT
// ============================================================

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const headers = { "Content-Type": "application/json" };

  try {
    // --- Read env vars ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase env vars not configured" }),
        { status: 500, headers }
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers }
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@imnotanattorney.com";
    const operatorEmail = Deno.env.get("OPERATOR_EMAIL") || "rahim0kapadia@gmail.com";
    const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://imnotanattorney.com";
    const claudeModel = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-6-20250514";

    // --- Parse request body ---
    const { orderId } = await req.json();
    if (
      !orderId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
    ) {
      return new Response(
        JSON.stringify({ error: "Valid orderId (UUID) required" }),
        { status: 400, headers }
      );
    }

    console.log(`[generate-standalone] Starting for order ${orderId}`);

    // --- 1. Fetch order ---
    const orders = await supabaseSelect(
      supabaseUrl, supabaseKey, "orders",
      `id=eq.${orderId}&select=*`
    );
    // deno-lint-ignore no-explicit-any
    const order = (orders as any[])[0];
    if (!order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers }
      );
    }

    // --- 2. Idempotency guard ---
    // If the order already has a report uploaded, skip generation.
    // Prevents duplicate work on webhook retries or operator re-triggers.
    if (order.standalone_report_storage_path) {
      console.log(`[generate-standalone] Order ${orderId} already has report, skipping`);
      return new Response(
        JSON.stringify({
          success: true,
          orderId,
          status: order.status,
          skipped: true,
        }),
        { headers }
      );
    }

    // --- 3. Validate standalone data ---
    const slug = order.standalone_product_slug;
    const intake = order.standalone_intake;

    if (!slug || !intake) {
      const msg = !slug
        ? "Order missing standalone_product_slug"
        : "Order missing standalone_intake";
      console.error(`[generate-standalone] ${msg}: ${orderId}`);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers }
      );
    }

    const meta = PRODUCT_META[slug];
    if (!meta) {
      return new Response(
        JSON.stringify({ error: `Unsupported product slug: ${slug}` }),
        { status: 400, headers }
      );
    }

    // --- 4. Build prompts ---
    const productName = meta.name;
    const systemPrompt = buildSystemPrompt(productName, meta.price);
    const userPrompt = buildUserPrompt(slug, intake);

    if (!userPrompt) {
      return new Response(
        JSON.stringify({ error: `No prompt builder for slug: ${slug}` }),
        { status: 400, headers }
      );
    }

    // --- 5. Update status to generating ---
    await supabaseUpdate(supabaseUrl, supabaseKey, "orders", `id=eq.${orderId}`, {
      status: "generating",
      updated_at: new Date().toISOString(),
    });

    console.log(`[generate-standalone] Calling Claude API (${claudeModel}) for ${slug}...`);

    // --- Generation phase (inner try/catch) ---
    // Errors here have orderId in scope, so we can update order status
    // and send operator notification with retry command.
    try {
      // --- 6. Call Claude API ---
      const reportHtml = await callClaudeAPI(systemPrompt, userPrompt, anthropicKey, claudeModel);

      console.log(`[generate-standalone] Claude returned ${reportHtml.length} chars`);

      // --- 7. Generate report token ---
      const tokenBytes = crypto.getRandomValues(new Uint8Array(16));
      const plaintextToken = Array.from(tokenBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const tokenHash = await hashTokenDeno(plaintextToken);

      // --- 8. Upload HTML to Supabase Storage ---
      const storagePath = `standalone-reports/${orderId}.html`;
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/${storagePath}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "text/html",
            "x-upsert": "true",
          },
          body: reportHtml,
        }
      );

      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.text();
        throw new Error(`Storage upload failed: ${uploadRes.status} — ${uploadErr}`);
      }

      console.log(`[generate-standalone] Report uploaded to ${storagePath}`);

      // --- 9. Update order with token + path + expiry ---
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year expiry

      await supabaseUpdate(supabaseUrl, supabaseKey, "orders", `id=eq.${orderId}`, {
        standalone_report_token_hash: tokenHash,
        standalone_report_storage_path: storagePath,
        standalone_report_token_expires_at: expiresAt.toISOString(),
        status: "delivered",
        updated_at: new Date().toISOString(),
      });

      console.log(`[generate-standalone] Order ${orderId} updated — status: delivered`);

      // --- 10. Send delivery email ---
      if (resendKey && order.email) {
        const reportUrl = `${siteUrl}/report/standalone/${plaintextToken}`;
        const emailResult = await sendEmail({
          to: order.email,
          subject: `Your ${productName} is ready`,
          html: `
            <h1 style="color: #F5F5F4; font-size: 24px; margin-bottom: 16px;">Your Report Is Ready</h1>
            <p style="color: #D4D4D8; font-size: 16px; line-height: 1.6; margin-bottom: 8px;">
              Your personalized ${escapeHtml(productName)} is ready to view.
            </p>
            <p style="color: #A1A1AA; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
              This report was generated specifically for your situation and contains
              detailed analysis based on the information you provided.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${reportUrl}"
                 style="display: inline-block; background: #2563EB; color: #FFFFFF; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                View Your Report
              </a>
            </div>
            <p style="color: #71717A; font-size: 12px; line-height: 1.5; margin-top: 24px;">
              This report provides legal INFORMATION — not legal ADVICE. Your attorney
              remains the final authority on strategy decisions.
            </p>
          `,
          resendKey,
          fromEmail: resendFrom,
          operatorEmail,
        });

        if (emailResult.success) {
          console.log(`[generate-standalone] Delivery email sent to ${order.email}`);
        } else {
          console.error(`[generate-standalone] Delivery email failed: ${emailResult.error}`);
        }
      }

      // --- 11. Return success ---
      return new Response(
        JSON.stringify({
          success: true,
          orderId,
          storagePath,
          status: "delivered",
        }),
        { status: 200, headers }
      );
    } catch (genError) {
      // --- Generation-phase error handler ---
      // orderId is in scope here, so we can update the order and notify operator.
      console.error(`[generate-standalone] Generation failed for ${orderId}:`, genError);

      await supabaseUpdate(supabaseUrl, supabaseKey, "orders", `id=eq.${orderId}`, {
        status: "generation-failed",
        updated_at: new Date().toISOString(),
      });

      if (resendKey) {
        const errMsg = genError instanceof Error ? genError.message : String(genError);
        await sendEmail({
          to: operatorEmail,
          subject: `URGENT: Standalone report generation failed — ${productName}`,
          html: `<h1 style="color: #EF4444;">Report Generation Failed</h1>
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Customer:</strong> ${escapeHtml(order.email || "unknown")}</p>
            <p><strong>Product:</strong> ${escapeHtml(productName)}</p>
            <p><strong>Error:</strong> ${escapeHtml(errMsg)}</p>
            <p style="margin-top: 16px;"><strong>Retry command:</strong></p>
            <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${supabaseUrl}/functions/v1/generate-standalone -H "Content-Type: application/json" -H "Authorization: Bearer ${supabaseKey}" -d '{"orderId":"${orderId}"}'</code>`,
          resendKey,
          fromEmail: resendFrom,
          operatorEmail,
        });
      }

      return new Response(
        JSON.stringify({ error: "Report generation failed" }),
        { status: 500, headers }
      );
    }
  } catch (error) {
    // --- Outer error handler ---
    // Catches pre-generation errors (env vars missing, JSON parse failure,
    // order not found in DB, etc.) where orderId may not be available.
    console.error("[generate-standalone] Unhandled error:", error);

    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@imnotanattorney.com";
      const operatorEmail = Deno.env.get("OPERATOR_EMAIL") || "rahim0kapadia@gmail.com";

      if (resendKey) {
        await sendEmail({
          to: operatorEmail,
          subject: "URGENT: generate-standalone unhandled error",
          html: `<h1 style="color: #EF4444;">Unhandled Error in generate-standalone</h1>
            <p><strong>Error:</strong> ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
            <p style="color: #71717A;">Check Supabase Edge Function logs for full stack trace.</p>`,
          resendKey,
          fromEmail: resendFrom,
          operatorEmail,
        });
      }
    } catch (innerError) {
      console.error("[generate-standalone] Error handler failed:", innerError);
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
