# Batch API + Prompt Caching Migration, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all Claude API calls from synchronous Messages API to asynchronous Batch API, 50% cost reduction on Case Decoder, ~25% on Intelligence Brief Phase A, fix deprecated `budget_tokens` thinking, and fix a missing anti-hallucination block bug in the worker.

**Architecture:** Decoupled submit/process. Edge Function and Worker become thin batch submitters (submit → save `batch_id` → exit). A new cron batch poller (every 5 min) handles ALL result processing (render HTML, save to Supabase, trigger eval). This eliminates the 150s Edge Function timeout constraint and centralizes result processing (DRY). IB Phase B stays synchronous due to sequential section dependencies.

**Tech Stack:** Next.js 15 (App Router), Supabase Edge Functions (Deno), Node.js ESM scripts, Anthropic Batch API (`/v1/messages/batches`)

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-03-27-batch-api-migration-design.md`

---

## Context

- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** Claude API costs ~$0.40-0.60 per Case Decoder report (Opus 4.6 + extended thinking). The Anthropic Batch API offers 50% off for async processing. Current code uses deprecated `budget_tokens` thinking format. The Edge Function has a 150s hard kill that causes generation failures on complex cases (250-294s).
- **Key files to read first:**
  1. `scripts/generate-worker.mjs`, backup worker (990 lines), raw `fetch()` to Messages API
  2. `supabase/functions/generate-report/index.ts`, primary Edge Function (~5194 lines)
  3. `src/lib/cron/operator-alerts.ts:128-184`, Part 5 stuck detection (30-min threshold)
  4. `src/app/api/cron/drip/route.ts`, cron orchestrator with task registry
  5. `src/lib/cron/types.ts`, CronContext, CronResult interfaces
- **Tech stack:** Next.js 15, Supabase (Deno Edge Functions), Node.js ESM workers, Anthropic API (raw `fetch`, no SDK)
- **Key decisions:**
  1. **Batch-first, not batch-optional.** All generation moves to batch. Batch submission is fast (<1s), the 150s timeout only affected synchronous generation.
  2. **Centralized result processing.** New cron poller handles ALL batch results (CD + IB Phase A). Eliminates rendering duplication between worker and Edge Function.
  3. **IB Phase B stays synchronous.** Sections are sequentially dependent (each builds on prior outputs). Batching sequential items adds 1-60 min latency per step, the 50% savings on 4 Sonnet calls (~$0.04) is not worth 4-240 min added delay.
  4. **Adaptive thinking for CD.** Edge Function comment says adaptive caused 600s+ times, but that was synchronous where timeout mattered. With batch, latency is irrelevant. Use `{type: "adaptive"}` + `output_config: {effort: "high"}`.
  5. **Prompt caching: limited benefit at current volume.** Each IB section has a UNIQUE system prompt (not shared as the spec assumed). Cross-section caching won't work. CD system prompt (~6K tokens) exceeds Opus's 4096-token cache minimum, so we structure it for caching, but hits only occur if multiple reports generate within 1h.
  6. **Separate cron endpoint.** Batch poller needs 5-min cadence (vs daily drip cron). New route at `/api/cron/batch-poll`, registered with cron-job.org.
- **Setup/prerequisites:**
  - **Top up API credits** at console.anthropic.com BEFORE Task 1 (QA finding H5: balance too low)
  - `.env.local` must have `ANTHROPIC_API_KEY`, `CRON_SECRET`, `CRONJOB_API_KEY`

## Approach Decision

**Chosen:** Decoupled submit/process with centralized cron poller

**Why:** Current architecture has rendering logic duplicated between Edge Function (`supabase/functions/generate-report/index.ts`) and Worker (`scripts/generate-worker.mjs`). By making both thin batch submitters and centralizing result processing in the cron poller, we get DRY result handling + eliminate the 150s timeout issue.

**Rejected alternatives:**
- **Worker inline polling** (worker submits + polls for 2h), rejected because it ties up the worker process and duplicates rendering logic
- **IB Phase B batch** (batch all 4 Phase B sections), rejected because sequential dependencies (each section needs prior output); 4 sequential batch submissions × 1-60 min each = 4-240 min vs ~30s synchronous
- **SDK migration** (raw fetch → @anthropic-ai/sdk), rejected because entire codebase uses raw fetch, Edge Function is Deno (no Node SDK), and adding a dependency adds risk without benefit
- **Phase B as independent sections** (restructure prompts to remove dependencies), rejected because the sequential dependency is semantic (your-plan references case-intelligence's gap analysis, questions references your-plan's exclusion list)

## Pre-existing Bugs Fixed During Migration

1. **Worker missing ANTI_HALLUCINATION_BLOCK**, Worker extracts `SYSTEM_PROMPT` from Edge Function source via string slicing but never extracts `ANTI_HALLUCINATION_BLOCK` (separate constant). Reports generated by backup worker lack 6 anti-hallucination safety rules. Fixed in Task 5.
2. **H4: Directive language**, System prompt says "do not show this report to your attorney" which is imperative/directive (UPL risk). Fixed in Task 6.

## Revised Cost Projections

The spec projected 67-83% savings on IB. That assumed shared system prompts across sections, research found each section has a unique system prompt. Revised:

| Tier | Current | After Batch | Savings |
|------|---------|-------------|---------|
| Case Decoder (1 Opus call) | $0.40-0.60 | $0.20-0.30 | 50% |
| Intelligence Brief (9 Sonnet calls) | $0.12-0.18 | $0.09-0.14 | 22-25% |

IB savings: 50% batch discount on Phase A (5 calls) only. Phase B (4 calls) stays synchronous at full price.

## Batch API Contract (Reference)

```
POST /v1/messages/batches         , Create batch (returns batch_id)
GET  /v1/messages/batches/{id}    , Poll status
GET  /v1/messages/batches/{id}/results, Fetch JSONL results (after ended)

Headers: x-api-key, anthropic-version: 2023-06-01, content-type: application/json

processing_status: "in_progress" | "canceling" | "ended"
Per-request result types: "succeeded" | "errored" | "canceled" | "expired"

Adaptive thinking:  { thinking: { type: "adaptive" }, output_config: { effort: "high" } }
Cache control:      system: [{ type: "text", text: "...", cache_control: { type: "ephemeral", ttl: "1h" } }]
Min cacheable:      Opus = 4,096 tokens, Sonnet = 2,048 tokens
```

## File Map

### New Files

| File | Purpose |
|------|---------|
| `scripts/test-batch-generation.mjs` | Validates batch + adaptive thinking quality before migration |
| `supabase/migrations/027-batch-id.sql` | Adds `batch_id TEXT` column to `cases` table |
| `src/lib/batch-api.ts` | Batch API types + utility functions (poll, fetch results, extract text) |
| `src/lib/report-renderer.ts` | Extracted CD report HTML renderer (used by cron poller) |
| `src/lib/cron/batch-poller.ts` | Cron task: polls batch results, renders, saves, triggers eval |
| `src/app/api/cron/batch-poll/route.ts` | Lightweight cron endpoint for 5-min batch polling |

### Modified Files

| File | Changes |
|------|---------|
| `scripts/generate-worker.mjs` | Batch submit + save `batch_id` + exit. Fix anti-hallucination extraction. |
| `supabase/functions/generate-report/index.ts` | CD: batch submit + exit. IB Phase A: 5-request batch + exit. Fix H4 directive. |
| `src/lib/cron/operator-alerts.ts` | Part 5: 30 min → 2h threshold. Skip cases with `batch_id` under 2h old. |
| `scripts/setup-cronjob-org.js` | Add `batch-poll` job (every 5 min) |

## Task Dependencies

```
Task 1 (test script) ─────────────────── independent
Task 2 (DB migration) ────┬───────────── independent
Task 3 (batch-api.ts) ────┤              independent
                           │
Task 4 (renderer + poller) ┤ depends on 2 + 3
Task 5 (worker migration) ─┤ depends on 2 + 3
                           │
Task 6 (Edge Function) ────┤ depends on 2 + 4
                           │
Task 7 (IB Phase A) ───────┤ depends on 6
Task 8 (Part 5 + QA) ──────┘ depends on 4
```

Tasks 1, 2, 3 are independent (can run in parallel).
Tasks 4+5 can run in parallel after 2+3.
Tasks 7+8 can run in parallel after 6+4.

---

## Tasks

### Task 1: Test Script, Validate Batch + Adaptive Thinking

**Files:**
- Create: `scripts/test-batch-generation.mjs`

**Prerequisites:** API credits must be topped up at console.anthropic.com first (H5).

- [ ] **Step 1: Create the test script**

```javascript
#!/usr/bin/env node
/**
 * Validates Batch API + Adaptive Thinking for Case Decoder.
 * Submits a single-request batch using the Danielle DUI persona,
 * polls for completion, then compares output quality to reference.
 *
 * Usage: node scripts/test-batch-generation.mjs
 * Prerequisites: ANTHROPIC_API_KEY in .env.local with sufficient credits
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("[test-batch] Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

const API_BASE = "https://api.anthropic.com";
const HEADERS = {
  "x-api-key": ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
};

// ── Extract system prompt + anti-hallucination block from Edge Function ──
const indexTsPath = path.join(__dirname, "..", "supabase", "functions", "generate-report", "index.ts");
const indexTs = fs.readFileSync(indexTsPath, "utf-8");

const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
if (sysStart === -1) throw new Error("Could not find SYSTEM_PROMPT in index.ts");
const sysEnd = indexTs.indexOf("`;", sysStart + 22);
const SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);

const ahStart = indexTs.indexOf("const ANTI_HALLUCINATION_BLOCK = `");
if (ahStart === -1) throw new Error("Could not find ANTI_HALLUCINATION_BLOCK in index.ts");
const ahEnd = indexTs.indexOf("`;", ahStart + 33);
const ANTI_HALLUCINATION_BLOCK = indexTs.slice(ahStart + 33, ahEnd);

const fullSystemPrompt = SYSTEM_PROMPT + ANTI_HALLUCINATION_BLOCK;
console.log(`[test-batch] System prompt: ${fullSystemPrompt.length} chars`);

// ── Test persona (Danielle, DUI first offense) ──
const testUserPrompt = `DEFENDANT INTAKE, CASE DECODER ($197)

Name: Danielle M.
Charge(s): DUI, First Offense (BAC 0.11%)
Jurisdiction: Maricopa County, Arizona
Arrest Date: 2026-03-15
Next Court Date: 2026-04-10
Case Number: CR2026-001234

Circumstances: Pulled over at a DUI checkpoint on Scottsdale Road around 11:30 PM on a Saturday. Had 3 glasses of wine at dinner. Field sobriety tests were performed. Breathalyzer showed 0.11%. Was cooperative with officers. No prior record. No accident involved.

Attorney Status: Hired a public defender but haven't met yet. First court date is arraignment.

Primary Concern: Will I lose my license? I need to drive to work.

Additional Context: Single mother, works as a nurse. Cannot afford to lose driving privileges. Worried about professional license implications.`;

// ── Submit batch ──
console.log("[test-batch] Submitting batch with adaptive thinking + cache_control...");
const startTime = Date.now();

const batchRes = await fetch(`${API_BASE}/v1/messages/batches`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({
    requests: [{
      custom_id: "test-cd-danielle",
      params: {
        model: "claude-opus-4-6",
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: [{
          type: "text",
          text: fullSystemPrompt,
          cache_control: { type: "ephemeral", ttl: "1h" },
        }],
        messages: [{ role: "user", content: testUserPrompt }],
      },
    }],
  }),
});

if (!batchRes.ok) {
  console.error(`[test-batch] Submission failed (${batchRes.status}): ${await batchRes.text()}`);
  process.exit(1);
}

const batch = await batchRes.json();
console.log(`[test-batch] Batch created: ${batch.id} (expires: ${batch.expires_at})`);

// ── Poll for completion ──
const POLL_MS = 30_000;
const MAX_MS = 2 * 60 * 60 * 1000;
let elapsed = 0;

while (elapsed < MAX_MS) {
  await new Promise((r) => setTimeout(r, POLL_MS));
  elapsed += POLL_MS;

  const pollRes = await fetch(`${API_BASE}/v1/messages/batches/${batch.id}`, { headers: HEADERS });
  const status = await pollRes.json();
  const mins = Math.round(elapsed / 60000);
  console.log(`[test-batch] [${mins}m] ${status.processing_status} | counts: ${JSON.stringify(status.request_counts)}`);

  if (status.processing_status === "ended") {
    const genTime = Date.now() - startTime;

    // Fetch results (JSONL)
    const resultsRes = await fetch(`${API_BASE}/v1/messages/batches/${batch.id}/results`, { headers: HEADERS });
    const resultsText = await resultsRes.text();
    const results = resultsText.trim().split("\n").map((line) => JSON.parse(line));
    const result = results.find((r) => r.custom_id === "test-cd-danielle");

    if (!result || result.result.type !== "succeeded") {
      console.error("[test-batch] FAILED:", JSON.stringify(result?.result, null, 2));
      process.exit(1);
    }

    const msg = result.result.message;
    const textBlocks = msg.content.filter((b) => b.type === "text");
    const thinkingBlocks = msg.content.filter((b) => b.type === "thinking");
    const markdown = textBlocks.map((b) => b.text).join("");

    // ── Metrics ──
    console.log("\n=== METRICS ===");
    console.log(`Generation time:  ${Math.round(genTime / 1000)}s`);
    console.log(`Input tokens:     ${msg.usage.input_tokens}`);
    console.log(`Output tokens:    ${msg.usage.output_tokens}`);
    console.log(`Cache read:       ${msg.usage.cache_read_input_tokens || 0}`);
    console.log(`Cache creation:   ${msg.usage.cache_creation_input_tokens || 0}`);
    console.log(`Thinking blocks:  ${thinkingBlocks.length}`);
    console.log(`Text length:      ${markdown.length} chars`);

    const inputCost = (msg.usage.input_tokens / 1_000_000) * 2.5;
    const outputCost = (msg.usage.output_tokens / 1_000_000) * 12.5;
    const cacheReadCost = ((msg.usage.cache_read_input_tokens || 0) / 1_000_000) * 0.25;
    console.log(`Estimated cost:   $${(inputCost + outputCost + cacheReadCost).toFixed(4)}`);

    // ── Section heading comparison ──
    const headings = markdown.match(/^## .+$/gm) || [];
    console.log(`\n=== SECTIONS (${headings.length}) ===`);
    headings.forEach((h) => console.log(h));

    const refPath = path.join(__dirname, "..", "test-reports", "persona-a-dui.html");
    if (fs.existsSync(refPath)) {
      const refHtml = fs.readFileSync(refPath, "utf-8");
      const refHeadings = (refHtml.match(/<h2[^>]*>(.+?)<\/h2>/g) || []).map((h) =>
        h.replace(/<[^>]+>/g, "").trim()
      );
      console.log(`\nReference sections (${refHeadings.length}):`);
      refHeadings.forEach((h) => console.log(`  ${h}`));
      const missing = refHeadings.filter(
        (rh) => !headings.some((h) => h.toLowerCase().includes(rh.toLowerCase().slice(0, 15)))
      );
      if (missing.length > 0) {
        console.warn(`\nWARNING, Missing sections: ${missing.join(", ")}`);
      } else {
        console.log("\nAll reference sections present.");
      }
    }

    // ── Save ──
    const outMd = path.join(__dirname, "..", "test-reports", "batch-test-report.md");
    const outMeta = path.join(__dirname, "..", "test-reports", "batch-test-report.meta.json");
    fs.writeFileSync(outMd, markdown);
    fs.writeFileSync(outMeta, JSON.stringify({ batchId: batch.id, usage: msg.usage, genTimeMs: genTime, cost: { input: inputCost, output: outputCost, cacheRead: cacheReadCost, total: inputCost + outputCost + cacheReadCost } }, null, 2));
    console.log(`\nSaved: ${outMd}`);
    console.log(`Saved: ${outMeta}`);
    process.exit(0);
  }
}

console.error("[test-batch] Batch did not complete within 2 hours.");
process.exit(1);
```

- [ ] **Step 2: Run the test script** (requires API credit top-up first)

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && node scripts/test-batch-generation.mjs
```

Expected: Batch submits, polls every 30s, completes within ~5-60 min, saves markdown to `test-reports/batch-test-report.md` and metrics to `test-reports/batch-test-report.meta.json`. Check:
- Section headings match reference (`persona-a-dui.html`)
- Cost estimate is ~$0.20-0.30 (50% of current ~$0.40-0.60)
- No empty text (adaptive thinking didn't consume all output tokens)

- [ ] **Step 3: Commit**

```bash
git add scripts/test-batch-generation.mjs
git commit -m "feat: add batch API + adaptive thinking test script

Validates batch submission, adaptive thinking quality, and prompt
caching structure before migrating production generation pipeline."
```

---

### Task 2: DB Migration, Add `batch_id` Column

**Files:**
- Create: `supabase/migrations/027-batch-id.sql`

- [ ] **Step 1: Write migration SQL**

```sql
, Migration 027: Add batch_id for Anthropic Batch API integration.
, Stores the batch ID for async generation polling by cron batch poller.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS batch_id text;

, Partial index: only rows with active batches (used by poller query)
CREATE INDEX IF NOT EXISTS idx_cases_batch_id
  ON cases (batch_id)
  WHERE batch_id IS NOT NULL;
```

- [ ] **Step 2: Apply via Supabase Management API**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/027-batch-id.sql', 'utf-8');
fetch('https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + require('dotenv').config({path:'.env.local'}).parsed.SUPABASE_MANAGEMENT_TOKEN,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(console.error);
"
```

If `SUPABASE_MANAGEMENT_TOKEN` is not in `.env.local`, check `C:\Users\email\.claude\CLAUDE.md` for the `sbp_` token and use it directly.

- [ ] **Step 3: Verify column exists**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path:'.env.local'});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('cases').select('batch_id').limit(1).then(({data,error}) => {
  if (error) console.error('FAIL:', error.message);
  else console.log('OK, batch_id column exists');
});
"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/027-batch-id.sql
git commit -m "feat(db): add batch_id column to cases table

Stores Anthropic batch ID for async generation polling.
Partial index on non-null batch_id for cron poller queries."
```

---

### Task 3: Batch API Utility Module

**Files:**
- Create: `src/lib/batch-api.ts`

- [ ] **Step 1: Write the batch API utility module**

```typescript
/**
 * Anthropic Batch API utilities, types + helper functions.
 * Used by cron batch poller for polling and result fetching.
 *
 * Batch API contract:
 *   POST /v1/messages/batches          , create batch
 *   GET  /v1/messages/batches/{id}     , poll status
 *   GET  /v1/messages/batches/{id}/results, fetch JSONL results
 */

// ── Types ──

export interface BatchRequestParams {
  model: string;
  max_tokens: number;
  thinking?: { type: "adaptive" };
  output_config?: { effort: string };
  temperature?: number;
  system:
    | string
    | Array<{
        type: "text";
        text: string;
        cache_control?: { type: "ephemeral"; ttl: string };
      }>;
  messages: Array<{ role: string; content: string }>;
}

export interface BatchRequest {
  custom_id: string;
  params: BatchRequestParams;
}

export interface BatchStatus {
  id: string;
  type: "message_batch";
  processing_status: "in_progress" | "canceling" | "ended";
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  ended_at: string | null;
  created_at: string;
  expires_at: string;
  results_url: string | null;
}

export interface BatchResultSucceeded {
  custom_id: string;
  result: {
    type: "succeeded";
    message: {
      content: Array<{ type: string; text?: string; thinking?: string }>;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };
  };
}

export interface BatchResultErrored {
  custom_id: string;
  result: {
    type: "errored";
    error: { type: string; error: { type: string; message: string } };
  };
}

export interface BatchResultExpiredOrCanceled {
  custom_id: string;
  result: { type: "expired" | "canceled" };
}

export type BatchResultLine =
  | BatchResultSucceeded
  | BatchResultErrored
  | BatchResultExpiredOrCanceled;

// ── Helpers ──

const API_BASE = "https://api.anthropic.com";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");
  return {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
}

/** Poll a batch by ID. Returns current status. */
export async function pollBatch(batchId: string): Promise<BatchStatus> {
  const res = await fetch(`${API_BASE}/v1/messages/batches/${batchId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Batch poll failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<BatchStatus>;
}

/** Fetch JSONL results. Only call after processing_status === "ended". */
export async function fetchBatchResults(
  batchId: string
): Promise<BatchResultLine[]> {
  const res = await fetch(
    `${API_BASE}/v1/messages/batches/${batchId}/results`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    throw new Error(
      `Batch results fetch failed (${res.status}): ${await res.text()}`
    );
  }
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as BatchResultLine);
}

/** Extract joined text content from a succeeded batch result. */
export function extractText(result: BatchResultSucceeded): string {
  return result.result.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && npx tsc,noEmit,skipLibCheck
```

Expected: No errors related to `batch-api.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/batch-api.ts
git commit -m "feat: add Batch API utility module (types + poll/fetch helpers)"
```

---

### Task 4: Report Renderer + Cron Batch Poller

**Files:**
- Create: `src/lib/report-renderer.ts`
- Create: `src/lib/cron/batch-poller.ts`
- Create: `src/app/api/cron/batch-poll/route.ts`
- Modify: `scripts/setup-cronjob-org.js`

**Depends on:** Tasks 2 (batch_id column) and 3 (batch-api module).

- [ ] **Step 1: Create the report renderer** (extracted from `scripts/generate-worker.mjs:600-686`)

```typescript
/**
 * Case Decoder report HTML renderer.
 * Extracted from generate-worker.mjs for shared use by cron batch poller.
 * Dark theme, print-friendly, branded layout.
 */

export interface ReportMeta {
  firstName: string;
  charges: string;
  jurisdiction: string;
  caseNumber: string;
  courtDate: string;
  daysSinceArrest: number | null;
  reportDate: string;
  reportId: string;
  chargeType: string;
  expertNames: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderReportHtml(markdown: string, meta: ReportMeta): string {
  let html = markdown
    .replace(
      /^#### (.+)$/gm,
      '<h4 style="color: #F59E0B; font-size: 14px; margin-top: 20px;">$1</h4>'
    )
    .replace(
      /^### (.+)$/gm,
      '<h3 style="color: white; font-size: 16px; margin-top: 24px;">$1</h3>'
    )
    .replace(
      /^## (.+)$/gm,
      '<h2 style="color: #F59E0B; font-size: 20px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272A;">$1</h2>'
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: white;">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /^> (.+)$/gm,
      '<blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0; color: #A1A1AA;">$1</blockquote>'
    )
    .replace(
      /^- \[x\] (.+)$/gm,
      '<li style="margin-bottom: 4px; list-style: none;">&#9745; $1</li>'
    )
    .replace(
      /^- \[ \] (.+)$/gm,
      '<li style="margin-bottom: 4px; list-style: none;">&#9744; $1</li>'
    )
    .replace(
      /^- (.+)$/gm,
      '<li style="margin-bottom: 4px;">$1</li>'
    )
    .replace(
      /^\d+\. (.+)$/gm,
      '<li style="margin-bottom: 4px;">$1</li>'
    )
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match
        .split("|")
        .filter(Boolean)
        .map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return "";
      const isHeader = cells.some((c) => c.startsWith("**") || c === "#");
      const tag = isHeader ? "th" : "td";
      const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
      return `<tr>${cells.map((c) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`;
    })
    .replace(
      /^(?!<[a-z]|$)(.+)$/gm,
      '<p style="margin: 8px 0; line-height: 1.6;">$1</p>'
    );

  html = html.replace(
    /(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
    '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">$1</table>'
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Case Decoder Report, ${escapeHtml(meta.firstName)}</title>
<style>
  @media print {
    body { background: white !important; color: #1a1a1a !important; }
    * { color: #1a1a1a !important; }
    h2, h3, h4 { color: #92400e !important; }
    strong { color: #1a1a1a !important; }
    blockquote { border-left-color: #92400e !important; }
    table, th, td { border-color: #d4d4d4 !important; }
    .no-print { display: none !important; }
    .header-block { background: #f5f5f4 !important; border-color: #92400e !important; }
    a { color: #92400e !important; }
  }
</style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0C0A09; color: #D4D4D8; margin: 0; padding: 0;">
<div style="max-width: 800px; margin: 0 auto; padding: 32px 24px;">
  <div class="header-block" style="background: #1C1917; padding: 32px; border-radius: 12px; border: 2px solid #F59E0B; margin-bottom: 32px; text-align: center;">
    <h1 style="color: #F59E0B; font-size: 28px; margin: 0;">CASE DECODER REPORT</h1>
    <p style="color: #A1A1AA; margin: 8px 0 0; font-size: 14px;">ImNotAnAttorney | We Research. You Ask.</p>
    <div style="margin-top: 24px; text-align: left;">
      <p style="margin: 4px 0;"><strong style="color: white;">Prepared for:</strong> ${escapeHtml(meta.firstName)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Charge(s):</strong> ${escapeHtml(meta.charges)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Jurisdiction:</strong> ${escapeHtml(meta.jurisdiction)}</p>
      ${meta.caseNumber ? `<p style="margin: 4px 0;"><strong style="color: white;">Case Number:</strong> ${escapeHtml(meta.caseNumber)}</p>` : ""}
      ${meta.courtDate ? `<p style="margin: 4px 0;"><strong style="color: white;">Next Court Date:</strong> ${escapeHtml(meta.courtDate)}</p>` : ""}
      ${meta.daysSinceArrest != null ? `<p style="margin: 4px 0;"><strong style="color: white;">Days Since Arrest:</strong> ${meta.daysSinceArrest}</p>` : ""}
      <p style="margin: 4px 0;"><strong style="color: white;">Report Date:</strong> ${escapeHtml(meta.reportDate)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Report ID:</strong> ${escapeHtml(meta.reportId)}</p>
    </div>
  </div>
  ${meta.expertNames ? `<blockquote style="border-left: 3px solid #F59E0B; padding: 16px; margin: 24px 0; background: #1C1917; border-radius: 0 8px 8px 0;">
    <p style="margin: 0 0 12px; color: #F59E0B; font-weight: bold;">METHODOLOGY NOTE</p>
    <p style="margin: 0 0 12px; color: #A1A1AA;">Every question and framework in this report traces to documented winning methods from elite criminal defense attorneys. Your report draws on ${escapeHtml(meta.expertNames)}, selected for ${escapeHtml(meta.chargeType || meta.charges)} cases. Expert attributions appear throughout.</p>
    <p style="margin: 0; color: #A1A1AA;"><strong style="color: white;">Important:</strong> This report provides legal INFORMATION, not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.</p>
  </blockquote>` : ""}
  ${html}
  <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 40px; border-left: 4px solid #A1A1AA;">
    <p style="margin: 0; font-size: 13px; color: #71717A;">
      <strong style="color: #A1A1AA;">A note on what this is:</strong> This report gives you legal information, context, and questions, not legal advice. We can't tell you what to do. What we can do is make sure you walk into your next conversation informed, prepared, and asking the right things. Your attorney has your case file, your courtroom, and your judge. This report makes sure you know what to ask them, and why it matters.
    </p>
  </div>
  <div style="margin-top: 48px; padding-top: 24px; border-top: 2px solid #27272A; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #71717A;">&copy; ${new Date().getFullYear()} ImNotAnAttorney. Legal information, not legal advice.</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #52525B;">Report ID: ${meta.reportId} | Generated: ${meta.reportDate}</p>
  </div>
  <div class="no-print" style="margin-top: 32px; text-align: center;">
    <p style="margin: 0 0 12px; font-size: 14px; color: #A1A1AA;">After your meeting, if you want to verify your attorney's answers against the evidence:</p>
    <a href="/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Case Intelligence Brief, $997 ($800 after credit)</a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is fully credited toward any tier within 12 months. No pressure, decide after your meeting.</p>
  </div>
</div>
</body>
</html>`;
}
```

- [ ] **Step 2: Create the cron batch poller**

```typescript
/**
 * Cron Part 20: Batch Result Poller
 *
 * Polls Anthropic Batch API for cases with pending batch_ids.
 * Two flows:
 *   - Case Decoder (status = "generating"):     render HTML → save → trigger eval
 *   - IB Phase A  (status = "auto-generating"):  parse sections → save → trigger Phase B
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

// ── Case Decoder result processing ──

async function processCDResult(
  ctx: CronContext,
  row: { id: string; email: string; batch_id: string; charge_type: string; intake_id: string },
  results: Awaited<ReturnType<typeof fetchBatchResults>>
) {
  const cdResult = results.find((r) => r.custom_id === `cd-${row.id}`);

  if (!cdResult || cdResult.result.type !== "succeeded") {
    const reason =
      cdResult?.result.type === "errored"
        ? (cdResult as any).result.error?.error?.message ?? "Unknown"
        : cdResult?.result.type ?? "No result";

    await ctx.supabase
      .from("cases")
      .update({ status: "generation-failed", batch_id: null, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    await sendEmail(
      {
        to: ctx.operatorEmail,
        subject: `BATCH FAILED: Case Decoder, ${row.email}`,
        html: `<p>Batch error for case ${row.id}: ${reason}</p>
          <p><strong>Retry:</strong></p>
          <code>curl -X POST ${ctx.siteUrl}/api/generate/case-decoder -H "Content-Type: application/json" -H "Authorization: Bearer ${ctx.operatorSecret}" -d '{"caseId":"${row.id}","force":true}'</code>`,
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

  // Strip model-generated methodology notes (worker line 865 pattern)
  const cleaned = markdown.replace(
    /^#{1,3}\s*(?:methodology|about this report|how this report was generated|disclaimer).*?(?=^#{1,2}\s|\Z)/gimsu,
    ""
  );

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

  const expertMatch = cleaned.match(/draws on (.+?)(?:\.|, )/);
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
    expertNames: expertMatch?.[1] ?? "",
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
      subject: `Case Decoder Ready, ${meta.firstName} (${meta.charges})`,
      html: `<p>Batch-generated report ready for review.</p>
        <p><a href="${reportUrl}">Preview Report</a> | <a href="${ctx.siteUrl}/api/deliver?caseId=${row.id}&token=${ctx.operatorSecret}">Approve &amp; Deliver</a></p>`,
    },
    { category: "operator-alert", case_id: row.id }
  );
}

// ── Intelligence Brief Phase A result processing ──

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
    const r = results.find((r) => r.custom_id === `ib-a-${key}`);
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
        subject: `IB Phase A FAILED (${failures}/5), ${row.email}`,
        html: `<p>Case ${row.id}: ${failures}/5 Phase A sections failed.</p>
          <code>curl -X POST ${ctx.siteUrl}/api/generate/intelligence-brief -H "Content-Type: application/json" -H "Authorization: Bearer ${ctx.operatorSecret}" -d '{"caseId":"${row.id}","force":true}'</code>`,
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
```

- [ ] **Step 3: Create the cron endpoint**

```typescript
/**
 * @file /api/cron/batch-poll, Batch result polling (every 5 min)
 *
 * Lightweight endpoint that only runs the batch poller task.
 * Registered with cron-job.org at */5 * * * * cadence.
 * Protected by CRON_SECRET bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { pollBatchResults } from "@/lib/cron/batch-poller";
import type { CronContext } from "@/lib/cron/types";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const now = new Date();

  const ctx: CronContext = {
    supabase,
    operatorEmail: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com",
    operatorSecret: process.env.OPERATOR_SECRET || "",
    now,
  };

  try {
    const result = await pollBatchResults(ctx);
    return NextResponse.json({
      success: true,
      ...result,
      ts: now.toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[batch-poll] Fatal:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
```

Write this to `src/app/api/cron/batch-poll/route.ts`.

- [ ] **Step 4: Register batch-poll job with cron-job.org**

Add the new job to `scripts/setup-cronjob-org.js` in the `CRON_JOBS` array:

Find:
```javascript
  {
    name: 'generate-backup',
    schedule: {
      minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
      hours: [-1],
    },
    timeout: 30,
    description: 'Dispatch backup report generator (stuck Case Decoder recovery)',
  },
];
```

Replace with:
```javascript
  {
    name: 'generate-backup',
    schedule: {
      minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
      hours: [-1],
    },
    timeout: 30,
    description: 'Dispatch backup report generator (stuck Case Decoder recovery)',
  },
  {
    name: 'batch-poll',
    schedule: {
      minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
      hours: [-1],
    },
    timeout: 30,
    description: 'Poll Anthropic Batch API results, processes completed CD + IB Phase A batches',
  },
];
```

Then register the new job:

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && node -e "
const fs = require('fs');
const path = require('path');
function loadEnv() {
  const lines = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    let val = t.substring(eq + 1).trim();
    if ((val.startsWith('\"') && val.endsWith('\"')) || (val.startsWith(\"'\") && val.endsWith(\"'\"))) val = val.slice(1, -1);
    env[t.substring(0, eq).trim()] = val;
  }
  return env;
}
const env = loadEnv();
const baseUrl = env.NEXT_PUBLIC_SITE_URL || 'https://imnotanattorney.com';
fetch('https://api.cron-job.org/jobs', {
  method: 'PUT',
  headers: { 'Authorization': 'Bearer ' + env.CRONJOB_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    job: {
      url: baseUrl + '/api/cron/batch-poll',
      title: 'ImNotAnAttorney: batch-poll',
      enabled: true,
      saveResponses: true,
      schedule: { timezone: 'UTC', mdays: [-1], wdays: [-1], months: [-1], hours: [-1], minutes: [0,5,10,15,20,25,30,35,40,45,50,55] },
      extendedData: { headers: { 'Authorization': 'Bearer ' + env.CRON_SECRET, 'Content-Type': 'application/json' } },
      requestMethod: 0,
      requestTimeout: 30,
    },
  }),
}).then(r => r.json()).then(d => console.log('Created batch-poll job:', JSON.stringify(d))).catch(console.error);
"
```

- [ ] **Step 5: TypeScript check**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && npx tsc,noEmit,skipLibCheck
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/report-renderer.ts src/lib/cron/batch-poller.ts src/app/api/cron/batch-poll/route.ts scripts/setup-cronjob-org.js
git commit -m "feat: add cron batch poller, polls Anthropic Batch API results every 5 min

Centralized result processor for both Case Decoder and IB Phase A batches.
Renders HTML, saves to Supabase, triggers evaluation.
Registered with cron-job.org at */5 cadence."
```

---

### Task 5: Worker Migration, Batch Submit + Exit

**Files:**
- Modify: `scripts/generate-worker.mjs`

**Depends on:** Tasks 2 (batch_id column) and 3 (batch-api types for reference).

The worker becomes a thin batch submitter: submit batch → save `batch_id` → exit. The cron poller handles result processing.

- [ ] **Step 1: Fix ANTI_HALLUCINATION_BLOCK extraction** (pre-existing bug)

In `scripts/generate-worker.mjs`, find the system prompt extraction block (lines 89-108):

```javascript
const indexTsPath = path.join(__dirname, "..", "supabase", "functions", "generate-report", "index.ts");
let SYSTEM_PROMPT;

try {
  const indexTs = fs.readFileSync(indexTsPath, "utf-8");
  const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
  if (sysStart === -1) throw new Error("Could not find SYSTEM_PROMPT in index.ts");
  const sysEnd = indexTs.indexOf("`;", sysStart + 22);
  if (sysEnd === -1) throw new Error("Could not find closing backtick for SYSTEM_PROMPT");
  SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);
  console.log(`[worker] Extracted SYSTEM_PROMPT (${SYSTEM_PROMPT.length} chars)`);
} catch (err) {
  console.error(`[worker] Failed to extract SYSTEM_PROMPT from ${indexTsPath}:`, err.message);
  process.exit(1);
}
```

Replace with:

```javascript
const indexTsPath = path.join(__dirname, "..", "supabase", "functions", "generate-report", "index.ts");
let SYSTEM_PROMPT;
let ANTI_HALLUCINATION_BLOCK;

try {
  const indexTs = fs.readFileSync(indexTsPath, "utf-8");

  // Extract SYSTEM_PROMPT
  const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
  if (sysStart === -1) throw new Error("Could not find SYSTEM_PROMPT in index.ts");
  const sysEnd = indexTs.indexOf("`;", sysStart + 22);
  if (sysEnd === -1) throw new Error("Could not find closing backtick for SYSTEM_PROMPT");
  SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);
  console.log(`[worker] Extracted SYSTEM_PROMPT (${SYSTEM_PROMPT.length} chars)`);

  // Extract ANTI_HALLUCINATION_BLOCK (was missing, bug fix)
  const ahStart = indexTs.indexOf("const ANTI_HALLUCINATION_BLOCK = `");
  if (ahStart === -1) throw new Error("Could not find ANTI_HALLUCINATION_BLOCK in index.ts");
  const ahEnd = indexTs.indexOf("`;", ahStart + 33);
  if (ahEnd === -1) throw new Error("Could not find closing backtick for ANTI_HALLUCINATION_BLOCK");
  ANTI_HALLUCINATION_BLOCK = indexTs.slice(ahStart + 33, ahEnd);
  console.log(`[worker] Extracted ANTI_HALLUCINATION_BLOCK (${ANTI_HALLUCINATION_BLOCK.length} chars)`);
} catch (err) {
  console.error(`[worker] Failed to extract prompts from ${indexTsPath}:`, err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Replace the sync Claude API call with batch submission**

Find the Claude API call block (lines 776-860, inside the `for` retry loop). Replace the entire retry loop and response handling with batch submission. Find:

```javascript
  // Step 4: Call Claude API with retry on 529
  const MAX_RETRIES = 3;
  let markdown = null;
  let usage = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const apiStart = Date.now();
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 32000,
          thinking: { type: "enabled", budget_tokens: 16000 },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
```

Replace (from `// Step 4:` through the end of the retry loop, up to but not including the `// Step 5:` or rendering section) with:

```javascript
  // Step 4: Submit batch request (poller handles result processing)
  const fullSystemPrompt = SYSTEM_PROMPT + ANTI_HALLUCINATION_BLOCK;
  console.log(`[worker] Full system prompt: ${fullSystemPrompt.length} chars`);

  const MAX_RETRIES = 3;
  let batchId = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages/batches", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          requests: [{
            custom_id: `cd-${caseData.id}`,
            params: {
              model: "claude-opus-4-6",
              max_tokens: 32000,
              thinking: { type: "adaptive" },
              output_config: { effort: "high" },
              system: [{
                type: "text",
                text: fullSystemPrompt,
                cache_control: { type: "ephemeral", ttl: "1h" },
              }],
              messages: [{ role: "user", content: userPrompt }],
            },
          }],
        }),
      });

      if (response.status === 529 && attempt < MAX_RETRIES) {
        const backoff = attempt * 5;
        console.log(`[worker] Batch API overloaded (attempt ${attempt}/${MAX_RETRIES}), retrying in ${backoff}s...`);
        await new Promise((r) => setTimeout(r, backoff * 1000));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Batch API error (${response.status}): ${errText}`);
      }

      const batch = await response.json();
      batchId = batch.id;
      console.log(`[worker] Batch submitted: ${batchId} (expires: ${batch.expires_at})`);
      break;
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        console.error(`[worker] Batch submission failed after ${MAX_RETRIES} attempts:`, err.message);
        await supabase
          .from("cases")
          .update({ status: "generation-failed", updated_at: new Date().toISOString() })
          .eq("id", caseData.id);
        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `[Worker] Batch submission failed: ${caseData.email}`,
          html: `<h1 style="color: #EF4444;">Batch Submission Failed</h1>
            <p>Case ID: ${caseData.id}</p><p>Error: ${err.message}</p>`,
        });
        process.exit(1);
      }
      const backoff = attempt * 5;
      console.log(`[worker] Attempt ${attempt} failed, retrying in ${backoff}s...`);
      await new Promise((r) => setTimeout(r, backoff * 1000));
    }
  }

  // Step 5: Save batch_id and exit, cron poller handles result processing
  await supabase
    .from("cases")
    .update({ batch_id: batchId, updated_at: new Date().toISOString() })
    .eq("id", caseData.id);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[worker] Batch ${batchId} saved to case ${caseData.id}. Exiting (${elapsed}s). Cron poller will process results.`);
  process.exit(0);
```

- [ ] **Step 3: Remove the now-dead code below Step 5**

Everything after the batch submission (the old rendering, validation, Supabase save, operator email, eval trigger, approximately lines 860-990) should be removed since the cron poller now handles all result processing. Find the comment `// Step 5:` (or the rendering section starting with `// Strip model-generated methodology`) and delete everything from there to the end of `main()`, EXCEPT the final error handler:

Keep:
```javascript
}

main().catch((err) => {
  console.error("[worker] Fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 4: Also update the stuck-case query to skip cases that already have a batch_id**

Find the query (around line 697-705):
```javascript
  const { data: stuckCases, error: queryErr } = await supabase
    .from("cases")
    .select("id, email, intake_id, tier, status, updated_at")
    .eq("status", "generating")
    .lt("updated_at", threeMinAgo)
    .order("updated_at", { ascending: true })
    .limit(1);
```

Replace with:
```javascript
  const { data: stuckCases, error: queryErr } = await supabase
    .from("cases")
    .select("id, email, intake_id, tier, status, updated_at, batch_id")
    .eq("status", "generating")
    .is("batch_id", null)
    .lt("updated_at", threeMinAgo)
    .order("updated_at", { ascending: true })
    .limit(1);
```

The `.is("batch_id", null)` ensures the worker only picks up cases that don't already have a batch submitted.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-worker.mjs
git commit -m "feat(worker): migrate to Batch API, submit + exit pattern

- Fix: extract ANTI_HALLUCINATION_BLOCK (was missing, pre-existing bug)
- Replace sync Messages API call with Batch API submission
- Migrate thinking: budget_tokens → adaptive (type: adaptive, effort: high)
- Add cache_control on system prompt (1h TTL ephemeral)
- Worker now submits batch, saves batch_id, exits immediately
- Cron batch poller handles result processing (DRY)
- Skip cases with existing batch_id (avoid duplicate submissions)"
```

---

### Task 6: Edge Function CD Migration, Batch Submit + Exit

**Files:**
- Modify: `supabase/functions/generate-report/index.ts`

**Depends on:** Tasks 2 (batch_id column) and 4 (poller to process results).

The CD path in the Edge Function becomes a thin batch submitter. The existing `callClaudeAPI` function is preserved for IB Phase B (synchronous).

- [ ] **Step 1: Add a batch submission function alongside existing `callClaudeAPI`**

After `callClaudeAPI` (around line 3002), add:

```typescript
/**
 * Submit a Case Decoder report as a Batch API request.
 * Returns the batch ID. Cron poller handles result processing.
 */
async function submitCDBatch(
  intake: IntakeData,
  apiKey: string,
  supabaseUrl: string,
  supabaseKey: string,
  caseId: string
): Promise<string> {
  const userPrompt = await buildUserPrompt(intake, supabaseUrl, supabaseKey, caseId);
  const fullSystemPrompt = SYSTEM_PROMPT + ANTI_HALLUCINATION_BLOCK;

  const response = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      requests: [{
        custom_id: `cd-${caseId}`,
        params: {
          model: "claude-opus-4-6",
          max_tokens: 32000,
          thinking: { type: "adaptive" },
          output_config: { effort: "high" },
          system: [{
            type: "text",
            text: fullSystemPrompt,
            cache_control: { type: "ephemeral", ttl: "1h" },
          }],
          messages: [{ role: "user", content: userPrompt }],
        },
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Batch API error (${response.status}): ${err}`);
  }

  const batch = await response.json();
  console.log(`[generate-report] Batch submitted: ${batch.id}`);
  return batch.id;
}
```

- [ ] **Step 2: Update the CD handler to use batch submission**

Find the main Case Decoder handler (around line 4989). The current pattern is:

```typescript
    const reportMarkdown = await callClaudeAPI(intake, apiKey, supabaseUrl, supabaseKey, caseId);
```

Replace the CD handler block, from where it calls `callClaudeAPI` through the rendering, validation, Supabase save, and eval trigger, with:

```typescript
    // Submit batch and exit, cron poller handles result processing
    const batchId = await submitCDBatch(intake, apiKey, supabaseUrl, supabaseKey, caseId);

    // Save batch_id to case record
    const supabaseClient = createClient(supabaseUrl, supabaseKey);
    await supabaseClient
      .from("cases")
      .update({ batch_id: batchId, updated_at: new Date().toISOString() })
      .eq("id", caseId);

    return new Response(
      JSON.stringify({ success: true, batchId, message: "Batch submitted, poller will process results" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
```

The old synchronous flow (callClaudeAPI → render → validate → save → eval) becomes dead code for CD. Remove it or wrap in a `// DEPRECATED: synchronous fallback (removed, now batch-only)` comment block for reference during migration.

**Important:** The CD handler's error catch block should still set `status: "generation-failed"` on batch submission failures. Keep that pattern.

- [ ] **Step 3: Fix H4, directive language in system prompt**

In `SYSTEM_PROMPT` (around line 290+), search for text containing "do not show this report to your attorney" or similar directive language. Replace any imperative directive with informational framing:

Find:
```
do not show this report to your attorney
```

Replace with:
```
This report is designed to help you prepare for conversations with your attorney, sharing it is entirely your choice
```

Search the full `SYSTEM_PROMPT` for other directive patterns ("do not", "you must not", "never tell your attorney") and reframe each as informational.

- [ ] **Step 4: Commit**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && git add supabase/functions/generate-report/index.ts
git commit -m "feat(edge-fn): migrate CD to Batch API, submit + exit

- Add submitCDBatch(), submits single-request batch with adaptive thinking
- CD handler now submits batch, saves batch_id, returns immediately
- Eliminates 150s timeout constraint (batch submission < 1s)
- Fix H4: replace directive 'do not show' with informational framing
- callClaudeAPI() preserved for IB Phase B (synchronous)"
```

---

### Task 7: IB Phase A Batch Migration

**Files:**
- Modify: `supabase/functions/generate-report/index.ts`

**Depends on:** Task 6 (Edge Function already modified).

Phase A's 5 parallel Claude calls become a single 5-request batch. Phase B stays synchronous (sequential dependencies).

- [ ] **Step 1: Modify `handleIBPhaseA` to submit a batch**

Find the section in `handleIBPhaseA` (around line 3665+) where it builds Phase A section configs and runs them in parallel via `Promise.allSettled`. The current pattern is approximately:

```typescript
    // Run Phase A sections in parallel
    const promises = phaseAConfigs.map(cfg =>
      callClaudeForSection(cfg.systemPrompt, cfg.userPrompt, cfg.model, cfg.temperature, cfg.maxTokens, apiKey)
    );
    const results = await Promise.allSettled(promises);
```

Replace the parallel execution and all subsequent result handling (retries, section_outputs saving, status transition, Phase B trigger) with:

```typescript
    // Submit Phase A as a single 5-request batch
    const batchRequests = phaseAConfigs.map((cfg: { key: string; systemPrompt: string; userPrompt: string; model: string; temperature: number; maxTokens: number }) => ({
      custom_id: `ib-a-${cfg.key}`,
      params: {
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
        system: cfg.systemPrompt + ANTI_HALLUCINATION_BLOCK,
        messages: [{ role: "user", content: cfg.userPrompt }],
      },
    }));

    const batchResponse = await fetch("https://api.anthropic.com/v1/messages/batches", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ requests: batchRequests }),
    });

    if (!batchResponse.ok) {
      const err = await batchResponse.text();
      throw new Error(`IB Phase A batch submission failed (${batchResponse.status}): ${err}`);
    }

    const batch = await batchResponse.json();
    console.log(`[generate-report] IB Phase A batch submitted: ${batch.id} (5 sections)`);

    // Save batch_id, cron poller handles result processing + Phase B trigger
    const supabaseClient = createClient(supabaseUrl, supabaseKey);
    await supabaseClient
      .from("cases")
      .update({ batch_id: batch.id, updated_at: new Date().toISOString() })
      .eq("id", caseId);

    return new Response(
      JSON.stringify({ success: true, batchId: batch.id, phase: "A", message: "Phase A batch submitted" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
```

Remove the old Phase A code: `Promise.allSettled`, retry logic, section_outputs saving, status transition to "compiling", Phase B trigger, operator email, customer micro-delivery. All of this is now handled by the cron poller (Task 4).

**Important:** The section config building code (variable assembly, prompt building) stays, only the execution and result handling changes.

- [ ] **Step 2: Verify Phase B is unchanged**

`handleIBPhaseB` (around line 3865) must remain synchronous, it calls `callClaudeForSection` sequentially for each section. Verify this function is NOT modified. Phase B runs sequentially because:
- `case-intelligence` needs all Phase A outputs
- `your-plan` needs `case-intelligence` output
- `questions` needs `your-plan` output
- `48hr-priorities` needs all prior outputs

- [ ] **Step 3: Commit**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && git add supabase/functions/generate-report/index.ts
git commit -m "feat(edge-fn): migrate IB Phase A to Batch API, 5-request batch

Phase A's 5 parallel Claude calls → single 5-request batch submission.
Cron poller processes results, saves section_outputs, triggers Phase B.
Phase B stays synchronous (sequential section dependencies)."
```

---

### Task 8: Stuck Detection Adaptation + QA Fixes

**Files:**
- Modify: `src/lib/cron/operator-alerts.ts`
- Modify: `src/app/checkout/page.tsx`
- Modify: `src/app/sample/page.tsx`
- Modify: `src/lib/drip-emails.ts`

**Depends on:** Task 4 (poller exists).

- [ ] **Step 1: Update Part 5 stuck detection threshold from 30 min to 2h**

In `src/lib/cron/operator-alerts.ts`, find `detectStuckGenerating` (line 131):

```typescript
  const thirtyMinAgo = new Date(ctx.now);
  thirtyMinAgo.setMinutes(thirtyMinAgo.getMinutes() - 30);
```

Replace with:

```typescript
  const twoHoursAgo = new Date(ctx.now);
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
```

And update the query (line 137-141):

```typescript
  const { data: stuckGenerating } = await ctx.supabase
    .from("cases")
    .select("id, email, charge_type, tier, updated_at")
    .eq("status", "generating")
    .lt("updated_at", thirtyMinAgo.toISOString());
```

Replace with:

```typescript
  const { data: stuckGenerating } = await ctx.supabase
    .from("cases")
    .select("id, email, charge_type, tier, updated_at, batch_id")
    .eq("status", "generating")
    .lt("updated_at", twoHoursAgo.toISOString());
```

Also update the comment at line 128:
```typescript
// PART 5: STUCK "GENERATING" DETECTION
```
To:
```typescript
// PART 5: STUCK "GENERATING" DETECTION (2h threshold, accounts for Batch API latency)
```

- [ ] **Step 2: Do the same for `detectStuckIBGeneration`**

Find `detectStuckIBGeneration` (around line 190). Apply the same 30-min → 2h change for the `auto-generating` and `compiling` status queries.

- [ ] **Step 3: Fix C1, "8-step" → "5-step" on checkout page**

In `src/app/checkout/page.tsx` (around line 390), search for "8-step" or "8 step" and replace with "5-step". The system prompt enforces exactly 5 steps, the copy must match.

- [ ] **Step 4: Fix C1 on sample page**

In `src/app/sample/page.tsx` (around line 122), search for "8-step" or "8 step" and replace with "5-step".

- [ ] **Step 5: Fix H1, drip Days 4-7 push X-Ray → Intelligence Brief**

In `src/lib/drip-emails.ts`, find the keys `post_case_decoder_discovery_question` and `post_case_decoder_upsell`. These emails push X-Ray ($2,497) too early, they should push Intelligence Brief ($997) first (next rung on the value ladder).

Replace references to X-Ray/discovery in these specific email bodies with Intelligence Brief. Change pricing from $2,497 to $997, and update the CTA to point to the IB checkout.

- [ ] **Step 6: Fix H2, "Section 10" reference**

In `src/lib/drip-emails.ts`, find the key `post_case_decoder_meeting_prep` (Day 3 email). Find "Section 10 of your report" and replace with "the 'Your Next 7 Days' section of your report", reports don't have numbered sections.

- [ ] **Step 7: Build check**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && npx tsc,noEmit,skipLibCheck && npx next build
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/cron/operator-alerts.ts src/app/checkout/page.tsx src/app/sample/page.tsx src/lib/drip-emails.ts
git commit -m "fix: stuck detection 30m→2h for batch latency + QA fixes (C1, H1, H2)

- Part 5: increase stuck threshold from 30 min to 2 hours (batch latency)
- C1: fix '8-step' → '5-step' on checkout + sample pages (matches system prompt)
- H1: drip Days 4-7 push Intelligence Brief not X-Ray (value ladder)
- H2: fix 'Section 10' → 'Your Next 7 Days' (reports have no numbered sections)"
```

---

## Verification Checklist

After all tasks are complete:

1. **Build passes:** `npx next build` exits 0
2. **TypeScript clean:** `npx tsc,noEmit,skipLibCheck` exits 0
3. **Test script validates quality:** `test-reports/batch-test-report.md` has all expected sections
4. **DB column exists:** `batch_id` column on `cases` table confirmed
5. **Cron-job.org registered:** `batch-poll` job running every 5 min
6. **Worker submits batch:** `node scripts/generate-worker.mjs` (with a test case) submits batch and exits
7. **No synchronous CD calls remain:** Search `generate-report/index.ts` for CD handler, confirms batch path, not `callClaudeAPI`
8. **IB Phase B unchanged:** `handleIBPhaseB` still calls `callClaudeForSection` sequentially
9. **Part 5 threshold is 2h:** `grep "Hours\|hours" src/lib/cron/operator-alerts.ts` confirms

## Rollback Plan

Each task is a separate commit. To rollback any step:
```bash
git revert <commit-sha>
```

If the entire migration needs rollback, revert commits in reverse order (Task 8 → Task 1). The batch poller gracefully handles "no pending batches" (returns empty result). The cron-job.org job can be disabled via their dashboard.
