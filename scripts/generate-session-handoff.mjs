#!/usr/bin/env node
/**
 * generate-session-handoff.mjs
 *
 * Given a caseId, emits a Claude Code session prompt to stdout
 * containing the case's intake + tier context. Operator pastes the
 * prompt into a fresh Claude Code session, runs it by hand, then POSTs
 * the final HTML to /api/admin/session-report/<caseId>.
 *
 * Referenced by /api/cron/notify-session-handoff as the manual handoff
 * CLI. Zero side effects — read-only DB query + stdout.
 *
 * Usage:
 *   node scripts/generate-session-handoff.mjs <caseId>
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!m) continue;
    const [, k, v] = m;
    if (!(k in process.env)) process.env[k] = v;
  }
}

function die(msg, code = 1) {
  process.stderr.write(`[generate-session-handoff] ${msg}\n`);
  process.exit(code);
}

async function main() {
  const caseId = process.argv[2];
  if (!caseId) die("usage: node scripts/generate-session-handoff.mjs <caseId>");

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: caseRow, error: caseErr } = await sb
    .from("cases")
    .select("id, tier, intake_id, status")
    .eq("id", caseId)
    .maybeSingle();
  if (caseErr) die(`case fetch error: ${caseErr.message}`);
  if (!caseRow) die(`case not found: ${caseId}`);

  const { data: intake, error: intakeErr } = await sb
    .from("intakes")
    .select("*")
    .eq("id", caseRow.intake_id)
    .maybeSingle();
  if (intakeErr) die(`intake fetch error: ${intakeErr.message}`);
  if (!intake) die(`intake not found for case ${caseId}`);

  const prompt = `You are generating a ${caseRow.tier} report for ImNotAnAttorney.

CONTEXT:
- Case ID: ${caseRow.id}
- Tier: ${caseRow.tier}
- Intake ID: ${caseRow.intake_id}

INTAKE (as provided by the defendant):
\`\`\`json
${JSON.stringify(intake, null, 2)}
\`\`\`

INSTRUCTIONS:
1. Read ImNotAnAttorney/system/templates/ for the current report template for tier "${caseRow.tier}".
2. Read ImNotAnAttorney/.claude/rules/atti-persona.md + content-rules.md for voice + UPL constraints.
3. Generate the full report as HTML (no markdown). Use existing Phase 2 <cite data-entity-id="..."> tags for legal references — the sanitizer strips any unverified cites.
4. UPL hard rules: never "you should" / "we recommend" / "your best option". Use "consider" / "one option is" / "questions to explore".
5. Never mention AI, Claude, LLM, algorithms, automated analysis.
6. When the HTML is ready, POST it to the prod admin endpoint:

\`\`\`
curl -X POST https://imnotanattorney.com/api/admin/session-report/${caseRow.id} \\
  -H "X-Admin-Password: $ADMIN_PASSWORD" \\
  -H "Content-Type: application/json" \\
  --data-raw '{"report_html":"<!-- paste final HTML here -->"}'
\`\`\`

Success criterion: 200 OK with {"delivered":true,"caseId":"${caseRow.id}","mode":"session"}.`;

  process.stdout.write(prompt);
  process.stdout.write("\n");
}

main().catch((err) => {
  process.stderr.write(`[generate-session-handoff] unhandled: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
