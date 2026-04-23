/**
 * @file POST /api/generate/trial-strategy-memo — Situation Room ($9,997) strategy memo tool.
 *
 * Sprint 6b of the tier-ladder plan. Operator-triggered endpoint that generates
 * a cohesive trial-strategy memo tying rising-flagged precedents + charge-specific
 * authorities + intake facts into a narrative strategy document. Output goes into
 * the operator's Situation Room deliverable as starting scaffolding for the
 * attorney-facing trial intelligence package.
 *
 * Pattern: /api/generate/motion-drafts/route.ts. Larger prompt, longer output,
 * single LLM call (no parallel fan-out).
 *
 * UPL framing: memo is drafting aid for the attorney. Defendants do not see
 * raw output — operator reviews + contextualizes first.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorSecret } from "@/lib/auth/guards";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const auth = requireOperatorSecret(req);
  if (!auth.authorized) return auth.error;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { caseId } = body;
  if (!caseId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId)) {
    return NextResponse.json({ error: "Valid caseId (UUID) required" }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: caseData, error: caseErr } = await supabase
    .from("cases")
    .select("id, intake_id")
    .eq("id", caseId)
    .single();
  if (caseErr || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const { data: intake, error: intakeErr } = await supabase
    .from("intakes")
    .select("charge_type, state, first_name, situation, specific_question, phase2_data, evidence_type, attorney_strategy")
    .eq("id", caseData.intake_id)
    .single();
  if (intakeErr || !intake) {
    return NextResponse.json({ error: "Intake not found" }, { status: 404 });
  }

  // Pull rising precedents (appellate/supreme) + charge-specific top authorities.
  const { data: rising } = await supabase
    .from("citation_velocity_criminal")
    .select("case_name, jurisdiction, date_filed, citation_count, velocity, source_url, cited_opinion_id")
    .eq("rising_flag", true)
    .in("jurisdiction", ["S", "SA", "F"])
    .order("velocity", { ascending: false })
    .limit(10);

  const { data: topByCharge } = await supabase
    .from("charge_type_top_authorities")
    .select("case_name, rank, citation_count_in_charge, authority_tier_overall, source_url")
    .ilike("charge_type", `${(intake.charge_type || "").toLowerCase()}%`)
    .order("rank", { ascending: true })
    .limit(10);

  // Timeline for rising cases.
  const risingIds = (rising || [])
    .map((r) => r.cited_opinion_id)
    .filter((id): id is string | number => id != null);
  const { data: timeline } = risingIds.length
    ? await supabase
        .from("citation_velocity_timeline")
        .select("cited_opinion_id, cites_3m, cites_12m, cites_lifetime")
        .in("cited_opinion_id", risingIds as number[])
    : { data: [] };
  const timelineMap = new Map<string, { cites_3m: number; cites_12m: number; cites_lifetime: number }>();
  for (const t of timeline || []) timelineMap.set(String(t.cited_opinion_id), t);

  const risingBlock = (rising || [])
    .map((r) => {
      const year = r.date_filed ? new Date(r.date_filed).getUTCFullYear() : "—";
      const t = r.cited_opinion_id ? timelineMap.get(String(r.cited_opinion_id)) : null;
      const trend = t ? ` [last-12mo=${t.cites_12m}, lifetime=${t.cites_lifetime}]` : "";
      return `- ${r.case_name} (${year}) velocity=${r.velocity}/yr${trend}`;
    })
    .join("\n");

  const topChargeBlock = (topByCharge || [])
    .map((t) => `- rank ${t.rank}: ${t.case_name} (${t.authority_tier_overall}, ${t.citation_count_in_charge} cites in-charge)`)
    .join("\n");

  const evidenceList = Array.isArray(intake.evidence_type)
    ? intake.evidence_type.join(", ")
    : (intake.evidence_type || "not specified");

  const phase2 = (intake.phase2_data as Record<string, unknown>) || {};
  const judgeName = typeof phase2.judge_name === "string" ? phase2.judge_name : null;
  const biggestConcern = typeof phase2.biggest_concern === "string" ? phase2.biggest_concern : null;

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const system = `You draft trial-strategy memos for a criminal defense attorney's use. Output goes to the attorney as SCAFFOLDING they will adapt to the specific facts of the case.

FRAMING RULES (never violated):
- Output is informational drafting aid for the attorney, not a filed document or advice to the defendant.
- Never write directive advice to the defendant ("you should", "we recommend"). You are writing for the attorney, not the client.
- Cite only the precedents provided in the input. Do NOT invent case citations.
- Memo reflects the tier ($9,997 Situation Room) — comprehensive, strategy-focused, multi-layered, not generic.
- Use legal-writing conventions (clear structure, active voice, citation-adjacent analysis).

OUTPUT STRUCTURE (exactly, no deviation):
## Trial Strategy Memo
### 1. Theory of the Defense
One paragraph anchoring the core defense theory to specific intake facts + charge.

### 2. Precedent Strategy (Rising Authorities)
2-3 paragraphs mapping rising-precedent authorities to concrete argumentative leverage in this case. Each precedent cited must be referenced in a way that ties to the defense theory.

### 3. Precedent Strategy (Charge-Foundational Authorities)
1-2 paragraphs on the charge-specific top authorities. Note which are foundational vs landmark and which are most likely to be cited by the prosecution.

### 4. Motion Sequence Recommendation
Ordered list (3-5 items) of motions to consider filing, with timing rationale and the specific precedent(s) each motion would lean on.

### 5. Evidence & Witness Scrutiny Priorities
Bulleted list of evidence/witness vulnerabilities to probe first, tied to evidence the intake says exists.

### 6. Trial-Phase Considerations
2-3 paragraphs on jury-selection themes, opening-statement hooks, cross-examination priorities, and likely prosecution strategies.

Length: 1200-1800 words total. Do not exceed 1800.`;

  const user = `Draft a trial-strategy memo for the following case.

<intake>
Charge: ${intake.charge_type}
State: ${intake.state || "not specified"}
Judge: ${judgeName || "not specified"}
Evidence types present: ${evidenceList}
Attorney's current strategy (as described by defendant): ${intake.attorney_strategy || "not specified"}
Defendant's biggest concern: ${biggestConcern || "not specified"}
Situation context: ${intake.situation || "not specified"}
Specific question raised: ${intake.specific_question || "not specified"}
</intake>

<rising_precedents velocity_filter="top-10-nationally">
${risingBlock || "(no rising precedents available)"}
</rising_precedents>

<charge_top_authorities>
${topChargeBlock || "(no charge-specific authorities available)"}
</charge_top_authorities>

Draft the trial-strategy memo now. Remember: the attorney will adapt sections to their knowledge of the specific record; focus on strategic scaffolding they can build on. Do NOT restate intake facts verbatim.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    temperature: 0.3,
    system,
    messages: [{ role: "user", content: user }],
  });

  const block = res.content[0];
  const memo = block && block.type === "text" ? block.text.trim() : "(generation failed — no text block returned)";

  return NextResponse.json({
    success: true,
    caseId,
    charge: intake.charge_type,
    precedents_used: {
      rising: (rising || []).map((r) => r.case_name),
      top_by_charge: (topByCharge || []).map((t) => t.case_name),
    },
    memo,
    generated_at: new Date().toISOString(),
  });
}
