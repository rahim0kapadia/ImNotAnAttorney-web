#!/usr/bin/env node
// test-isolation-na: Anthropic API plus local test-reports directory only, no Supabase writes
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local without dotenv dependency
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

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
