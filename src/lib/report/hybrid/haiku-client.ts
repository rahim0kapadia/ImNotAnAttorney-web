/**
 * Minimal Anthropic SDK wrapper for per-slot Haiku 4.5 calls.
 *
 * Handles retry with jittered exponential backoff on transient API
 * errors (500/502/503/504/529 overloaded). Returns plain string text
 * + per-call token/cost accounting for the orchestrator to aggregate.
 *
 * Prompt-caching is NOT set here because each slot prompt is one-shot
 * per report (no shared prefix worth caching across slots in the same
 * generation). If CD volume rises, consider caching a shared preamble.
 */
import Anthropic from "@anthropic-ai/sdk";

export type HaikuResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

// Haiku 4.5 pricing as of 2026-04. Update if Anthropic pricing changes.
// https://docs.anthropic.com/en/docs/about-claude/pricing
const PRICE_PER_MTOK_INPUT_USD = 1.0;
const PRICE_PER_MTOK_OUTPUT_USD = 5.0;

const RETRY_STATUSES = new Set([500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 3;

function jitteredBackoffMs(attempt: number): number {
  // attempt=1 → ~250-500ms, attempt=2 → ~500-1000ms
  const base = 250 * Math.pow(2, attempt - 1);
  return base + Math.floor(Math.random() * base);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callHaiku(
  apiKey: string,
  system: string,
  user: string,
  opts?: { maxTokens?: number },
): Promise<HaikuResult> {
  const client = new Anthropic({ apiKey });
  const maxTokens = opts?.maxTokens ?? 1024;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      });
      const block = resp.content.find((b) => b.type === "text");
      const text = block && block.type === "text" ? block.text : "";
      const inputTokens = resp.usage?.input_tokens ?? 0;
      const outputTokens = resp.usage?.output_tokens ?? 0;
      const costUsd =
        (inputTokens / 1_000_000) * PRICE_PER_MTOK_INPUT_USD +
        (outputTokens / 1_000_000) * PRICE_PER_MTOK_OUTPUT_USD;
      return { text, inputTokens, outputTokens, costUsd };
    } catch (err) {
      lastErr = err;
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status?: number }).status)
          : 0;
      if (!RETRY_STATUSES.has(status) || attempt >= MAX_ATTEMPTS) {
        throw err;
      }
      await sleep(jitteredBackoffMs(attempt));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("[haiku-client] unknown failure after retries");
}
