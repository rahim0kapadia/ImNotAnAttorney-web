/**
 * Cron Part 20: Batch Result Poller
 *
 * Polls Anthropic Batch API for cases with pending batch_ids.
 * Two flows:
 *   - Case Decoder (status = "generating"):     render HTML -> save -> trigger eval
 *   - IB Phase A  (status = "auto-generating"):  parse sections -> save -> trigger Phase B
 */
import type { CronContext, CronResult } from "./types";
import { emptyResult } from "./types";
import {
  pollBatch,
  fetchBatchResults,
  extractText,
} from "@/lib/batch-api";
import type { BatchResultSucceeded } from "@/lib/batch-api";
import { renderReportHtml } from "@/lib/report-renderer";
import { sendEmail } from "@/lib/email";

export async function pollBatchResults(
  ctx: CronContext
): Promise<CronResult> {
  const result = emptyResult();

  // Find cases with active batches
  const { data: pending } = await ctx.supabase
    .from("cases")
    .select("id, email, tier, status, batch_id, charge_type, intake_id")
    .not("batch_id", "is", null)
    .in("status", ["generating", "auto-generating"])
    .limit(20);

  if (!pending || pending.length === 0) return result;

  for (const row of pending) {
    try {
      const status = await pollBatch(row.batch_id);

      if (status.processing_status !== "ended") continue; // still running

      const batchResults = await fetchBatchResults(row.batch_id);

      if (row.status === "generating") {
        await processCDResult(ctx, row, batchResults);
      } else if (row.status === "auto-generating") {
        await processIBPhaseAResult(ctx, row, batchResults);
      }
      result.sent++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[batch-poller] Case ${row.id}: ${msg}`);
      result.errors++;
    }
  }

  return result;
}

// -- Case Decoder result processing --

async function processCDResult(
  ctx: CronContext,
  row: { id: string; email: string; batch_id: string; charge_type: string; intake_id: string },
  results: Awaited<ReturnType<typeof fetchBatchResults>>
) {
  const cdResult = results.find((r) => r.custom_id === `cd-${row.id}`);

  if (!cdResult || cdResult.result.type !== "succeeded") {
    const reason =
      cdResult?.result.type === "errored"
        ? (cdResult as unknown as { result: { error: { error: { message: string } } } }).result.error?.error?.message ?? "Unknown"
        : cdResult?.result.type ?? "No result";

    await ctx.supabase
      .from("cases")
      .update({ status: "generation-failed", batch_id: null, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    await sendEmail(
      {
        to: ctx.operatorEmail,
        subject: `BATCH FAILED: Case Decoder — ${row.email}`,
        html: `<p>Batch error for case ${row.id}: ${reason}</p>
          <p><strong>Retry:</strong></p>
          <code>curl -X POST ${ctx.siteUrl}/api/generate/case-decoder -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${row.id}","force":true}'</code>`,
      },
      { category: "operator-alert", case_id: row.id }
    );
    return;
  }

  const markdown = extractText(cdResult as BatchResultSucceeded);
  if (!markdown.trim()) {
    await ctx.supabase
      .from("cases")
      .update({ status: "generation-failed", batch_id: null, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return;
  }

  // Strip model-generated methodology notes (worker line 865 pattern).
  // Operates on bounded AI output (single report, 2-5KB). Not file I/O.
  const methodologyHeaders = [
    "methodology", "about this report",
    "how this report was generated", "disclaimer",
  ];
  const cleaned = stripSections(markdown, methodologyHeaders);

  // Fetch intake for rendering metadata
  const { data: intake } = await ctx.supabase
    .from("intakes")
    .select("first_name, charges, jurisdiction, case_number, court_date, arrest_date, charge_type")
    .eq("id", row.intake_id)
    .single();

  const now = new Date();
  const reportToken = crypto.randomUUID();
  const tokenExpiry = new Date(now);
  tokenExpiry.setFullYear(tokenExpiry.getFullYear() + 1);

  // Extract expert names from bounded AI output (single sentence match)
  const drawsIdx = cleaned.indexOf("draws on ");
  let expertNames = "";
  if (drawsIdx !== -1) {
    const after = cleaned.substring(drawsIdx + 9);
    const dotIdx = after.indexOf(".");
    const dashIdx = after.indexOf("\u2014"); // em dash
    const endIdx = dotIdx === -1 && dashIdx === -1
      ? after.length
      : dotIdx === -1 ? dashIdx : dashIdx === -1 ? dotIdx : Math.min(dotIdx, dashIdx);
    expertNames = after.substring(0, endIdx).trim();
  }

  const meta = {
    firstName: intake?.first_name ?? "Defendant",
    charges: intake?.charges ?? row.charge_type ?? "Unknown",
    jurisdiction: intake?.jurisdiction ?? "Unknown",
    caseNumber: intake?.case_number ?? "",
    courtDate: intake?.court_date ?? "",
    daysSinceArrest: intake?.arrest_date
      ? Math.floor((now.getTime() - new Date(intake.arrest_date).getTime()) / 86_400_000)
      : null,
    reportDate: now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    reportId: reportToken.slice(0, 8).toUpperCase(),
    chargeType: intake?.charge_type ?? row.charge_type ?? "",
    expertNames,
  };

  const reportHtml = renderReportHtml(cleaned, meta);

  await ctx.supabase
    .from("cases")
    .update({
      report_html: reportHtml,
      report_token: reportToken,
      generated_at: now.toISOString(),
      status: "review",
      charge_type: meta.chargeType,
      updated_at: now.toISOString(),
      report_token_expires_at: tokenExpiry.toISOString(),
      batch_id: null,
    })
    .eq("id", row.id);

  // Fire-and-forget: trigger evaluation
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/evaluate-report`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ caseId: row.id }),
  }).catch((e: unknown) =>
    console.error("[batch-poller] Eval trigger failed:", e)
  );

  // Operator notification
  const reportUrl = `${ctx.siteUrl}/report/${reportToken}`;
  await sendEmail(
    {
      to: ctx.operatorEmail,
      subject: `Case Decoder Ready — ${meta.firstName} (${meta.charges})`,
      html: `<p>Batch-generated report ready for review.</p>
        <p><a href="${reportUrl}">Preview Report</a> | <a href="${ctx.siteUrl}/api/deliver?caseId=${row.id}&token=$OPERATOR_SECRET">Approve &amp; Deliver</a></p>`,
    },
    { category: "operator-alert", case_id: row.id }
  );
}

// -- Intelligence Brief Phase A result processing --

async function processIBPhaseAResult(
  ctx: CronContext,
  row: { id: string; email: string; batch_id: string; tier: string },
  results: Awaited<ReturnType<typeof fetchBatchResults>>
) {
  const sectionKeys = [
    "case-roadmap",
    "whats-working",
    "legal-options",
    "protection",
    "court-prep",
  ];
  const sectionOutputs: Record<string, string> = {};
  let failures = 0;

  for (const key of sectionKeys) {
    const r = results.find((res) => res.custom_id === `ib-a-${key}`);
    if (r?.result.type === "succeeded") {
      sectionOutputs[key] = extractText(r as BatchResultSucceeded);
    } else {
      console.error(`[batch-poller] IB Phase A "${key}" failed for case ${row.id}`);
      failures++;
    }
  }

  // Abort threshold: 4+ failures (same as Edge Function)
  if (failures >= 4) {
    await ctx.supabase
      .from("cases")
      .update({ status: "generation-failed", batch_id: null, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    await sendEmail(
      {
        to: ctx.operatorEmail,
        subject: `IB Phase A FAILED (${failures}/5) — ${row.email}`,
        html: `<p>Case ${row.id}: ${failures}/5 Phase A sections failed.</p>
          <code>curl -X POST ${ctx.siteUrl}/api/generate/intelligence-brief -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${row.id}","force":true}'</code>`,
      },
      { category: "operator-alert", case_id: row.id }
    );
    return;
  }

  // Save section outputs + transition to compiling
  await ctx.supabase
    .from("cases")
    .update({
      section_outputs: sectionOutputs,
      status: "compiling",
      phase_a_completed_at: new Date().toISOString(),
      batch_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  // Fire-and-forget: trigger Phase B via Edge Function
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-report`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      caseId: row.id,
      tier: "intelligence-brief",
      phase: "B",
    }),
  }).catch((e: unknown) =>
    console.error("[batch-poller] Phase B trigger failed:", e)
  );
}

// -- Helpers --

/**
 * Strip markdown sections whose heading matches any of the given keywords.
 * Line-by-line processing (no regex on full content).
 * Operates on bounded AI-generated markdown.
 */
function stripSections(markdown: string, headerKeywords: string[]): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let skipping = false;

  for (const line of lines) {
    // Check if this line is a heading (h1-h3)
    if (line.startsWith("#")) {
      const headingText = line.replace(/^#{1,3}\s*/, "").toLowerCase().trim();
      const shouldSkip = headerKeywords.some((kw) => headingText.startsWith(kw));
      if (shouldSkip) {
        skipping = true;
        continue;
      }
      // New heading that isn't a skip target — stop skipping
      if (skipping && (line.startsWith("# ") || line.startsWith("## "))) {
        skipping = false;
      }
    }

    if (!skipping) {
      output.push(line);
    }
  }

  return output.join("\n");
}
