/**
 * @file POST /api/generate/motion-drafts — Situation Room ($9,997) motion-draft tool.
 *
 * Sprint 4a of the tier-ladder plan. Operator-triggered endpoint that generates
 * draft motion-paragraph language tying rising precedents (from citation_velocity_criminal)
 * to the buyer's charge type. Output goes into the operator's Situation Room deliverable
 * as starting material for attorney adaptation — NOT delivered directly to defendants.
 *
 * Pattern: /api/generate/tier9/route.ts (operator-secret guard + Claude call).
 *
 * UPL framing: draft language is explicitly "for attorney adaptation," not "to file."
 * Defendants do not see raw output — operator reviews + contextualizes first.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorSecret } from "@/lib/auth/guards";
import Anthropic from "@anthropic-ai/sdk";

interface RisingPrecedent {
  case_name: string | null;
  jurisdiction: string;
  date_filed: string | null;
  citation_count: number;
  velocity: number;
  source_url: string | null;
}

const MOTION_TYPES = ["suppression", "dismissal", "severance"] as const;
type MotionType = typeof MOTION_TYPES[number];

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

  // Load case + intake
  const { data: caseData, error: caseErr } = await supabase
    .from("cases")
    .select("id, intake_id, tier, email")
    .eq("id", caseId)
    .single();
  if (caseErr || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const { data: intake, error: intakeErr } = await supabase
    .from("intakes")
    .select("charge_type, state, first_name, situation, specific_question")
    .eq("id", caseData.intake_id)
    .single();
  if (intakeErr || !intake) {
    return NextResponse.json({ error: "Intake not found" }, { status: 404 });
  }

  // Fetch top 10 rising precedents filtered to appellate/supreme levels
  const { data: precedents } = await supabase
    .from("citation_velocity_criminal")
    .select("case_name, jurisdiction, date_filed, citation_count, velocity, source_url")
    .eq("rising_flag", true)
    .in("jurisdiction", ["S", "SA", "F"])
    .order("velocity", { ascending: false })
    .limit(10);

  const rising: RisingPrecedent[] = (precedents || []) as RisingPrecedent[];
  if (!rising.length) {
    return NextResponse.json({ error: "No rising precedents available" }, { status: 503 });
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Generate all 3 motion drafts in parallel
  const drafts = await Promise.all(
    MOTION_TYPES.map((motion) => generateDraft(anthropic, motion, intake, rising)),
  );

  const output: Record<MotionType, string> = {
    suppression: drafts[0],
    dismissal: drafts[1],
    severance: drafts[2],
  };

  return NextResponse.json({
    success: true,
    caseId,
    charge: intake.charge_type,
    precedents_used: rising.map((r) => r.case_name),
    drafts: output,
    generated_at: new Date().toISOString(),
  });
}

async function generateDraft(
  anthropic: Anthropic,
  motion: MotionType,
  intake: { charge_type: string; state: string | null; situation?: string | null },
  rising: RisingPrecedent[],
): Promise<string> {
  const precedentList = rising
    .map((r, i) => {
      const year = r.date_filed ? new Date(r.date_filed).getUTCFullYear() : "—";
      return `${i + 1}. ${r.case_name} (${year}) — ${r.citation_count} citations, ${r.velocity}/yr`;
    })
    .join("\n");

  const motionDescription = {
    suppression: "a motion to suppress evidence (Fourth Amendment / procedural defects in evidence collection)",
    dismissal: "a motion to dismiss (insufficient evidence, procedural defects, or legal insufficiency of the charge)",
    severance: "a motion to sever (separate counts or defendants for prejudice-reduction)",
  }[motion];

  const system = `You draft motion-paragraph language for a criminal defense attorney's use. Your output goes to the attorney as STARTING MATERIAL that the attorney will adapt to the specific facts of the case.

FRAMING RULES (never violated):
- The output is informational drafting aid for the attorney, not a filed document.
- Never write directive advice to the defendant ("you should", "we recommend"). You are writing for the attorney, not the client.
- Cite only the precedents provided in the input. Do NOT invent citations.
- If a precedent's relevance to ${motion} is weak or unclear, do NOT cite it. Quality over quantity.
- Use legal-writing conventions (short sentences, active voice, citation-adjacent analysis).

OUTPUT STRUCTURE (exactly):
1. One opening sentence stating the motion's purpose.
2. 2-4 paragraphs of legal argument, each anchored in a specific cited precedent.
3. One closing sentence requesting the specific relief.

Length: 200-400 words total. Do not exceed 400.`;

  const user = `Draft paragraph language for ${motionDescription} on behalf of a defendant charged with ${intake.charge_type} in ${intake.state || "the relevant jurisdiction"}.

Available rising-precedent authorities (most likely relevant to this charge area):
${precedentList}

Context from intake (use sparingly, don't repeat case facts the attorney already knows):
${intake.situation || "No additional context provided."}

Draft the ${motion} motion paragraphs now. Remember: attorney will adapt this to specific case facts, so focus on legal-theory scaffolding that the attorney can plug their facts into.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    temperature: 0.3,
    system,
    messages: [{ role: "user", content: user }],
  });

  const block = res.content[0];
  if (block && block.type === "text") return block.text.trim();
  return "(generation failed — no text block returned)";
}
